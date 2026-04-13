#!/usr/bin/env bash
set -euo pipefail

# ── Hotel Agent — One-Command Setup ──────────────────────────────────
# Connects your Property Management System to Claude Desktop.
# Run with:  bash setup.sh  (or:  curl -sL <raw-url> | bash)

REPO_URL="https://github.com/freezingfunky/hotel-agent.git"
INSTALL_DIR="$HOME/hotel-agent"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { echo -e "${CYAN}▸${RESET} $1"; }
ok()    { echo -e "${GREEN}✓${RESET} $1"; }
fail()  { echo -e "${RED}✗${RESET} $1"; exit 1; }
header(){ echo -e "\n${BOLD}$1${RESET}\n"; }

# ── Step 1: Prerequisites ───────────────────────────────────────────

header "Hotel Agent Setup"

if ! command -v node &>/dev/null; then
  fail "Node.js is required but not installed.\n  Install it from https://nodejs.org (version 20+) and re-run this script."
fi

NODE_MAJOR=$(node -e "process.stdout.write(process.version.split('.')[0].replace('v',''))")
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js 20+ required (you have $(node --version)).\n  Update from https://nodejs.org and re-run."
fi
ok "Node.js $(node --version)"

if ! command -v npm &>/dev/null; then
  fail "npm not found. It usually ships with Node.js — try reinstalling Node."
fi
ok "npm $(npm --version)"

# ── Step 2: Clone / Update ──────────────────────────────────────────

header "Installing Hotel Agent"

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Existing install found at $INSTALL_DIR — pulling latest…"
  cd "$INSTALL_DIR"
  git pull --ff-only || fail "Git pull failed. Resolve conflicts in $INSTALL_DIR and re-run."
else
  info "Cloning into $INSTALL_DIR…"
  git clone "$REPO_URL" "$INSTALL_DIR" || fail "Clone failed. Check your internet connection."
  cd "$INSTALL_DIR"
fi

info "Installing dependencies…"
npm install --no-audit --no-fund --loglevel=warn
ok "Dependencies installed"

info "Building…"
npm run build
ok "Build complete"

# ── Step 3: PMS Configuration ───────────────────────────────────────

header "Connect Your PMS"

echo "Which PMS do you use?"
echo ""
echo "  1) Guesty"
echo "  2) Hostaway"
echo "  3) Cloudbeds"
echo "  4) Mews"
echo "  5) Apaleo"
echo "  6) Demo (mock data, no API key needed)"
echo ""
read -rp "Enter 1-6: " PMS_CHOICE

case "$PMS_CHOICE" in
  1) PMS_NAME="guesty"    ;;
  2) PMS_NAME="hostaway"  ;;
  3) PMS_NAME="cloudbeds" ;;
  4) PMS_NAME="mews"      ;;
  5) PMS_NAME="apaleo"    ;;
  6) PMS_NAME="demo"      ;;
  *) fail "Invalid choice. Re-run and pick 1-6." ;;
esac

if [ "$PMS_NAME" = "demo" ]; then
  cat > "$INSTALL_DIR/config.json" <<DEMOEOF
{
  "pms": "demo",
  "apiKey": "not-needed"
}
DEMOEOF
  ok "Demo mode — no API key required"
