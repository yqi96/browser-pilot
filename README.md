# browser-pilot

Browser MCP server for AI agents. Wraps [chrome-devtools-mcp](https://github.com/mrexodia/chrome-devtools-mcp) with automatic Chrome lifecycle management.

## Features

- Auto-launches Chrome (macOS/Linux/Windows)
- Exposes `browser_open` / `browser_close` lifecycle tools
- Proxies all chrome-devtools-mcp tools transparently
- Screenshots returned as base64 for multimodal AI

## Quick Install

```bash
npx browser-pilot-install
# or for a specific client:
npx browser-pilot-install --client claude
npx browser-pilot-install --client codex
npx browser-pilot-install --client gemini
```

## Supported Clients

| Client | Status | Skill trigger |
|--------|--------|---------------|
| Claude Code | Supported | `/browser` |
| Codex CLI | Supported | `$browser` |
| Gemini CLI | Best-effort | `activate_skill("browser")` |

## Uninstall

```bash
node dist/uninstall.js --client all
```

## Manual Setup (git clone)

```bash
git clone https://github.com/YOUR_USER/browser-pilot
cd browser-pilot
./install.sh                          # installs for all detected clients
TARGET_CLIENT=claude ./install.sh     # claude only
```

## MCP Server Configuration

The MCP server command is: `npx browser-pilot --launch`

Or manually add to your client config:

- **Claude Code**: `claude mcp add browser --scope user --transport stdio -- npx browser-pilot --launch`
- **Codex**: `codex mcp add browser -- npx browser-pilot --launch`

## Configuration

| Flag | Env | Default | Description |
|------|-----|---------|-------------|
| `--port N` | `BROWSER_MCP_PORT` | auto | Chrome remote debugging port |
| `--launch` | `BROWSER_MCP_AUTO_LAUNCH=1` | off | Auto-launch Chrome on start |
| `--user-data-dir PATH` | `BROWSER_MCP_USER_DATA_DIR` | temp | Chrome user data directory |

## Usage

1. Open browser: use `mcp__browser__browser_open` tool
2. Use any `mcp__browser__*` tools (navigate, click, screenshot, etc.)
3. Close browser: use `mcp__browser__browser_close` tool

## Development

```bash
git clone https://github.com/YOUR_USER/browser-pilot
cd browser-pilot
npm install
npm run build
npm run dev  # runs with ts-node
```

## License

MIT
