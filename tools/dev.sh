#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export NODE_ENV="${NODE_ENV:-development}"

if [ -z "${NVM_DIR:-}" ] && [ -s "${HOME}/.nvm/nvm.sh" ]; then
  export NVM_DIR="${HOME}/.nvm"
fi

if [ -n "${NVM_DIR:-}" ] && [ -s "${NVM_DIR}/nvm.sh" ]; then
  # Load nvm so this script honors the repo's pinned Node version.
  . "${NVM_DIR}/nvm.sh"
  nvm use >/dev/null
fi

NODE_BIN="$(command -v node)"

exec ./node_modules/.bin/nodemon --exec "$NODE_BIN" -r dotenv/config src/index.js
