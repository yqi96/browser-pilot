# browser-pilot

> Give AI agents a real browser. One command to install.

A lightweight MCP server that wraps [chrome-devtools-mcp](https://developer.chrome.com/blog/chrome-devtools-mcp) with automatic Chrome lifecycle management — works with Claude Code, Codex CLI, and Gemini CLI out of the box.

## What can you do with it?

- **Deep web research** — crawl multi-page sites, extract structured data, summarize articles, compare prices across tabs
- **Form automation** — fill and submit forms, upload files, interact with SPAs and dynamic content
- **Human-in-the-loop** — AI handles the tedious parts, pauses when a CAPTCHA or login appears, you solve it, AI continues
- **Screenshot & visual analysis** — capture pages and let the AI reason about layout, content, or visual changes
- **Scraping without APIs** — access any site a human can open, no API key required

<video src="https://github.com/yqi96/browser-pilot/releases/download/v1.1.1/demo.mp4" controls width="100%"></video>

## Requirements

- Node.js `^20.19.0`, `^22.12.0`, or `>=23` (required by chrome-devtools-mcp)
- npm `>=7`

## Install

```bash
npx --package=@yqi96/browser-pilot@latest browser-pilot-install
```

Detects which AI clients you have installed and registers itself automatically.

```bash
# Target a specific client
npx --package=@yqi96/browser-pilot@latest browser-pilot-install --client claude
npx --package=@yqi96/browser-pilot@latest browser-pilot-install --client codex
npx --package=@yqi96/browser-pilot@latest browser-pilot-install --client gemini
```

## What it does

- **Auto-launches Chrome** on first use (macOS / Linux / Windows)
- **Adds lifecycle tools** — `browser_open`, `browser_close`
- **Proxies all chrome-devtools-mcp tools** transparently (navigate, click, screenshot, fill forms, …)
- **Returns screenshots as base64** for direct multimodal AI processing
- **Parallel-agent safe** — each agent gets its own isolated Chrome instance via session IDs

## Parallel agents

When multiple subagents run concurrently, each one calls `browser_open()` independently and gets back a unique `session_id`. Every subsequent browser tool call passes that ID via `_browser_session`, so agents never interfere with each other:

```
# Agent A                                    # Agent B (concurrent)
browser_open()                               browser_open()
→ Session: abc-123                           → Session: def-456

navigate_page(url="...",                     navigate_page(url="...",
  _browser_session="abc-123")                  _browser_session="def-456")

browser_close(session_id="abc-123")          browser_close(session_id="def-456")
```

If Chrome is closed externally mid-session, the next tool call returns a clear error telling the agent to call `browser_open()` again — no manual cleanup needed.

## Supported clients

| Client | Status | Skill command |
|--------|--------|---------------|
| Claude Code | ✅ Supported | `/browser` |
| Codex CLI | ✅ Supported | `$browser` |
| Gemini CLI | ✅ Supported | `activate_skill("browser")` |

## Uninstall

```bash
npx --package=@yqi96/browser-pilot@latest browser-pilot-uninstall
```

## Contributing

Found a bug? Open an issue or, if you have Claude Code, clone the repo and let it fix it:

```bash
git clone https://github.com/yqi96/browser-pilot && cd browser-pilot && claude
```

PRs are welcome!

## License

MIT
