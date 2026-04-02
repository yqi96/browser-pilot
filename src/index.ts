#!/usr/bin/env node
/**
 * claude-browser-mcp
 *
 * A thin MCP server that:
 *  1. Optionally auto-launches Chrome with remote debugging
 *  2. Spawns chrome-devtools-mcp as an upstream MCP client
 *  3. Proxies all tools to Claude Code (or any MCP host) via stdio
 *
 * Usage:
 *   node dist/index.js [--port 9222] [--launch] [--user-data-dir <path>]
 *
 * Env vars:
 *   BROWSER_MCP_PORT          CDP port (default: 9222)
 *   BROWSER_MCP_AUTO_LAUNCH   Set to "1" to auto-launch Chrome
 *   BROWSER_MCP_USER_DATA_DIR Chrome user data dir (optional)
 */

import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function flagValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const CDP_PORT = Number(flagValue("--port") ?? process.env["BROWSER_MCP_PORT"] ?? 9222);
const AUTO_LAUNCH =
  args.includes("--launch") || process.env["BROWSER_MCP_AUTO_LAUNCH"] === "1";
// When auto-launching, use a fixed dir so chrome-devtools-mcp can find DevToolsActivePort.
// Falls back to the default only when attaching to a manually-started Chrome.
const USER_DATA_DIR =
  flagValue("--user-data-dir") ?? process.env["BROWSER_MCP_USER_DATA_DIR"];

// ---------------------------------------------------------------------------
// Chrome helpers
// ---------------------------------------------------------------------------

function isChromeDebuggingAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

const CHROME_EXECUTABLES: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "google-chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
};

function hasDisplay(): boolean {
  // On Linux, check DISPLAY; on macOS/Windows a display is always available.
  if (process.platform === "linux") {
    return Boolean(process.env["DISPLAY"] || process.env["WAYLAND_DISPLAY"]);
  }
  return true;
}

function launchChrome(port: number, userDataDir?: string): void {
  const exe = CHROME_EXECUTABLES[process.platform] ?? "google-chrome";
  // Chrome remote debugging requires a non-default user-data-dir
  const dataDir = userDataDir ?? path.join(os.tmpdir(), "claude-browser-mcp-profile");
  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${dataDir}`,
  ];
  if (!hasDisplay()) {
    // No display available, fall back to headless
    chromeArgs.push("--headless=new", "--no-sandbox");
  }
  // Detach so Chrome outlives this process
  spawn(exe, chromeArgs, { detached: true, stdio: "ignore" }).unref();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureChrome(port: number, userDataDir?: string): Promise<void> {
  if (await isChromeDebuggingAvailable(port)) {
    return;
  }
  if (!AUTO_LAUNCH) {
    throw new Error(
      `Chrome remote debugging not available on port ${port}.\n` +
        `Start Chrome with --remote-debugging-port=${port}, or pass --launch to auto-start.`,
    );
  }
  launchChrome(port, userDataDir);
  // Wait up to 8 s for Chrome to become ready
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    if (await isChromeDebuggingAvailable(port)) {
      return;
    }
  }
  throw new Error(`Chrome did not become ready on port ${port} within 8 s.`);
}

// ---------------------------------------------------------------------------
// chrome-devtools-mcp upstream client
// ---------------------------------------------------------------------------

function buildUpstreamArgs(port: number, userDataDir?: string): string[] {
  const base = [
    "-y",
    "chrome-devtools-mcp@latest",
    "--browserUrl",
    `http://127.0.0.1:${port}`,
    "--experimentalStructuredContent",
    "--experimental-page-id-routing",
  ];
  if (userDataDir) {
    base.push("--userDataDir", userDataDir);
  }
  return base;
}

async function createUpstreamClient(port: number, userDataDir?: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "npx",
    args: buildUpstreamArgs(port, userDataDir),
    stderr: "pipe",
  });

  const client = new Client({ name: "claude-browser-mcp-proxy", version: "1.0.0" }, {});
  await client.connect(transport);

  // Verify the expected tool surface is available
  const { tools } = await client.listTools();
  if (!tools.some((t) => t.name === "list_pages")) {
    await client.close();
    throw new Error("chrome-devtools-mcp did not expose expected tools (list_pages missing).");
  }

  return client;
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await ensureChrome(CDP_PORT, USER_DATA_DIR);

  const upstream = await createUpstreamClient(CDP_PORT, USER_DATA_DIR);
  const { tools } = await upstream.listTools();

  const server = new Server(
    { name: "claude-browser-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolArgs = (request.params.arguments as Record<string, unknown>) ?? {};

    // Intercept take_screenshot: inject a temp filePath, then return the image
    // as base64 content so Claude can see it directly (multimodal).
    if (request.params.name === "take_screenshot") {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "browser-mcp-"));
      const format = (toolArgs["format"] as string | undefined) ?? "png";
      const filePath = path.join(tmpDir, `screenshot.${format}`);
      try {
        await upstream.callTool({
          name: "take_screenshot",
          arguments: { ...toolArgs, filePath },
        });
        const buf = await fs.readFile(filePath);
        return {
          content: [
            {
              type: "image",
              data: buf.toString("base64"),
              mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
            },
          ],
        };
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    return await upstream.callTool({
      name: request.params.name,
      arguments: toolArgs,
    });
  });

  // Clean up upstream on server close
  process.on("SIGINT", async () => {
    await upstream.close().catch(() => {});
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await upstream.close().catch(() => {});
    process.exit(0);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(`[claude-browser-mcp] fatal: ${String(err)}\n`);
  process.exit(1);
});
