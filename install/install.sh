#!/usr/bin/env bash
# ============================================================
#  Astra CLI — Linux / macOS Installer
#  Installs "astrabot" from npm and exposes it as "astra"
#  Run as: bash install.sh
# ============================================================

set -uo pipefail

# ── Colours ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e " ${GREEN}[OK]${RESET}     $*"; }
info() { echo -e " ${CYAN}[INFO]${RESET}   $*"; }
warn() { echo -e " ${YELLOW}[WARN]${RESET}   $*"; }
miss() { echo -e " ${YELLOW}[MISSING]${RESET} $*"; }
fail() { echo -e "\n ${RED}[FAIL]${RESET} $*\n" >&2; exit 1; }

prompt_yn() {
    # prompt_yn "Question" default_Y_or_N => returns 0 for yes, 1 for no
    local msg="$1" default="${2:-Y}"
    local choices="[Y/n]"; [[ "$default" == "N" ]] && choices="[y/N]"
    read -rp " $msg $choices: " answer
    answer="${answer:-$default}"
    [[ "$answer" =~ ^[Yy]$ ]]
}

echo ""
echo " ================================================"
echo -e "  ${BOLD}Astra CLI${RESET}  |  Installer"
echo " ================================================"
echo ""

# ════════════════════════════════════════════════════════════
#  STEP 1 — Node.js
# ════════════════════════════════════════════════════════════
if ! command -v node &>/dev/null; then
    miss "Node.js is not installed."
    if prompt_yn "Install Node.js now? (via nvm — recommended)"; then
        info "Installing nvm + Node.js LTS..."
        export NVM_DIR="$HOME/.nvm"
        curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
        # Source nvm immediately
        [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
        nvm install --lts
        nvm use --lts
        command -v node &>/dev/null || fail "Node.js installed but not found on PATH.\nRestart your terminal and re-run this script."
        ok "Node.js installed: $(node --version)"
    else
        info "Skipped. Install Node.js from https://nodejs.org and re-run."
        exit 1
    fi
else
    ok "Node.js found: $(node --version)"
fi

# ════════════════════════════════════════════════════════════
#  STEP 2 — npm (should come with Node, but verify)
# ════════════════════════════════════════════════════════════
if ! command -v npm &>/dev/null; then
    miss "npm is not installed (unexpected — it normally ships with Node.js)."
    if prompt_yn "Try to install npm via corepack?"; then
        corepack enable npm || fail "Could not install npm. Please reinstall Node.js from https://nodejs.org"
        ok "npm available: $(npm --version)"
    else
        fail "npm is required. Reinstall Node.js from https://nodejs.org"
    fi
else
    ok "npm found: $(npm --version)"
fi

# ════════════════════════════════════════════════════════════
#  STEP 3 — Bun (required runtime for Astra)
# ════════════════════════════════════════════════════════════
if ! command -v bun &>/dev/null; then
    miss "Bun is not installed."
    if prompt_yn "Install Bun now? (required runtime for Astra)"; then
        info "Installing Bun..."
        curl -fsSL https://bun.sh/install | bash
        # Add to PATH for this session
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
        command -v bun &>/dev/null || fail "Bun was installed but is not on PATH yet.\nRestart your terminal and re-run this script."
        ok "Bun installed: $(bun --version)"
        # Persist to shell RC
        for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
            if [ -f "$rc" ] && ! grep -q 'BUN_INSTALL' "$rc" 2>/dev/null; then
                {
                    echo ""
                    echo "# Bun — added by Astra CLI installer"
                    echo 'export BUN_INSTALL="$HOME/.bun"'
                    echo 'export PATH="$BUN_INSTALL/bin:$PATH"'
                } >> "$rc"
                info "Added Bun to PATH in $rc"
            fi
        done
    else
        info "Skipped. Install Bun from https://bun.sh and re-run."
        exit 1
    fi
else
    ok "Bun found: $(bun --version)"
fi

# ════════════════════════════════════════════════════════════
#  STEP 4 — Install astrabot from npm globally
# ════════════════════════════════════════════════════════════
echo ""
info "Installing astrabot from npm globally..."
info "(this exposes the \"astra\" command system-wide)"
echo ""

# Use sudo if global npm prefix isn't user-writable
NPM_PREFIX="$(npm config get prefix)"
if [ -w "$NPM_PREFIX" ]; then
    npm install -g astrabot
else
    warn "npm global prefix ($NPM_PREFIX) requires elevated permissions."
    if prompt_yn "Run with sudo?"; then
        sudo npm install -g astrabot
    else
        info "Trying with --prefix to install into home directory..."
        mkdir -p "$HOME/.npm-global"
        npm config set prefix "$HOME/.npm-global"
        npm install -g astrabot
        export PATH="$HOME/.npm-global/bin:$PATH"
        for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
            if [ -f "$rc" ] && ! grep -q 'npm-global' "$rc" 2>/dev/null; then
                echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "$rc"
                info "Added npm global bin to PATH in $rc"
            fi
        done
    fi
fi

ok "astrabot installed."

# ════════════════════════════════════════════════════════════
#  STEP 5 — Refresh PATH so "astra" is reachable right now
# ════════════════════════════════════════════════════════════
# Prepend the npm global bin dir into PATH for this session
NPM_BIN="$(npm config get prefix)/bin"
export PATH="$NPM_BIN:$PATH"

if command -v astra &>/dev/null; then
    ok "\"astra\" is on PATH."
else
    warn "\"astra\" is not on PATH yet — a terminal restart should fix this."
    warn "npm global bin dir: $NPM_BIN"
fi

# ════════════════════════════════════════════════════════════
#  STEP 6 — Create config directory
# ════════════════════════════════════════════════════════════
mkdir -p "$HOME/.astra"
ok "Config dir ready: $HOME/.astra"

# ════════════════════════════════════════════════════════════
#  DONE — Offer setup wizard
# ════════════════════════════════════════════════════════════
echo ""
echo " ================================================"
echo -e "  ${GREEN}Installation complete!${RESET}"
echo " ================================================"
echo ""
echo "  Package  : astrabot (npm)"
echo "  Command  : astra"
echo "  Config   : $HOME/.astra/.env"
echo ""

echo "  Run \"astra setup\" to configure your API keys."
echo "  Then start Astra with:  astra wakeup"
echo ""