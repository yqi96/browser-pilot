---
name: browser
description: Operate a real browser via mcp__browser__* tools safely and deterministically.
---

# Browser Skill

You are operating a real Chrome browser via the `mcp__browser__*` tools. Follow these rules strictly.

> **CRITICAL**: `mcp__browser__*` are MCP tools, NOT bash commands. Never use `which`, `command -v`, or any shell check to test their availability. Call them directly.

## Core Workflow

### 0. Opening the browser
You MUST call `mcp__browser__browser_open` before any other tools. Each call creates an independent Chrome instance and returns a `session_id`. You MUST pass this `session_id` as `_browser_session` to every subsequent browser tool call.

```
mcp__browser__browser_open()
→ "Browser opened. Session: <uuid>"
```

Then use the returned session ID for all subsequent calls:
```
mcp__browser__navigate_page(type="url", url="https://example.com", _browser_session="<uuid>")
mcp__browser__take_screenshot(_browser_session="<uuid>")
```

Close the session when done:
```
mcp__browser__browser_close(session_id="<uuid>")
```

### Navigating to a known URL
Use `mcp__browser__navigate_page` directly:
```
mcp__browser__navigate_page(type="url", url="https://example.com")
```

### Clicking a link or button
Never fabricate or guess URLs. Always:
1. Call `mcp__browser__take_snapshot` to get the accessibility tree.
2. Find the element's `uid` in snapshot output (`uid=X_Y`).
3. Call `mcp__browser__click(uid="X_Y")`.

### Reading page content
- Visual check: `mcp__browser__take_screenshot` (preferred for AI multimodal capabilities)
- Structure and links: `mcp__browser__take_snapshot`

### Filling forms
1. `mcp__browser__take_snapshot` to find input uid.
2. `mcp__browser__fill(uid="X_Y", value="text")`
3. `mcp__browser__press_key(key="Enter")` or click submit.

### Scrolling
```
mcp__browser__press_key(key="PageDown")
mcp__browser__press_key(key="PageUp")
mcp__browser__press_key(key="End")
```

### Waiting for load
```
mcp__browser__wait_for(text=["Expected text on page"])
```

## Standard Loop

1. **Open**: `mcp__browser__browser_open` (if needed)
2. **Navigate**: (`mcp__browser__navigate_page` or `mcp__browser__click`)
3. **Check**: (`mcp__browser__take_screenshot`)
4. **Interact**: If interaction needed: `mcp__browser__take_snapshot` -> find uid -> `mcp__browser__click`/`mcp__browser__fill`
5. **Repeat**

## Multi-tab

- `mcp__browser__list_pages`
- `mcp__browser__new_page(url="...")`
- `mcp__browser__select_page(pageId=N)`

## Human Handoff

When blocked by login wall, CAPTCHA, or 2FA:
- Tell the user exactly what action is needed.
- Wait for completion in the real browser.
- Resume automation afterward.
