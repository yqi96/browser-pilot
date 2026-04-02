#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_NAME="${MCP_NAME:-browser}"
SKILL_NAME="${SKILL_NAME:-browser}"
CODEX_SKILLS_DIR="${HOME}/.codex/skills"
CLAUDE_COMMANDS_DIR="${HOME}/.claude/commands"
TARGET_CLIENT="${TARGET_CLIENT:-both}"

# codex | claude | both (codex+claude)
if [[ "$TARGET_CLIENT" != "codex" && "$TARGET_CLIENT" != "claude" && "$TARGET_CLIENT" != "both" ]]; then
  echo "Invalid TARGET_CLIENT='$TARGET_CLIENT' (expected: codex|claude|both)" >&2
  exit 1
fi

echo "==> browser-mcp installer"
echo ""

# 1. Install deps & build
echo "[1/3] Building..."
cd "$SCRIPT_DIR"
npm install --silent
npm run build --silent
echo "      OK: dist/index.js"

DIST_PATH="$SCRIPT_DIR/dist/index.js"

# 2. Register MCP server
echo "[2/3] Registering MCP server as '$MCP_NAME'..."
if [[ "$TARGET_CLIENT" == "codex" || "$TARGET_CLIENT" == "both" ]]; then
  codex mcp remove "$MCP_NAME" >/dev/null 2>&1 || true
  codex mcp add "$MCP_NAME" -- node "$DIST_PATH" --launch
  echo "      OK: codex mcp list | grep $MCP_NAME"
fi

if [[ "$TARGET_CLIENT" == "claude" || "$TARGET_CLIENT" == "both" ]]; then
  claude mcp remove "$MCP_NAME" --scope user >/dev/null 2>&1 || true
  claude mcp add "$MCP_NAME" \
    --scope user \
    --transport stdio \
    -- node "$DIST_PATH" --launch
  echo "      OK: claude mcp list | grep $MCP_NAME"
fi

# 3. Install skill
if [[ "$TARGET_CLIENT" == "codex" || "$TARGET_CLIENT" == "both" ]]; then
  echo "[3/3] Installing Codex skill '$SKILL_NAME'..."
  mkdir -p "$CODEX_SKILLS_DIR/$SKILL_NAME"
  cp "$SCRIPT_DIR/skills/browser/SKILL.md" "$CODEX_SKILLS_DIR/$SKILL_NAME/SKILL.md"
  echo "      OK: $CODEX_SKILLS_DIR/$SKILL_NAME/SKILL.md"
fi

if [[ "$TARGET_CLIENT" == "claude" || "$TARGET_CLIENT" == "both" ]]; then
  echo "[3/3] Installing Claude /$SKILL_NAME command..."
  mkdir -p "$CLAUDE_COMMANDS_DIR"
  cp "$SCRIPT_DIR/skills/browser.md" "$CLAUDE_COMMANDS_DIR/${SKILL_NAME}.md"
  echo "      OK: $CLAUDE_COMMANDS_DIR/${SKILL_NAME}.md"
fi

echo ""
echo "Done! Restart your client, then browser tools will be available as mcp__browser__*."
if [[ "$TARGET_CLIENT" == "codex" || "$TARGET_CLIENT" == "both" ]]; then
  echo "Codex skill trigger: use \$${SKILL_NAME} (if your AGENTS.md maps it)"
fi
if [[ "$TARGET_CLIENT" == "claude" || "$TARGET_CLIENT" == "both" ]]; then
  echo "Claude skill trigger: type /$SKILL_NAME"
fi
