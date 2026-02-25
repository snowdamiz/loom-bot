#!/usr/bin/env bash
set -euo pipefail

export JARVIS_BOOTSTRAP_MODE="${JARVIS_BOOTSTRAP_MODE:-update}"
export JARVIS_INSTALL_NONINTERACTIVE="${JARVIS_INSTALL_NONINTERACTIVE:-1}"

PRIMARY_URL="https://getloom.dev/install.sh"
FALLBACK_URL="https://raw.githubusercontent.com/snowdamiz/jarvis/main/scripts/install-hosted.sh"

if ! curl -fsSL "${PRIMARY_URL}" | bash; then
  echo "[bootstrap] Primary update endpoint failed, retrying fallback script" >&2
  curl -fsSL "${FALLBACK_URL}" | bash
fi
