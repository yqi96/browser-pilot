# browser-mcp

`browser-mcp` is a thin MCP proxy around [`chrome-devtools-mcp`](https://www.npmjs.com/package/chrome-devtools-mcp).
It lets Codex CLI and Claude Code drive a real Chrome instance through MCP tools.

```
Codex / Claude Code <-> browser-mcp (stdio) <-> chrome-devtools-mcp (stdio) <-> Chrome DevTools Protocol
```

## Highlights

- Exposes full browser tool schemas immediately on startup (no browser required for `list_tools`)
- Adds explicit lifecycle tools:
  - `browser_open`: launch/connect browser
  - `browser_close`: disconnect and close auto-launched browser
- Proxies all upstream `chrome-devtools-mcp` tools
- Enhances `take_screenshot` by returning image content directly to the MCP host
- Supports auto-launch with isolated user data directories

## Requirements

- Node.js 18+
- Google Chrome / Chromium
- [Codex CLI](https://github.com/openai/codex) and/or [Claude Code](https://claude.ai/code)

## Install

```bash
git clone <your-repo-url>
cd browser-mcp
npm install
npm run build
```

Optional global install:

```bash
npm install -g .
```

## Quick Start

Run with auto-launch:

```bash
node dist/index.js --launch
```

Then in your MCP client:

1. Call `browser_open`
2. Use `mcp__browser__*` tools (`new_page`, `navigate_page`, `take_snapshot`, etc.)
3. Call `browser_close` when finished

If you call a browser tool before `browser_open`, the server returns:
`Browser is not open. Call browser_open first.`

## CLI Flags and Environment Variables

| Flag | Env var | Default | Description |
|------|---------|---------|-------------|
| `--port <n>` | `BROWSER_MCP_PORT` | `9222` | Preferred Chrome debug port |
| `--launch` | `BROWSER_MCP_AUTO_LAUNCH=1` | off | Auto-launch Chrome if port is unavailable |
| `--user-data-dir <path>` | `BROWSER_MCP_USER_DATA_DIR` | temp profile | Chrome profile directory |

Port behavior with `--launch`:

- If `--port` (or `BROWSER_MCP_PORT`) is explicitly set, that port is used.
- If no explicit port is set, browser-mcp finds a free local port to avoid conflicts (useful for multiple sessions).

## Connect to Codex CLI

```bash
codex mcp add browser -- node /absolute/path/to/browser-mcp/dist/index.js --launch
```

Or add manually in `~/.codex/config.toml`:

```toml
[mcp_servers.browser]
command = "node"
args = ["/absolute/path/to/browser-mcp/dist/index.js", "--launch"]
enabled = true
```

## Connect to Claude Code

```bash
claude mcp add browser --scope user --transport stdio -- node /absolute/path/to/browser-mcp/dist/index.js --launch
```

Install the `/browser` command:

```bash
cp skills/browser.md ~/.claude/commands/browser.md
```

## One-Command Installer

`install.sh` builds, registers MCP server, and installs skill/command helpers.

```bash
# Both Codex + Claude Code (default)
./install.sh

# Codex only
TARGET_CLIENT=codex ./install.sh

# Claude Code only
TARGET_CLIENT=claude ./install.sh
```

Optional environment overrides:

- `MCP_NAME` (default `browser`)
- `SKILL_NAME` (default `browser`)
- `TARGET_CLIENT` (`codex|claude|both`)

## Tool Surface

`browser-mcp` exposes:

- `browser_open`
- `browser_close`
- Full upstream `chrome-devtools-mcp` tools (for example: `list_pages`, `new_page`, `navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`, `evaluate_script`, `wait_for`, etc.)

Notes:

- Upstream tools are schema-probed at startup via a lightweight process using a dummy browser URL, so your model can see tool definitions before Chrome is opened.
- `take_screenshot` is intercepted to return image content directly to the MCP host (instead of only writing a file).

## Manual Chrome Mode

If you do not use `--launch`, start Chrome yourself with remote debugging first:

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --no-first-run

# Linux
google-chrome --remote-debugging-port=9222 --no-first-run

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

Then start server:

```bash
node dist/index.js --port 9222
```

## Linux Display Fallback

On Linux auto-launch:

- If an X11/Wayland display is available, Chrome is launched normally.
- If no display is detected, Chrome is launched in headless mode.

## Development

```bash
# Build
npm run build

# Dev mode
npm run dev -- --launch
```

## License

MIT
