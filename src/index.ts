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
import { randomUUID } from "node:crypto";
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
// Session state
// ---------------------------------------------------------------------------

interface SessionState {
  client: Client;
  chromePid: number | undefined;
  chromePort: number;
}

const sessions = new Map<string, SessionState>();

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

const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

const CHROME_EXECUTABLES: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "google-chrome",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
};

const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: "image/jpeg",
  webp: "image/webp",
  png: "image/png",
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

function launchChrome(port: number, userDataDir?: string): number | undefined {
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
  proc.unref();
  return proc.pid;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensure Chrome is reachable for remote debugging.
 * Returns { port, chromePid } — chromePid is set only when we launched Chrome.
 *
 * For the first session with an explicit port, attaches to existing Chrome if
 * available. For additional sessions (or when no explicit port was given),
 * always launches a fresh Chrome on a free port so sessions are isolated.
 */
async function ensureChrome(
  isFirstSession: boolean,
  userDataDir?: string,
): Promise<{ port: number; chromePid: number | undefined }> {
  // For the first session with an explicit port, try attaching to existing Chrome.
  if (isFirstSession && EXPLICIT_PORT) {
    if (await isChromeDebuggingAvailable(CDP_PORT)) {
      return { port: CDP_PORT, chromePid: undefined };
    }
  }

  if (!AUTO_LAUNCH) {
    throw new Error(
      `Chrome remote debugging not available on port ${CDP_PORT}.\n` +
        `Start Chrome with --remote-debugging-port=${CDP_PORT}, or pass --launch to auto-start.`,
    );
  }

  // Always launch a new isolated Chrome on a free port.
  const launchPort = await findFreePort();
  const chromePid = launchChrome(launchPort, userDataDir);

  // Wait up to 8 s for Chrome to become ready.
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    if (await isChromeDebuggingAvailable(launchPort)) {
      return { port: launchPort, chromePid };
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
    command: NPX,
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
    "Must be called before using any other browser tools. " +
    "Returns a session_id — pass it as _browser_session to all subsequent browser tool calls " +
    "so that parallel agents each get their own isolated browser instance.",
  inputSchema: {
    type: "object",
    properties: {
      session_id: {
        type: "string",
        description:
          "Optional session identifier. If omitted, a UUID is generated automatically. " +
          "Use a stable ID (e.g. the agent's task ID) so you can reuse the same session " +
          "across multiple tool calls without reopening the browser.",
      },
    },
    required: [],
  },
};

const BROWSER_CLOSE_TOOL = {
  name: "browser_close",
  description:
    "Close the browser and disconnect. " +
    "Stops the Chrome process that was started by browser_open. " +
    "Pass session_id to close a specific session; omit to close all sessions.",
  inputSchema: {
    type: "object",
    properties: {
      session_id: {
        type: "string",
        description: "Session to close. Omit to close all open sessions.",
      },
    },
    required: [],
  },
};

/**
 * Inject _browser_session into every upstream tool's inputSchema so agents
 * can route calls to the correct isolated browser session.
 */
function injectSessionParam(tool: Record<string, unknown>): Record<string, unknown> {
  const schema = (tool["inputSchema"] as Record<string, unknown> | undefined) ?? {
    type: "object",
    properties: {},
  };
  const properties = (schema["properties"] as Record<string, unknown> | undefined) ?? {};
  return {
    ...tool,
    inputSchema: {
      ...schema,
      properties: {
        ...properties,
        _browser_session: {
          type: "string",
          description:
            "Session ID returned by browser_open. " +
            "Required when multiple browser sessions are open in parallel; " +
            "omit when only one session is active.",
        },
      },
    },
  };
}

/**
 * Probe chrome-devtools-mcp for its tool schemas without launching Chrome.
 * MCP tool definitions are static; the upstream process lists them regardless
 * of whether a browser is reachable.  We spawn it with a dummy URL, list
 * tools, then tear it down — takes ~1-2 s on first run (npx cache warms up).
 */
async function probeUpstreamSchemas(): Promise<unknown[]> {
  const transport = new StdioClientTransport({
    command: NPX,
    args: ["-y", "chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:1"],
    stderr: "pipe",
  });
  const client = new Client({ name: "browser-pilot-probe", version: "1.0.0" }, {});
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    return tools.map((t) => injectSessionParam(t as Record<string, unknown>));
  } catch {
    return [];
  } finally {
    await client.close().catch(() => {});
  }
}

async function main(): Promise<void> {
  // Probe upstream schemas at startup (no Chrome needed).
  // This gives the model the full tool list from conversation turn 1.
  const upstreamSchemas = await probeUpstreamSchemas();

  async function openSession(sessionId: string): Promise<void> {
    if (sessions.has(sessionId)) {
      // Chrome may have been closed externally — verify it's still reachable.
      const existing = sessions.get(sessionId)!;
      if (await isChromeDebuggingAvailable(existing.chromePort)) return;
      // Stale session: clean up silently and relaunch below.
      await existing.client.close().catch(() => {});
      sessions.delete(sessionId);
    }
    const isFirstSession = sessions.size === 0;
    const { port, chromePid } = await ensureChrome(isFirstSession, USER_DATA_DIR);
    const client = await createUpstreamClient(port, USER_DATA_DIR);
    sessions.set(sessionId, { client, chromePid, chromePort: port });
  }

  async function closeSession(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) return;
    await session.client.close().catch(() => {});
    if (session.chromePid !== undefined) {
      try {
        process.kill(session.chromePid);
      } catch {}
    }
    sessions.delete(sessionId);
  }

  async function closeAllSessions(): Promise<void> {
    for (const sessionId of [...sessions.keys()]) {
      await closeSession(sessionId);
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
      const sessionId = (toolArgs["session_id"] as string | undefined) ?? randomUUID();
      await openSession(sessionId);
      return {
        content: [
          {
            type: "text",
            text: `Browser opened. Session: ${sessionId}\nPass _browser_session="${sessionId}" to all subsequent browser tool calls.`,
          },
        ],
      };
    }

    if (request.params.name === "browser_close") {
      const sessionId = toolArgs["session_id"] as string | undefined;
      if (sessionId) {
        await closeSession(sessionId);
        return { content: [{ type: "text", text: `Browser session ${sessionId} closed.` }] };
      } else {
        await closeAllSessions();
        return { content: [{ type: "text", text: "All browser sessions closed." }] };
      }
    }

    // Route to the correct session.
    const requestedSession = toolArgs["_browser_session"] as string | undefined;
    const forwardArgs = { ...toolArgs };
    delete forwardArgs["_browser_session"];

    if (!requestedSession) {
      return {
        content: [
          {
            type: "text",
            text: "Missing _browser_session. Call browser_open() first and pass the returned session ID as _browser_session to every browser tool call.",
          },
        ],
        isError: true,
      };
    }

    const session = sessions.get(requestedSession);
    if (!session) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown browser session "${requestedSession}". Call browser_open() first.`,
          },
        ],
        isError: true,
      };
    }

    const upstreamClient = session!.client;

    // Intercept take_screenshot: inject a temp filePath, then return the image
    // as base64 content so Claude can see it directly (multimodal).
    if (request.params.name === "take_screenshot") {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "browser-pilot-"));
      const format = (forwardArgs["format"] as string | undefined) ?? "png";
      const filePath = path.join(tmpDir, `screenshot.${format}`);
      try {
        await upstreamClient.callTool({
          name: "take_screenshot",
          arguments: { ...forwardArgs, filePath },
        });
        const buf = await fs.readFile(filePath);
        return {
          content: [
            {
              type: "image",
              data: buf.toString("base64"),
              mimeType: MIME_BY_FORMAT[format] ?? "image/png",
            },
          ],
        };
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    // Wrap all upstream calls: if the call fails and Chrome is no longer
    // reachable, clean up the stale session and return a clear recovery message.
    async function callUpstream(name: string, toolArguments: Record<string, unknown>) {
      try {
        return await upstreamClient.callTool({ name, arguments: toolArguments });
      } catch (err) {
        if (!await isChromeDebuggingAvailable(session!.chromePort)) {
          await session!.client.close().catch(() => {});
          sessions.delete(requestedSession!);
          return {
            content: [
              {
                type: "text",
                text: `Browser session "${requestedSession}" is no longer available — Chrome was closed externally. Call browser_open() again to restart it.`,
              },
            ],
            isError: true,
          };
        }
        throw err;
      }
    }

    if (request.params.name === "take_screenshot") {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "browser-pilot-"));
      const format = (forwardArgs["format"] as string | undefined) ?? "png";
      const filePath = path.join(tmpDir, `screenshot.${format}`);
      try {
        await callUpstream("take_screenshot", { ...forwardArgs, filePath });
        const buf = await fs.readFile(filePath);
        return {
          content: [
            {
              type: "image",
              data: buf.toString("base64"),
              mimeType: MIME_BY_FORMAT[format] ?? "image/png",
            },
          ],
        };
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    return await callUpstream(request.params.name, forwardArgs);
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
    await closeAllSessions();
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
