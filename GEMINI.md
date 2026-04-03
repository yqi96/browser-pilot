# browser-pilot

A thin MCP server that wraps `chrome-devtools-mcp` with auto-launch capabilities. It allows AI agents to control a real Chrome browser via the Model Context Protocol.

## Getting Started

### Prerequisites
- Node.js 18+
- Google Chrome installed

### Installation
```bash
npm install
npm run build
```

### Integration with Gemini CLI
To register this MCP server with Gemini CLI:
```bash
gemini mcp add browser --scope user -- npx browser-pilot --launch
```

To install the browser skill:
```bash
gemini skills link $(pwd)/skills/browser
```

## Skills

### Browser Skill
The `browser` skill provides a set of rules and workflows for interacting with the browser safely and deterministically. It is located in `skills/browser/SKILL.md`.

## Development

- `src/index.ts`: The main entry point. It handles Chrome launching and proxies tools to `chrome-devtools-mcp`.
- `skills/`: Contains the skill definitions for different clients (Codex, Claude, Gemini).

### Building
```bash
npm run build
```

### Testing/Dev
```bash
# Start in dev mode with auto-launch
node --loader ts-node/esm src/index.ts --launch
```

## Mandates for Agents
- When using browser tools, always prefer `mcp__browser__take_screenshot` for visual confirmation.
- Use `mcp__browser__take_snapshot` to find element UIDs before clicking or filling.
- **NEVER** guess or fabricate URLs or element IDs.
- If blocked by a CAPTCHA or login, notify the user and wait for manual intervention.
