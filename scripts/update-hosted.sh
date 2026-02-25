#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export JARVIS_BOOTSTRAP_MODE="${JARVIS_BOOTSTRAP_MODE:-update}"
export JARVIS_INSTALL_NONINTERACTIVE="${JARVIS_INSTALL_NONINTERACTIVE:-1}"

exec "${SCRIPT_DIR}/install-hosted.sh" "$@"
