#!/bin/bash
# Installs the toolchain pinned in mise.toml (Node 26) and npm dependencies
# for Claude Code cloud sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# mise.run is blocked by the cloud proxy; the npm package ships the same binary.
if ! command -v mise >/dev/null 2>&1; then
  npm install --global --silent @jdxcode/mise
fi

export MISE_VERSION_CHECK_DISABLED=1
mise trust --quiet "$CLAUDE_PROJECT_DIR/mise.toml"
mise install

# Put mise's tools (Node 26) ahead of the image's Node for the whole session.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  {
    echo 'export MISE_VERSION_CHECK_DISABLED=1'
    echo "export PATH=\"$(mise bin-paths | tr '\n' ':')\$PATH\""
  } >> "$CLAUDE_ENV_FILE"
fi

# npm install (not ci) so the cached container keeps node_modules between sessions.
mise exec -- npm install --no-audit --no-fund
