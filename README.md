# browser-pilot

> Give AI agents a real browser. One command to install.

A lightweight MCP server that wraps [chrome-devtools-mcp](https://developer.chrome.com/blog/chrome-devtools-mcp) with automatic Chrome lifecycle management — works with Claude Code, Codex CLI, and Gemini CLI out of the box.

![demo](assets/demo.png)

## Install

```bash
npx --package=@yqi96/browser-pilot browser-pilot-install
```

Detects which AI clients you have installed and registers itself automatically.

```bash
# Target a specific client
npx --package=@yqi96/browser-pilot browser-pilot-install --client claude
npx --package=@yqi96/browser-pilot browser-pilot-install --client codex
npx --package=@yqi96/browser-pilot browser-pilot-install --client gemini
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

## Uninstall

```bash
npx --package=@yqi96/browser-pilot browser-pilot-uninstall
```

## Contributing

Found a bug? Open an issue or, if you have Claude Code, clone the repo and let it fix it:

```bash
git clone https://github.com/yqi96/browser-pilot && cd browser-pilot && claude
```

PRs are welcome!

## License

MIT
