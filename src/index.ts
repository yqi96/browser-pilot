#!/usr/bin/env node
/**
 * browser-pilot
 *
 * A thin MCP server that:
 *  1. Optionally auto-launches Chrome with remote debugging
 *  2. Spawns chrome-devtools-mcp as an upstream MCP client
 *  3. Proxies all tools to Codex/Claude (or any MCP host) via stdio
 *
 * Usage:
 *   node dist/index.js [--port 9222] [--launch] [--user-data-dir <path>]
 *
 * Env vars:
 *   BROWSER_PILOT_PORT          CDP port (default: 9222, ignored when auto-launching without --port)
 *   BROWSER_PILOT_AUTO_LAUNCH   Set to "1" to auto-launch Chrome
 *   BROWSER_PILOT_USER_DATA_DIR Chrome user data dir (optional)
 */

import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
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

const EXPLICIT_PORT = flagValue("--port") !== undefined || process.env["BROWSER_PILOT_PORT"] !== undefined;
const CDP_PORT = Number(flagValue("--port") ?? process.env["BROWSER_PILOT_PORT"] ?? 9222);
const AUTO_LAUNCH =
  args.includes("--launch") || process.env["BROWSER_PILOT_AUTO_LAUNCH"] === "1";
const USER_DATA_DIR =
  flagValue("--user-data-dir") ?? process.env["BROWSER_PILOT_USER_DATA_DIR"];

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

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

const CHROME_EXECUTABLES: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "google-chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
};

/**
 * Detect the X11 display even when DISPLAY isn't inherited by the MCP subprocess.
 * Returns the display string (e.g. ":1") or undefined if none found.
 */
function detectX11Display(): string | undefined {
  if (process.env["DISPLAY"]) return process.env["DISPLAY"];
  // Check X11 unix sockets — present whenever an X server is running,
  // regardless of whether DISPLAY was passed to this subprocess.
  try {
    const sockets = readdirSync("/tmp/.X11-unix");
    if (sockets.length > 0) {
      // socket names are like "X0", "X1" → display ":0", ":1"
      return `:${sockets[0]!.replace(/^X/, "")}`;
    }
  } catch {}
  return undefined;
}

function hasDisplay(): boolean {
  if (process.platform !== "linux") return true;
  if (process.env["WAYLAND_DISPLAY"]) return true;
  return detectX11Display() !== undefined;
}

// PID of Chrome we auto-launched, so we can clean it up on exit.
let launchedChromePid: number | undefined;

