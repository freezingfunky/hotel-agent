#!/usr/bin/env bash
set -euo pipefail

# ── Hotel Agent — One-Command Setup ──────────────────────────────────
# Connects your PMS, RMS, STR benchmarks, and OTA channels to Claude.
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

# ── Step 3: Data Source Configuration ────────────────────────────────

header "Connect Your Data Sources"

echo "Hotel Agent supports 4 data sources. PMS is required; the rest are optional."
echo "Each adds new analysis tools to Claude."
echo ""

# ── PMS ──

echo -e "${BOLD}1. PMS (Property Management System) — REQUIRED${RESET}"
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
  1) PMS_PROVIDER="guesty"    ;;
  2) PMS_PROVIDER="hostaway"  ;;
  3) PMS_PROVIDER="cloudbeds" ;;
  4) PMS_PROVIDER="mews"      ;;
  5) PMS_PROVIDER="apaleo"    ;;
  6) PMS_PROVIDER="demo"      ;;
  *) fail "Invalid choice. Re-run and pick 1-6." ;;
esac

PMS_KEY=""
PMS_SECRET=""
PMS_TOKEN=""

if [ "$PMS_PROVIDER" != "demo" ]; then
  read -rp "  API Key: " PMS_KEY
  [ -z "$PMS_KEY" ] && fail "API key cannot be empty."

  if [ "$PMS_PROVIDER" = "guesty" ] || [ "$PMS_PROVIDER" = "hostaway" ] || [ "$PMS_PROVIDER" = "apaleo" ]; then
    read -rp "  Client Secret: " PMS_SECRET
  fi
  if [ "$PMS_PROVIDER" = "mews" ]; then
    read -rp "  Client Token: " PMS_TOKEN
  fi
fi

# ── RMS ──

echo ""
echo -e "${BOLD}2. RMS (Revenue Management System) — optional${RESET}"
echo ""
echo "  1) RoomPriceGenie"
echo "  2) IDeaS"
echo "  3) Demo (mock data)"
echo "  4) Skip"
echo ""
read -rp "Enter 1-4: " RMS_CHOICE

RMS_PROVIDER=""
RMS_KEY=""

case "$RMS_CHOICE" in
  1) RMS_PROVIDER="roompricegenie" ;;
  2) RMS_PROVIDER="ideas"          ;;
  3) RMS_PROVIDER="demo"           ;;
  4) RMS_PROVIDER=""               ;;
  *) RMS_PROVIDER=""               ;;
esac

if [ -n "$RMS_PROVIDER" ] && [ "$RMS_PROVIDER" != "demo" ]; then
  read -rp "  RMS API Key: " RMS_KEY
fi

# ── STR ──

echo ""
echo -e "${BOLD}3. STR / Benchmarking — optional${RESET}"
echo ""
echo "  1) AirDNA"
echo "  2) Demo (mock data)"
echo "  3) Skip"
echo ""
read -rp "Enter 1-3: " STR_CHOICE

STR_PROVIDER=""
STR_KEY=""

case "$STR_CHOICE" in
  1) STR_PROVIDER="airdna" ;;
  2) STR_PROVIDER="demo"   ;;
  3) STR_PROVIDER=""        ;;
  *) STR_PROVIDER=""        ;;
esac

if [ -n "$STR_PROVIDER" ] && [ "$STR_PROVIDER" != "demo" ]; then
  read -rp "  STR API Key: " STR_KEY
fi

# ── OTA ──

echo ""
echo -e "${BOLD}4. OTA (Online Travel Agency) — optional${RESET}"
echo ""
echo "  1) Booking.com"
echo "  2) Expedia"
echo "  3) Demo (mock data)"
echo "  4) Skip"
echo ""
read -rp "Enter 1-4: " OTA_CHOICE

OTA_PROVIDER=""
OTA_KEY=""
OTA_SECRET=""

case "$OTA_CHOICE" in
  1) OTA_PROVIDER="booking"  ;;
  2) OTA_PROVIDER="expedia"  ;;
  3) OTA_PROVIDER="demo"     ;;
  4) OTA_PROVIDER=""          ;;
  *) OTA_PROVIDER=""          ;;
esac

if [ -n "$OTA_PROVIDER" ] && [ "$OTA_PROVIDER" != "demo" ]; then
  read -rp "  OTA API Key: " OTA_KEY
  if [ "$OTA_PROVIDER" = "expedia" ]; then
    read -rp "  Expedia Shared Secret: " OTA_SECRET
  fi
fi

# ── Build config.json ──

