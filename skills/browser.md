# Browser Skill

You are operating a real Chrome browser via the `mcp__browser__*` tools. Follow these rules strictly.

## Core Workflow

### Navigating to a known URL
Use `navigate_page` directly:
```
navigate_page(type="url", url="https://example.com")
```

### Clicking a link or button
**NEVER fabricate or guess URLs.** Always:
1. Call `take_snapshot` to get the accessibility tree
2. Find the element's `uid` in the snapshot output (format: `uid=X_Y`)
3. Call `click(uid="X_Y")`

Example snapshot output:
```
uid=2_242 link "Sign in" url="https://example.com/login"
uid=2_301 button "Submit"
```
Then: `click(uid="2_242")`

### Reading page content
- **Visual check**: `take_screenshot` — returns an image you can see directly
- **Structure/links**: `take_snapshot` — returns accessibility tree with all uids
- Snapshot output can be large; save to a file and grep for what you need

### Filling forms
1. `take_snapshot` to find the input's uid
2. `fill(uid="X_Y", value="text")`
3. `press_key(key="Enter")` or click the submit button

### Scrolling
```
press_key(key="PageDown")   # scroll down
press_key(key="PageUp")     # scroll up
press_key(key="End")        # jump to bottom
```

### Waiting for content to load
```
wait_for(text=["Expected text on page"])
```

## Standard Browsing Loop

For any browsing task:
1. `navigate_page` or `click` to go somewhere
2. `take_screenshot` to see what loaded
3. If you need to interact: `take_snapshot` → find uid → `click` / `fill`
4. Repeat

## Multi-tab
- `list_pages` — see all open tabs with their IDs
- `new_page(url="...")` — open a new tab
- `select_page(pageId=N)` — switch to a tab

## Human handoff
When you hit a login wall, CAPTCHA, or 2FA:
- Tell the user what's needed
- Wait for them to complete it in the browser window
- Then resume automation

## Available Tools

| Tool | Purpose |
|------|---------|
| `navigate_page` | Go to URL / back / forward / reload |
| `take_screenshot` | Visual screenshot (returned as image) |
| `take_snapshot` | Accessibility tree with uids |
| `click` | Click element by uid |
| `fill` | Type into input by uid |
| `fill_form` | Fill multiple inputs at once |
| `press_key` | Keyboard input (Enter, Tab, PageDown, etc.) |
| `type_text` | Type text into focused element |
| `hover` | Hover over element |
| `drag` | Drag element onto another |
| `evaluate_script` | Run JavaScript on the page |
| `wait_for` | Wait for text to appear |
| `list_pages` | List all open tabs |
| `new_page` | Open new tab |
| `select_page` | Switch to tab |
| `close_page` | Close a tab |
| `handle_dialog` | Accept/dismiss alert dialogs |
| `upload_file` | Upload a file via file input |
| `list_network_requests` | Inspect network traffic |
| `list_console_messages` | Read browser console |
| `emulate` | Emulate device/viewport/network |
| `resize_page` | Resize browser window |
| `lighthouse_audit` | Run accessibility/SEO audit |
