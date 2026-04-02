#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_NAME="${MCP_NAME:-browser}"
SKILL_NAME="${SKILL_NAME:-browser}"
CLAUDE_COMMANDS_DIR="${HOME}/.claude/commands"

echo "==> claude-browser-mcp installer"
echo ""

# 1. Install deps & build
echo "[1/3] Building..."
cd "$SCRIPT_DIR"
npm install --silent
npm run build --silent
echo "      OK: dist/index.js"

# 2. Register MCP server
echo "[2/3] Registering MCP server as '$MCP_NAME'..."
DIST_PATH="$SCRIPT_DIR/dist/index.js"

# Remove existing registration if present
claude mcp remove "$MCP_NAME" --scope user 2>/dev/null || true

claude mcp add "$MCP_NAME" \
  --scope user \
  --transport stdio \
  -- node "$DIST_PATH" --launch

echo "      OK: claude mcp list | grep $MCP_NAME"

# 3. Install skill (slash command)
echo "[3/3] Installing /$SKILL_NAME skill..."
mkdir -p "$CLAUDE_COMMANDS_DIR"
cp "$SCRIPT_DIR/skills/browser.md" "$CLAUDE_COMMANDS_DIR/${SKILL_NAME}.md"
echo "      OK: $CLAUDE_COMMANDS_DIR/${SKILL_NAME}.md"

echo ""
echo "Done! Restart Claude Code, then:"
echo "  - Browser tools available as mcp__browser__* automatically"
echo "  - Type /$SKILL_NAME in Claude Code to activate browsing mode"
