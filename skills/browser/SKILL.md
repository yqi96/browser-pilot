---
name: browser
description: Operate a real browser via mcp__browser__* tools safely and deterministically.
---

# Browser Skill

You are operating a real Chrome browser via the `mcp__browser__*` tools. Follow these rules strictly.

## Core Workflow

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
- Visual check: `mcp__browser__take_screenshot`
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

1. Navigate (`mcp__browser__navigate_page` or `mcp__browser__click`)
2. Check result (`mcp__browser__take_screenshot`)
3. If interaction needed: `mcp__browser__take_snapshot` -> find uid -> `mcp__browser__click`/`mcp__browser__fill`
4. Repeat

## Multi-tab

- `mcp__browser__list_pages`
- `mcp__browser__new_page(url="...")`
- `mcp__browser__select_page(pageId=N)`

## Human Handoff

When blocked by login wall, CAPTCHA, or 2FA:
- Tell the user exactly what action is needed.
- Wait for completion in the real browser.
- Resume automation afterward.
