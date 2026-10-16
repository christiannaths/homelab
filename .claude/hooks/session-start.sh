#!/bin/bash
# Installs Node from .nvmrc and npm dependencies for Claude Code cloud sessions.
# Uses the image's preinstalled nvm. If mise.toml grows beyond Node, switch
# this to `mise install` so cloud sessions get the same tools.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

export NVM_DIR="${NVM_DIR:-/opt/nvm}"
# nvm.sh references unset variables.
set +u
. "$NVM_DIR/nvm.sh" --no-use
nvm install --no-progress
set -u

# Put Node from .nvmrc ahead of the image's default Node for the whole session.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$(dirname "$(nvm which current)"):\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# npm install (not ci) so the cached container keeps node_modules between sessions.
npm install --no-audit --no-fund
