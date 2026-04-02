# claude-browser-mcp

A thin MCP server that wraps [chrome-devtools-mcp](https://www.npmjs.com/package/chrome-devtools-mcp), letting Claude Code control a browser via the Model Context Protocol.

```
Claude Code ←─ stdio ─→ claude-browser-mcp ←─ stdio ─→ chrome-devtools-mcp ←─ CDP ─→ Chrome
```

## Prerequisites

- Node.js 18+
- Google Chrome (or Chromium) installed
- Claude Code CLI

## Installation

```bash
git clone https://github.com/yourname/claude-browser-mcp
cd claude-browser-mcp
npm install
npm run build
```

Or install globally after building:

```bash
npm install -g .
```

## Usage

### Option A — Claude Code already has Chrome running

Start Chrome manually with remote debugging enabled:

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --no-first-run

# Linux
google-chrome --remote-debugging-port=9222 --no-first-run

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

Then run the server:

```bash
node dist/index.js --port 9222
```

### Option B — Auto-launch Chrome

Pass `--launch` and the server will start Chrome automatically if it is not already listening on the given port:

```bash
node dist/index.js --launch
```

### Options

| Flag | Env var | Default | Description |
|------|---------|---------|-------------|
| `--port <n>` | `BROWSER_MCP_PORT` | `9222` | Chrome remote debugging port |
| `--launch` | `BROWSER_MCP_AUTO_LAUNCH=1` | off | Auto-start Chrome when not running |
| `--user-data-dir <path>` | `BROWSER_MCP_USER_DATA_DIR` | Chrome default | Chrome user data directory |

## Connecting to Claude Code

Add an entry to `~/.claude/mcp.json` (global) or `.claude/mcp.json` (project-level):

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["/absolute/path/to/claude-browser-mcp/dist/index.js", "--launch"]
    }
  }
}
```

If installed globally:

```json
{
  "mcpServers": {
    "browser": {
      "command": "claude-browser-mcp",
      "args": ["--launch"]
    }
  }
}
```

Restart Claude Code after editing the config. The `browser` server will appear in the MCP tools list.

## Available tools

All tools are proxied from `chrome-devtools-mcp`. Common ones include:

| Tool | Description |
|------|-------------|
| `list_pages` | List open browser tabs |
| `new_page` | Open a new tab |
| `close_page` | Close a tab |
| `select_page` | Focus a tab |
| `navigate_page` | Navigate to a URL |
| `take_snapshot` | Get the accessibility tree of a page |
| `take_screenshot` | Take a screenshot |
| `click` | Click an element by uid |
| `fill` | Fill an input field |
| `fill_form` | Fill multiple form fields at once |
| `hover` | Hover over an element |
| `press_key` | Press a keyboard key |
| `evaluate_script` | Run JavaScript in a page |
| `handle_dialog` | Accept or dismiss a dialog |
| `wait_for` | Wait for text to appear |

For the full and up-to-date list, run:

```bash
node dist/index.js --launch &
# then ask Claude: "list available browser tools"
```

## Using an isolated Chrome profile

Pass `--user-data-dir` to keep browser state separate from your personal Chrome:

```bash
node dist/index.js --launch --user-data-dir /tmp/claude-chrome-profile
```

Or in `mcp.json`:

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": [
        "/absolute/path/to/claude-browser-mcp/dist/index.js",
        "--launch",
        "--user-data-dir", "/tmp/claude-chrome-profile"
      ]
    }
  }
}
```

## Development

```bash
# Watch mode (requires ts-node)
npx ts-node --esm src/index.ts --launch

# Rebuild
npm run build
```

## License

MIT
