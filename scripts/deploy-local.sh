#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Hydra"
BUNDLE_ID="com.hydra.app"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$PROJECT_DIR/dist/mac-arm64"
APP_PATH="$DIST_DIR/$APP_NAME.app"
INSTALL_DIR="/Applications"
INSTALLED_APP="$INSTALL_DIR/$APP_NAME.app"
INSTALLED_RESOURCES="$INSTALLED_APP/Contents/Resources"

# ── Helpers ───────────────────────────────────────────────────────────────────

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
dim()   { printf '\033[0;90m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

step() { printf '\n\033[1;34m=> %s\033[0m\n' "$*"; }

fail() { red "ERROR: $*" >&2; exit 1; }

# ── Pre-checks ────────────────────────────────────────────────────────────────

command -v node >/dev/null  || fail "node not found"

# Detect package manager: prefer bun if available, fall back to npm
if command -v bun >/dev/null 2>&1; then
  PM="bun"
elif command -v npm >/dev/null 2>&1; then
  PM="npm"
else
  fail "Neither bun nor npm found"
fi

cd "$PROJECT_DIR"

VERSION=$(node -p "require('./package.json').version")
bold "$APP_NAME v$VERSION — local deploy (using $PM)"
dim "$PROJECT_DIR"

# ── Typecheck ─────────────────────────────────────────────────────────────────

step "Type-checking"
$PM run typecheck

# ── Tests ─────────────────────────────────────────────────────────────────────

step "Running tests"
$PM run test

# ── Build ─────────────────────────────────────────────────────────────────────

step "Building (electron-vite)"
$PM run build

# ── Package ───────────────────────────────────────────────────────────────────

step "Packaging (electron-builder --dir, unsigned)"
CSC_IDENTITY_AUTO_DISCOVERY=false $PM run pack

[ -d "$APP_PATH" ] || fail "Build produced no app at $APP_PATH"

BUILD_SIZE=$(du -sh "$APP_PATH" | cut -f1)
dim "Built $APP_PATH ($BUILD_SIZE)"

# ── Install / Update ─────────────────────────────────────────────────────────

step "Installing to $INSTALL_DIR"

# Quit running instance if any
if pgrep -f "$INSTALLED_APP/Contents/MacOS" >/dev/null 2>&1; then
  dim "Quitting running $APP_NAME..."
  osascript -e "tell application \"$APP_NAME\" to quit" 2>/dev/null || true
  sleep 1
  # Force-kill if still running
  pkill -f "$INSTALLED_APP/Contents/MacOS" 2>/dev/null || true
  sleep 0.5
fi

if [ -d "$INSTALLED_APP" ]; then
  dim "Removing previous installation..."
  rm -rf "$INSTALLED_APP"
fi

cp -R "$APP_PATH" "$INSTALLED_APP"

# Clear quarantine so macOS doesn't block the unsigned app
xattr -rd com.apple.quarantine "$INSTALLED_APP" 2>/dev/null || true

# Inject local Firebase env for desktop remote control if available.
if [ -f "$PROJECT_DIR/.env" ]; then
  cp "$PROJECT_DIR/.env" "$INSTALLED_RESOURCES/.env"
  dim "Installed local .env into app resources"
fi

# ── Done ──────────────────────────────────────────────────────────────────────

INSTALLED_SIZE=$(du -sh "$INSTALLED_APP" | cut -f1)
echo ""
green "Deployed $APP_NAME v$VERSION to $INSTALLED_APP ($INSTALLED_SIZE)"
dim "Launch: open -a $APP_NAME"
