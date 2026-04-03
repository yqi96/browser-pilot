# browser-pilot

> Give AI agents a real browser. One command to install.

A lightweight MCP server that wraps [chrome-devtools-mcp](https://developer.chrome.com/blog/chrome-devtools-mcp) with automatic Chrome lifecycle management — works with Claude Code, Codex CLI, and Gemini CLI out of the box.

## Install

```bash
npx @yqi96/browser-pilot-install
```

Detects which AI clients you have installed and registers itself automatically.

```bash
# Target a specific client
npx @yqi96/browser-pilot-install --client claude
npx @yqi96/browser-pilot-install --client codex
npx @yqi96/browser-pilot-install --client gemini
```

## What it does

- **Auto-launches Chrome** on first use (macOS / Linux / Windows)
- **Adds lifecycle tools** — `browser_open`, `browser_close`
- **Proxies all chrome-devtools-mcp tools** transparently (navigate, click, screenshot, fill forms, …)
- **Returns screenshots as base64** for direct multimodal AI processing

## Supported clients

| Client | Status | Skill command |
|--------|--------|---------------|
| Claude Code | ✅ Supported | `/browser` |
| Codex CLI | ✅ Supported | `$browser` |
| Gemini CLI | ⚡ Best-effort | `activate_skill("browser")` |

## Usage

Once installed, your AI client gains `mcp__browser__*` tools:

```
1. mcp__browser__browser_open    — launch Chrome
2. mcp__browser__navigate_page   — go to a URL
3. mcp__browser__take_snapshot   — read page content
4. mcp__browser__click / fill / press_key / ...
5. mcp__browser__browser_close   — clean up
```

Or use the `/browser` skill in Claude Code for guided automation.

## Configuration

| Flag | Env var | Default | Description |
|------|---------|---------|-------------|
| `--port N` | `BROWSER_PILOT_PORT` | auto | Chrome remote debugging port |
| `--launch` | `BROWSER_PILOT_AUTO_LAUNCH=1` | off | Auto-launch Chrome on start |
| `--user-data-dir PATH` | `BROWSER_PILOT_USER_DATA_DIR` | temp dir | Chrome profile directory |

## Manual registration

```bash
# Claude Code
claude mcp add browser --scope user --transport stdio -- npx browser-pilot --launch

# Codex
codex mcp add browser -- npx browser-pilot --launch
```

## Uninstall

```bash
git clone https://github.com/yqi96/browser-pilot && cd browser-pilot
npm install && npm run build
node dist/uninstall.js --client all
```

## Development

```bash
git clone https://github.com/yqi96/browser-pilot
cd browser-pilot
npm install
npm run build
npm run dev       # ts-node hot reload
./install.sh      # install for all detected clients
```

## Architecture

```
Claude Code / Codex / Gemini
        │ stdio (MCP)
        ▼
  browser-pilot          ← this project
  (lifecycle + proxy)
        │ stdio (MCP)
        ▼
  chrome-devtools-mcp
        │ CDP
        ▼
     Chrome
```

## License

MIT
