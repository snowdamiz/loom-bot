#!/usr/bin/env bash
set -euo pipefail

REPO_SLUG="${JARVIS_REPO_SLUG:-snowdamiz/jarvis}"
BOOTSTRAP_MODE="${JARVIS_BOOTSTRAP_MODE:-install}"
INSTALL_COMMAND_PRIMARY="bash <(curl -fsSL https://getloom.dev/install.sh)"
INSTALL_COMMAND_FALLBACK="bash <(curl -fsSL https://raw.githubusercontent.com/${REPO_SLUG}/main/scripts/install-hosted.sh)"
UPDATE_COMMAND_PRIMARY="bash <(curl -fsSL https://getloom.dev/update.sh)"
UPDATE_COMMAND_FALLBACK="bash <(curl -fsSL https://raw.githubusercontent.com/${REPO_SLUG}/main/scripts/update-hosted.sh)"

if [[ -n "${JARVIS_VERSION:-}" ]]; then
  REF="${JARVIS_VERSION}"
  REF_KIND="tag"
else
  REF="${JARVIS_REF:-main}"
  REF_KIND="branch"
fi

if [[ -n "${JARVIS_INSTALL_DIR:-}" ]]; then
  INSTALL_DIR="${JARVIS_INSTALL_DIR}"
elif [[ "${EUID}" -eq 0 ]]; then
  INSTALL_DIR="/opt/jarvis"
else
  INSTALL_DIR="${HOME}/jarvis"
fi

TMP_DIR="$(mktemp -d)"
ARCHIVE_FILE="${TMP_DIR}/jarvis.tar.gz"
if [[ "${REF_KIND}" == "tag" ]]; then
  ARCHIVE_URL="https://codeload.github.com/${REPO_SLUG}/tar.gz/refs/tags/${REF}"
else
  ARCHIVE_URL="https://codeload.github.com/${REPO_SLUG}/tar.gz/refs/heads/${REF}"
fi
PRESERVED_ENV_FILE="${TMP_DIR}/preserved.env.docker"

log() {
  printf '[bootstrap] %s\n' "$1"
}

fail() {
  printf '[bootstrap] %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: install-hosted.sh [--install|--update]

Modes:
  --install (default)  Run normal install flow.
  --update             Run update flow (defaults to non-interactive installer).
EOF
}

cleanup() {
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

parse_args() {
  if [[ "$#" -eq 0 ]]; then
    return
  fi

  case "$1" in
    --install)
      BOOTSTRAP_MODE="install"
      ;;
    --update)
      BOOTSTRAP_MODE="update"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1 (use --help for usage)"
      ;;
  esac

  shift
  if [[ "$#" -gt 0 ]]; then
    fail "Unexpected extra arguments: $*"
  fi
}

configure_bootstrap_mode() {
  case "${BOOTSTRAP_MODE}" in
    install)
      ;;
    update)
      log "Update mode enabled"
      if [[ -z "${JARVIS_INSTALL_NONINTERACTIVE:-}" ]]; then
        export JARVIS_INSTALL_NONINTERACTIVE=1
        log "Defaulting JARVIS_INSTALL_NONINTERACTIVE=1 for update flow"
      fi
      ;;
    *)
      fail "Unsupported JARVIS_BOOTSTRAP_MODE value: ${BOOTSTRAP_MODE}"
      ;;
  esac
}

ensure_safe_install_dir() {
  if [[ -z "${INSTALL_DIR}" || "${INSTALL_DIR}" == "/" ]]; then
    fail "Refusing to use unsafe install directory: ${INSTALL_DIR}"
  fi
}

download_source() {
  log "Downloading ${REPO_SLUG}@${REF} (${REF_KIND})"
  curl --retry 3 --retry-delay 2 --retry-all-errors -fsSL "${ARCHIVE_URL}" -o "${ARCHIVE_FILE}" || fail "Failed to download source archive from ${ARCHIVE_URL}"

  tar -tzf "${ARCHIVE_FILE}" >/dev/null 2>&1 || fail "Downloaded archive from ${ARCHIVE_URL} is not a valid tar.gz file."
  tar -xzf "${ARCHIVE_FILE}" -C "${TMP_DIR}" || fail "Failed to extract source archive"

  SOURCE_DIR="$(find "${TMP_DIR}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [[ -n "${SOURCE_DIR}" && -d "${SOURCE_DIR}" ]] || fail "Could not find extracted source directory"

  if [[ ! -x "${SOURCE_DIR}/scripts/install-docker.sh" ]]; then
    fail "Downloaded archive is missing scripts/install-docker.sh"
  fi
}

install_source() {
  mkdir -p "$(dirname "${INSTALL_DIR}")"

  if [[ -d "${INSTALL_DIR}" ]]; then
    log "Existing install detected at ${INSTALL_DIR}; refreshing files"
    if [[ -f "${INSTALL_DIR}/.env.docker" ]]; then
      cp "${INSTALL_DIR}/.env.docker" "${PRESERVED_ENV_FILE}"
      log "Preserved existing .env.docker"
    fi
    rm -rf "${INSTALL_DIR}"
  fi

  mv "${SOURCE_DIR}" "${INSTALL_DIR}"

  if [[ -f "${PRESERVED_ENV_FILE}" ]]; then
    mv "${PRESERVED_ENV_FILE}" "${INSTALL_DIR}/.env.docker"
  fi
}

run_installer() {
  log "Running Docker installer"
  (
    cd "${INSTALL_DIR}"
    ./scripts/install-docker.sh
  )
}

main() {
  parse_args "$@"
  require_cmd curl
  require_cmd tar
  require_cmd bash
  ensure_safe_install_dir
  configure_bootstrap_mode
  download_source
  install_source
  run_installer

  if [[ "${BOOTSTRAP_MODE}" == "update" ]]; then
    log "Update complete: ${INSTALL_DIR}"
  else
    log "Install complete: ${INSTALL_DIR}"
  fi
  log "Install command (primary): ${INSTALL_COMMAND_PRIMARY}"
  log "Install command (fallback): ${INSTALL_COMMAND_FALLBACK}"
  log "Update command (primary): ${UPDATE_COMMAND_PRIMARY}"
  log "Update command (fallback): ${UPDATE_COMMAND_FALLBACK}"
}

main "$@"