if [ "$PMS_PROVIDER" = "demo" ] && [ "$RMS_PROVIDER" = "" ] && [ "$STR_PROVIDER" = "" ] && [ "$OTA_PROVIDER" = "" ]; then
  # Full demo mode
  cat > "$INSTALL_DIR/config.json" <<DEMOEOF
{
  "pms": { "provider": "demo", "apiKey": "not-needed" },
  "rms": { "provider": "demo", "apiKey": "not-needed" },
  "str": { "provider": "demo", "apiKey": "not-needed" },
  "ota": { "provider": "demo", "apiKey": "not-needed" }
}
DEMOEOF
  ok "Full demo mode configured"
else
  # Build JSON with python3 for safe escaping
  if command -v python3 &>/dev/null; then
    python3 - <<PYEOF
import json, os

config = {}

pms = {"provider": "$PMS_PROVIDER", "apiKey": "${PMS_KEY:-not-needed}"}
if "$PMS_SECRET": pms["clientSecret"] = "$PMS_SECRET"
if "$PMS_TOKEN": pms["clientToken"] = "$PMS_TOKEN"
config["pms"] = pms

rms_prov = "$RMS_PROVIDER"
if rms_prov:
    config["rms"] = {"provider": rms_prov, "apiKey": "${RMS_KEY:-not-needed}"}

str_prov = "$STR_PROVIDER"
if str_prov:
    config["str"] = {"provider": str_prov, "apiKey": "${STR_KEY:-not-needed}"}

ota_prov = "$OTA_PROVIDER"
if ota_prov:
    ota_conf = {"provider": ota_prov, "apiKey": "${OTA_KEY:-not-needed}"}
    if "$OTA_SECRET": ota_conf["clientSecret"] = "$OTA_SECRET"
    config["ota"] = ota_conf

with open("$INSTALL_DIR/config.json", "w") as f:
    json.dump(config, f, indent=2)
PYEOF
  else
    # Fallback: legacy flat format for PMS-only
    CONFIG="{
  \"pms\": { \"provider\": \"$PMS_PROVIDER\", \"apiKey\": \"${PMS_KEY:-not-needed}\" }
}"
    echo "$CONFIG" > "$INSTALL_DIR/config.json"
  fi
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

if [ -f "$CLAUDE_CONFIG" ]; then
  if command -v python3 &>/dev/null; then
    python3 - "$CLAUDE_CONFIG" <<PYEOF
import json, sys, os
config_path = sys.argv[1]
with open(config_path, "r") as f:
    config = json.load(f)
if "mcpServers" not in config:
    config["mcpServers"] = {}
install_dir = os.path.expanduser("~/hotel-agent")
config["mcpServers"]["hotel-agent"] = {
    "command": "node",
    "args": [install_dir + "/dist/index.js"]
}
with open(config_path, "w") as f:
    json.dump(config, f, indent=2)
PYEOF
    ok "Added hotel-agent to Claude Desktop config"
  else
    echo ""
    info "Could not auto-configure (python3 not found)."
    info "Manually add this to $CLAUDE_CONFIG under mcpServers:"
    echo ""
    echo '    "hotel-agent": { "command": "node", "args": ["'"$INSTALL_DIR"'/dist/index.js"] }'
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

header "Setup Complete!"

SOURCES="PMS ($PMS_PROVIDER)"
[ -n "$RMS_PROVIDER" ] && SOURCES="$SOURCES, RMS ($RMS_PROVIDER)"
[ -n "$STR_PROVIDER" ] && SOURCES="$SOURCES, STR ($STR_PROVIDER)"
[ -n "$OTA_PROVIDER" ] && SOURCES="$SOURCES, OTA ($OTA_PROVIDER)"

echo -e "Connected: ${BOLD}$SOURCES${RESET}"
echo ""
echo -e "Next steps:"
echo -e "  1. ${BOLD}Restart Claude Desktop${RESET} (quit fully, then reopen)"
echo -e "  2. Look for the hammer/tools icon in the chat input"
echo -e "  3. Try: ${CYAN}\"What does my portfolio look like?\"${RESET}"
[ -n "$RMS_PROVIDER" ] && echo -e "     ${CYAN}\"Are my rates competitive?\"${RESET}"
[ -n "$STR_PROVIDER" ] && echo -e "     ${CYAN}\"How do I compare to my comp set?\"${RESET}"
[ -n "$OTA_PROVIDER" ] && echo -e "     ${CYAN}\"Which channels are most profitable?\"${RESET}"
echo ""
echo -e "Installed at: ${BOLD}$INSTALL_DIR${RESET}"
echo -e "Config:       ${BOLD}$INSTALL_DIR/config.json${RESET}"
echo ""
echo -e "Need help? Reach out — happy to jump on a quick call."