else
  echo ""
  info "You'll need your API credentials from $PMS_NAME."

  case "$PMS_NAME" in
    guesty)
      echo "  → Guesty Dashboard > Settings > API > Create OAuth2 client"
      echo "    You need the Client ID (apiKey) and Client Secret."
      ;;
    hostaway)
      echo "  → Hostaway Dashboard > Settings > API Keys"
      echo "    You need the Account ID (apiKey) and API Secret."
      ;;
    cloudbeds)
      echo "  → Cloudbeds > Settings > API Credentials"
      echo "    You need the API Key."
      ;;
    mews)
      echo "  → Mews > Settings > Integrations > Connector API"
      echo "    You need the Client Token and Access Token."
      ;;
    apaleo)
      echo "  → apaleo > Integration > OAuth2 > Client Credentials"
      echo "    You need the Client ID (apiKey) and Client Secret."
      ;;
  esac

  echo ""
  read -rp "API Key: " API_KEY
  [ -z "$API_KEY" ] && fail "API key cannot be empty."

  CLIENT_SECRET=""
  CLIENT_TOKEN=""

  if [ "$PMS_NAME" = "guesty" ] || [ "$PMS_NAME" = "hostaway" ] || [ "$PMS_NAME" = "apaleo" ]; then
    read -rp "Client Secret: " CLIENT_SECRET
  fi

  if [ "$PMS_NAME" = "mews" ]; then
    read -rp "Client Token: " CLIENT_TOKEN
  fi

  # Build config.json
  CONFIG="{
  \"pms\": \"$PMS_NAME\",
  \"apiKey\": \"$API_KEY\""

  if [ -n "$CLIENT_SECRET" ]; then
    CONFIG="$CONFIG,
  \"clientSecret\": \"$CLIENT_SECRET\""
  fi

  if [ -n "$CLIENT_TOKEN" ]; then
    CONFIG="$CONFIG,
  \"clientToken\": \"$CLIENT_TOKEN\""
  fi

  CONFIG="$CONFIG
}"

  echo "$CONFIG" > "$INSTALL_DIR/config.json"
  ok "Config saved to $INSTALL_DIR/config.json"
fi

# ── Step 4: Claude Desktop Configuration ────────────────────────────

header "Connecting to Claude Desktop"

if [[ "$OSTYPE" == "darwin"* ]]; then
  CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
elif [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "cygwin"* ]]; then
  CLAUDE_CONFIG="$APPDATA/Claude/claude_desktop_config.json"
else
  CLAUDE_CONFIG="$HOME/.config/claude/claude_desktop_config.json"
fi

MCP_ENTRY='"hotel-agent": {
      "command": "node",
      "args": ["'"$INSTALL_DIR"'/dist/index.js"]
    }'

if [ -f "$CLAUDE_CONFIG" ]; then
  if command -v python3 &>/dev/null; then
    python3 - "$CLAUDE_CONFIG" "$MCP_ENTRY" <<'PYEOF'
import json, sys
config_path = sys.argv[1]
with open(config_path, "r") as f:
    config = json.load(f)
if "mcpServers" not in config:
    config["mcpServers"] = {}
config["mcpServers"]["hotel-agent"] = {
    "command": "node",
    "args": [sys.argv[1].rsplit("/claude_desktop_config.json", 1)[0].replace("/Library/Application Support/Claude", "") + "/hotel-agent/dist/index.js"]
}
# Fix: use INSTALL_DIR from env
import os
install_dir = os.path.expanduser("~/hotel-agent")
config["mcpServers"]["hotel-agent"]["args"] = [install_dir + "/dist/index.js"]
with open(config_path, "w") as f:
    json.dump(config, f, indent=2)
PYEOF
    ok "Added hotel-agent to Claude Desktop config"
  else
    echo ""
    info "Could not auto-configure (python3 not found)."
    info "Manually add this to $CLAUDE_CONFIG:"
    echo ""
    echo '  "mcpServers": {'
    echo "    $MCP_ENTRY"
    echo '  }'
  fi
else
  mkdir -p "$(dirname "$CLAUDE_CONFIG")"
  cat > "$CLAUDE_CONFIG" <<CLEOF
{
  "mcpServers": {
    "hotel-agent": {
      "command": "node",
      "args": ["$INSTALL_DIR/dist/index.js"]
    }
  }
}
CLEOF
  ok "Created Claude Desktop config at $CLAUDE_CONFIG"
fi

# ── Done ─────────────────────────────────────────────────────────────

header "🎉 Setup Complete!"

echo -e "Next steps:"
echo -e "  1. ${BOLD}Restart Claude Desktop${RESET} (quit fully, then reopen)"
echo -e "  2. Look for the hammer/tools icon in the chat input"
echo -e "  3. Try: ${CYAN}\"What does my portfolio look like?\"${RESET}"
echo ""
echo -e "Installed at: ${BOLD}$INSTALL_DIR${RESET}"
echo -e "Config:       ${BOLD}$INSTALL_DIR/config.json${RESET}"
echo ""
echo -e "Need help? Reach out — happy to jump on a quick call."