function launchChrome(port: number, userDataDir?: string): void {
  const exe = CHROME_EXECUTABLES[process.platform] ?? "google-chrome";
  const dataDir = userDataDir ?? path.join(os.tmpdir(), `browser-pilot-profile-${port}`);
  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${dataDir}`,
  ];

  // Build env: explicitly inject the detected display so Chrome can open a
  // window even when the MCP subprocess didn't inherit DISPLAY.
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (process.platform === "linux") {
    const display = detectX11Display();
    if (display) {
      env["DISPLAY"] = display;
    } else if (process.env["WAYLAND_DISPLAY"]) {
      // Wayland: nothing extra needed, env already has it
    } else {
      // No display found — run headless
      chromeArgs.push("--headless=new", "--no-sandbox");
    }
  }

  const proc = spawn(exe, chromeArgs, { detached: true, stdio: "ignore", env });
  launchedChromePid = proc.pid;
  proc.unref();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensure Chrome is reachable for remote debugging.
 * Returns the port Chrome is listening on (may differ from requestedPort when
 * auto-launching without an explicit --port flag).
 */
async function ensureChrome(requestedPort: number, userDataDir?: string): Promise<number> {
  // Attach to an already-running Chrome if possible.
  if (await isChromeDebuggingAvailable(requestedPort)) {
    return requestedPort;
  }
  if (!AUTO_LAUNCH) {
    throw new Error(
      `Chrome remote debugging not available on port ${requestedPort}.\n` +
        `Start Chrome with --remote-debugging-port=${requestedPort}, or pass --launch to auto-start.`,
    );
  }

  // When no explicit port was given, find a free port so multiple instances
  // (different Claude Code / Codex sessions) don't collide on 9222.
  const launchPort = EXPLICIT_PORT ? requestedPort : await findFreePort();
  launchChrome(launchPort, userDataDir);

  // Wait up to 8 s for Chrome to become ready.
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    if (await isChromeDebuggingAvailable(launchPort)) {
      return launchPort;
    }
  }
  throw new Error(`Chrome did not become ready on port ${launchPort} within 8 s.`);
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

  const client = new Client({ name: "browser-pilot-proxy", version: "1.0.0" }, {});
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

const BROWSER_OPEN_TOOL = {
  name: "browser_open",
  description:
    "Launch Chrome and connect to it for browser automation. " +
    "Must be called before using any other browser tools.",
  inputSchema: { type: "object", properties: {}, required: [] },
};

const BROWSER_CLOSE_TOOL = {
  name: "browser_close",
  description:
    "Close the browser and disconnect. " +
    "Stops the Chrome process that was started by browser_open.",
  inputSchema: { type: "object", properties: {}, required: [] },
};

/**
 * Probe chrome-devtools-mcp for its tool schemas without launching Chrome.
 * MCP tool definitions are static; the upstream process lists them regardless
 * of whether a browser is reachable.  We spawn it with a dummy URL, list
 * tools, then tear it down — takes ~1-2 s on first run (npx cache warms up).
 */
async function probeUpstreamSchemas(): Promise<unknown[]> {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:1"],
    stderr: "pipe",
  });
  const client = new Client({ name: "browser-pilot-probe", version: "1.0.0" }, {});
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    return tools;
  } catch {
    return [];
  } finally {
    await client.close().catch(() => {});
  }
}

async function main(): Promise<void> {
  let upstreamClient: Client | undefined;

  // Probe upstream schemas at startup (no Chrome needed).
  // This gives the model the full tool list from conversation turn 1.
  const upstreamSchemas = await probeUpstreamSchemas();

  async function openBrowser(): Promise<void> {
    if (upstreamClient) return; // already open
    const port = await ensureChrome(CDP_PORT, USER_DATA_DIR);
    upstreamClient = await createUpstreamClient(port, USER_DATA_DIR);
  }

  async function closeBrowser(): Promise<void> {
    if (upstreamClient) {
      await upstreamClient.close().catch(() => {});
      upstreamClient = undefined;
    }
    if (launchedChromePid !== undefined) {
      try {
        process.kill(launchedChromePid);
      } catch {}
      launchedChromePid = undefined;
    }
  }

  const server = new Server(
    { name: "browser-pilot", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => {
    // Tool list is static — browser_open/close plus all upstream tools.
    // Chrome does not need to be running; tools return an error if it isn't.
    return { tools: [BROWSER_OPEN_TOOL, BROWSER_CLOSE_TOOL, ...upstreamSchemas] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolArgs = (request.params.arguments as Record<string, unknown>) ?? {};

    if (request.params.name === "browser_open") {
      await openBrowser();
      return { content: [{ type: "text", text: "Browser opened." }] };
    }

    if (request.params.name === "browser_close") {
      await closeBrowser();
      return { content: [{ type: "text", text: "Browser closed." }] };
    }

    if (!upstreamClient) {
      return {
        content: [
          {
            type: "text",
            text: "Browser is not open. Call browser_open first.",
          },
        ],
        isError: true,
      };
    }

    // Intercept take_screenshot: inject a temp filePath, then return the image
    // as base64 content so Claude can see it directly (multimodal).
    if (request.params.name === "take_screenshot") {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "browser-pilot-"));
      const format = (toolArgs["format"] as string | undefined) ?? "png";
      const filePath = path.join(tmpDir, `screenshot.${format}`);
      try {
        await upstreamClient.callTool({
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

    return await upstreamClient.callTool({
      name: request.params.name,
      arguments: toolArgs,
    });
  });

  // Clean up upstream and auto-launched Chrome on exit.
  // Covers three exit paths:
  //   1. SIGINT / SIGTERM  — normal shutdown signals
  //   2. stdin close       — host (Claude Code / Codex) exited without a signal
  //   3. uncaught error    — process about to crash
  let cleaningUp = false;
  async function cleanup(): Promise<void> {
    if (cleaningUp) return;
    cleaningUp = true;
    await closeBrowser();
  }

  process.on("SIGINT", async () => { await cleanup(); process.exit(0); });
  process.on("SIGTERM", async () => { await cleanup(); process.exit(0); });

  // When the MCP host closes the pipe (process exit, IDE restart, etc.),
  // stdin emits 'close'. Clean up Chrome so it doesn't linger.
  process.stdin.on("close", async () => {
    await cleanup();
    process.exit(0);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(`[browser-pilot] fatal: ${String(err)}\n`);
  process.exit(1);
});
