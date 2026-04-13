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

### Downloading files
For download tasks, prefer `wget` or `curl` once you have discovered the real file URL from the page, network activity, or page state.

Only fall back to clicking a download button/link when direct download fails or the URL cannot be recovered.

Be aware that click-driven downloads may:
- auto-download into `~/Downloads`
- stall on a browser-native or site-native confirmation dialog that requires human action

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

## Human Collaboration (Human-in-the-Loop)

**Key insight**: The browser session is shared — the user can see and interact with the same browser window in real time. This unlocks tasks that agents cannot do alone.

### When to hand off to the user

Pause and ask the user to act when you hit:
- **Login walls** — credentials, SSO, OAuth flows
- **CAPTCHAs / reCAPTCHA** — visual or audio challenges
- **2FA / MFA** — OTP codes, authenticator apps, SMS verification
- **Email / phone verification links** — click-to-confirm flows
- **Payment forms** — credit card or banking credentials
- **Biometric prompts** — fingerprint, Face ID dialogs
- **Any sensitive credential input** — never type passwords on behalf of the user

### How to hand off correctly

1. **Take a screenshot first** so the user can see the current state.
2. **Tell the user exactly what to do**, e.g.:
   > "The browser is showing a login page. Please enter your credentials and click Sign In, then tell me when you're done."
3. **Wait** — do not poll or retry. Just pause and wait for the user's reply.
4. **Take a new screenshot** after the user signals completion to confirm the state.
5. **Resume automation** from the new state.

### Example hand-off prompts

- "Please complete the login in the browser window, then tell me when you're signed in."
- "A CAPTCHA appeared. Please solve it in the browser, then say 'done'."
- "Check your email/phone for a verification code and enter it in the browser."
- "Please approve the OAuth permission dialog, then tell me when it's done."

### What this enables

By combining agent automation with human assistance at auth/verification steps, you can complete tasks like:
- Scraping or interacting with sites that require login
- Automating workflows across authenticated SaaS tools
- Multi-step processes that mix public and private content
- Any site with anti-bot protections at the auth layer

Never skip a human handoff to guess or fake credentials. Human collaboration is the correct pattern — agents handle what they can, humans handle what requires trust.
