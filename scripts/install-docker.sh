#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.docker"
ENV_TEMPLATE="${ROOT_DIR}/.env.docker.example"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.deploy.yml"
COMPOSE_BUILD_FILE="${ROOT_DIR}/docker-compose.deploy.build.yml"
DEFAULT_RELEASE_IMAGE="${JARVIS_RELEASE_IMAGE_DEFAULT:-ghcr.io/snowdamiz/loom-bot:latest}"
DEFAULT_POSTGRES_USER="jarvis"
DEFAULT_POSTGRES_DB="jarvis"
DEFAULT_POSTGRES_HOST="postgres"
DEFAULT_POSTGRES_PORT="5432"
LEGACY_DATABASE_URL="postgres://jarvis:jarvis@postgres:5432/jarvis"
DEFAULT_REDIS_HOST="redis"
DEFAULT_REDIS_PORT="6379"
LEGACY_REDIS_URL="redis://redis:6379"
LEGACY_REDIS_URL_DB0="redis://redis:6379/0"
DEFAULT_DASHBOARD_PORT="3001"
MIN_FREE_DISK_GB="${JARVIS_MIN_FREE_DISK_GB:-5}"
MIN_FREE_RAM_MB="${JARVIS_MIN_FREE_RAM_MB:-2048}"

COMPOSE_BIN=()
WIZARD_ENABLED=0
DEPLOY_MODE="pull"

log() {
  printf '[install] %s\n' "$1"
}

fail() {
  printf '[install] %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|y|Y|on|ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

resolve_compose_bin() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_BIN=(docker compose)
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_BIN=(docker-compose)
    return
  fi

  fail "Docker Compose is not available. Install Docker Compose v2 or docker-compose."
}

compose_run() {
  "${COMPOSE_BIN[@]}" "$@"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp
  tmp="$(mktemp)"

  awk -v key="$key" -v value="$value" '
    BEGIN {
      updated = 0
    }
    $0 ~ ("^" key "=") {
      print key "=" value
      updated = 1
      next
    }
    {
      print
    }
    END {
      if (updated == 0) {
        print key "=" value
      }
    }
  ' "$file" > "$tmp"

  mv "$tmp" "$file"
}

get_env_value() {
  local file="$1"
  local key="$2"
  local line
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  printf '%s' "${line#*=}"
}

build_database_url() {
  local user="$1"
  local password="$2"
  local database="$3"

  printf 'postgres://%s:%s@%s:%s/%s' \
    "$user" \
    "$password" \
    "$DEFAULT_POSTGRES_HOST" \
    "$DEFAULT_POSTGRES_PORT" \
    "$database"
}

build_redis_url() {
  local password="$1"
  printf 'redis://:%s@%s:%s/0' "$password" "$DEFAULT_REDIS_HOST" "$DEFAULT_REDIS_PORT"
}

prompt_with_default() {
  local label="$1"
  local default_value="$2"
  local response

  if [[ "$WIZARD_ENABLED" -ne 1 ]]; then
    printf '%s' "$default_value"
    return
  fi

  printf '%s [%s]: ' "$label" "$default_value" > /dev/tty
  IFS= read -r response < /dev/tty || response=""
  if [[ -z "$response" ]]; then
    printf '%s' "$default_value"
    return
  fi

  printf '%s' "$response"
}

prompt_optional_secret() {
  local label="$1"
  local response

  if [[ "$WIZARD_ENABLED" -ne 1 ]]; then
    printf ''
    return
  fi

  printf '%s (optional, leave blank to skip): ' "$label" > /dev/tty
  IFS= read -r -s response < /dev/tty || response=""
  printf '\n' > /dev/tty
  printf '%s' "$response"
}

configure_setup_mode() {
  if is_truthy "${JARVIS_INSTALL_NONINTERACTIVE:-}"; then
    log "JARVIS_INSTALL_NONINTERACTIVE is set; using existing/default env values"
    WIZARD_ENABLED=0
    return
  fi

  if is_truthy "${CI:-}"; then
    log "CI environment detected; using existing/default env values"
    WIZARD_ENABLED=0
    return
  fi

  if [[ -r /dev/tty && -w /dev/tty ]]; then
    WIZARD_ENABLED=1
    return
  fi

  log "No interactive terminal detected; using existing/default env values"
  WIZARD_ENABLED=0
}

ensure_postgres_defaults() {
  local postgres_user
  local postgres_password
  local postgres_db
  local generated_password=0
  local database_url
  local derived_database_url

  postgres_user="$(get_env_value "$ENV_FILE" "POSTGRES_USER")"
  if [[ -z "$postgres_user" ]]; then
    postgres_user="$DEFAULT_POSTGRES_USER"
  fi

  postgres_db="$(get_env_value "$ENV_FILE" "POSTGRES_DB")"
  if [[ -z "$postgres_db" ]]; then
    postgres_db="$DEFAULT_POSTGRES_DB"
  fi

  postgres_password="$(get_env_value "$ENV_FILE" "POSTGRES_PASSWORD")"
  if [[ -z "$postgres_password" ]]; then
    postgres_password="$(openssl rand -hex 24)"
    generated_password=1
    log "Generated POSTGRES_PASSWORD"
  fi

  set_env_value "$ENV_FILE" "POSTGRES_USER" "$postgres_user"
  set_env_value "$ENV_FILE" "POSTGRES_PASSWORD" "$postgres_password"
  set_env_value "$ENV_FILE" "POSTGRES_DB" "$postgres_db"

  derived_database_url="$(build_database_url "$postgres_user" "$postgres_password" "$postgres_db")"
  database_url="$(get_env_value "$ENV_FILE" "DATABASE_URL")"
  if [[ -z "$database_url" ]]; then
    set_env_value "$ENV_FILE" "DATABASE_URL" "$derived_database_url"
    return
  fi

  if [[ "$database_url" == "$LEGACY_DATABASE_URL" ]]; then
    set_env_value "$ENV_FILE" "DATABASE_URL" "$derived_database_url"
    return
  fi

  if [[ "$generated_password" -eq 1 && "$database_url" =~ ^postgres://[^@]+@postgres:5432/[^[:space:]]+$ ]]; then
    set_env_value "$ENV_FILE" "DATABASE_URL" "$derived_database_url"
  fi
}

ensure_redis_defaults() {
  local redis_password
  local redis_url
  local derived_redis_url
  local generated_password=0

  redis_password="$(get_env_value "$ENV_FILE" "REDIS_PASSWORD")"
  if [[ -z "$redis_password" ]]; then
    redis_password="$(openssl rand -hex 24)"
    generated_password=1
    log "Generated REDIS_PASSWORD"
  fi
  set_env_value "$ENV_FILE" "REDIS_PASSWORD" "$redis_password"

  derived_redis_url="$(build_redis_url "$redis_password")"
  redis_url="$(get_env_value "$ENV_FILE" "REDIS_URL")"
  if [[ -z "$redis_url" ]]; then
    set_env_value "$ENV_FILE" "REDIS_URL" "$derived_redis_url"
    return
  fi

  if [[ "$redis_url" == "$LEGACY_REDIS_URL" || "$redis_url" == "$LEGACY_REDIS_URL_DB0" ]]; then
    set_env_value "$ENV_FILE" "REDIS_URL" "$derived_redis_url"
    return
  fi

  if [[ "$generated_password" -eq 1 && "$redis_url" =~ ^redis://redis:6379(/[^[:space:]]*)?$ ]]; then
    set_env_value "$ENV_FILE" "REDIS_URL" "$derived_redis_url"
  fi
}

configure_core_env() {
  local database_url_default
  local redis_url_default
  local dashboard_port_default
  local database_url
  local redis_url
  local dashboard_port

  database_url_default="$(get_env_value "$ENV_FILE" "DATABASE_URL")"
  if [[ -z "$database_url_default" ]]; then
    database_url_default="$(build_database_url \
      "$(get_env_value "$ENV_FILE" "POSTGRES_USER")" \
      "$(get_env_value "$ENV_FILE" "POSTGRES_PASSWORD")" \
      "$(get_env_value "$ENV_FILE" "POSTGRES_DB")")"
  fi

  redis_url_default="$(get_env_value "$ENV_FILE" "REDIS_URL")"
  if [[ -z "$redis_url_default" ]]; then
    redis_url_default="$(build_redis_url "$(get_env_value "$ENV_FILE" "REDIS_PASSWORD")")"
  fi

  dashboard_port_default="$(get_env_value "$ENV_FILE" "DASHBOARD_PORT")"
  if [[ -z "$dashboard_port_default" ]]; then
    dashboard_port_default="$DEFAULT_DASHBOARD_PORT"
  fi

  if [[ "$WIZARD_ENABLED" -eq 1 ]]; then
    printf '\n' > /dev/tty
    printf 'Jarvis setup wizard\n' > /dev/tty
    printf 'Press Enter to keep each default.\n' > /dev/tty
    printf '\n' > /dev/tty
  fi

  database_url="$(prompt_with_default "DATABASE_URL" "$database_url_default")"
  redis_url="$(prompt_with_default "REDIS_URL" "$redis_url_default")"
  dashboard_port="$(prompt_with_default "DASHBOARD_PORT" "$dashboard_port_default")"

  set_env_value "$ENV_FILE" "DATABASE_URL" "$database_url"
  set_env_value "$ENV_FILE" "REDIS_URL" "$redis_url"
  set_env_value "$ENV_FILE" "DASHBOARD_PORT" "$dashboard_port"
}

configure_openrouter_key() {
  local openrouter_key
  local existing_key

  if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
    set_env_value "$ENV_FILE" "OPENROUTER_API_KEY" "${OPENROUTER_API_KEY}"
    return
  fi

  existing_key="$(get_env_value "$ENV_FILE" "OPENROUTER_API_KEY")"
  if [[ "$WIZARD_ENABLED" -eq 1 ]]; then
    openrouter_key="$(prompt_optional_secret "OPENROUTER_API_KEY")"
    if [[ -n "$openrouter_key" ]]; then
      set_env_value "$ENV_FILE" "OPENROUTER_API_KEY" "$openrouter_key"
      return
    fi
  fi

  if [[ -z "$existing_key" ]]; then
    log "OPENROUTER_API_KEY not set in .env.docker. Setup wizard will request it on first login."
  fi
}

ensure_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    return
  fi

  if [[ -f "$ENV_TEMPLATE" ]]; then
    cp "$ENV_TEMPLATE" "$ENV_FILE"
    log "Created .env.docker from .env.docker.example"
    return
  fi

  fail "Missing ${ENV_TEMPLATE}. Cannot bootstrap .env.docker."
}

ensure_jarvis_image() {
  local image
  image="$(get_env_value "$ENV_FILE" "JARVIS_IMAGE")"

  if [[ -n "$image" ]]; then
    return
  fi

  set_env_value "$ENV_FILE" "JARVIS_IMAGE" "$DEFAULT_RELEASE_IMAGE"
  log "Set JARVIS_IMAGE=${DEFAULT_RELEASE_IMAGE}"
}

select_deploy_mode() {
  DEPLOY_MODE="pull"
  if is_truthy "${JARVIS_INSTALL_BUILD_FROM_SOURCE:-}"; then
    DEPLOY_MODE="build"
  fi
}

check_supported_platform() {
  local os
  local arch

  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux|Darwin)
      ;;
    *)
      fail "Unsupported OS: ${os}. Supported: Linux or macOS (Docker Desktop)."
      ;;
  esac

  case "$arch" in
    x86_64|amd64|arm64|aarch64)
      ;;
    *)
      fail "Unsupported architecture: ${arch}. Supported: amd64/x86_64 or arm64/aarch64."
      ;;
  esac

  if [[ -n "${FLY_APP_NAME:-}" || -n "${FLY_MACHINE_ID:-}" ]]; then
    log "Fly runtime detected. Docker-in-Docker installs are experimental; a standard Ubuntu VM is the recommended path."
  fi

  log "Preflight platform OK: ${os}/${arch}"
}

check_free_disk() {
  local required_kb
  local available_kb
  local available_gb

  required_kb="$((MIN_FREE_DISK_GB * 1024 * 1024))"
  available_kb="$(df -Pk "$ROOT_DIR" | awk 'NR==2 {print $4}')"

  [[ -n "$available_kb" ]] || fail "Unable to determine free disk space."

  if (( available_kb < required_kb )); then
    available_gb="$((available_kb / 1024 / 1024))"
    fail "Need at least ${MIN_FREE_DISK_GB}GB free disk (found ${available_gb}GB). Free space and retry."
  fi

  available_gb="$((available_kb / 1024 / 1024))"
  log "Preflight disk OK: ${available_gb}GB free"
}

get_available_ram_mb() {
  local os
  os="$(uname -s)"

  if [[ "$os" == "Linux" ]]; then
    awk '
      /MemAvailable:/ {
        printf "%d\n", $2 / 1024
        found = 1
      }
      END {
        if (!found) {
          exit 1
        }
      }
    ' /proc/meminfo
    return
  fi

  if [[ "$os" == "Darwin" ]]; then
    local page_size
    local free_pages
    local inactive_pages
    local speculative_pages
    local available_pages

    page_size="$(sysctl -n hw.pagesize)"
    free_pages="$(vm_stat | awk '/Pages free/ {gsub("[^0-9]", "", $3); print $3}')"
    inactive_pages="$(vm_stat | awk '/Pages inactive/ {gsub("[^0-9]", "", $3); print $3}')"
    speculative_pages="$(vm_stat | awk '/Pages speculative/ {gsub("[^0-9]", "", $3); print $3}')"

    [[ -n "$page_size" && -n "$free_pages" && -n "$inactive_pages" && -n "$speculative_pages" ]] || return 1

    available_pages="$((free_pages + inactive_pages + speculative_pages))"
    printf '%d\n' "$((available_pages * page_size / 1024 / 1024))"
    return
  fi

  return 1
}

check_free_ram() {
  local available_ram_mb
  available_ram_mb="$(get_available_ram_mb)" || fail "Unable to determine available RAM for preflight checks."

  if (( available_ram_mb < MIN_FREE_RAM_MB )); then
    fail "Need at least ${MIN_FREE_RAM_MB}MB available RAM (found ${available_ram_mb}MB)."
  fi

  log "Preflight RAM OK: ${available_ram_mb}MB available"
}

check_https_endpoint() {
  local name="$1"
  local url="$2"
  local status

  status="$(curl -sSIL --connect-timeout 5 --max-time 20 -o /dev/null -w '%{http_code}' "$url" || true)"
  if [[ -z "$status" || "$status" == "000" ]]; then
    fail "Outbound network check failed for ${name} (${url}). Verify DNS/firewall egress and retry."
  fi

  log "Preflight network OK: ${name} (${status})"
}

image_registry_host() {
  local image="$1"
  local first_segment

  if [[ "$image" != */* ]]; then
    printf 'docker.io'
    return
  fi

  first_segment="${image%%/*}"
  if [[ "$first_segment" == *.* || "$first_segment" == *:* || "$first_segment" == "localhost" ]]; then
    printf '%s' "$first_segment"
    return
  fi

  printf 'docker.io'
}

registry_probe_url() {
  local host="$1"

  if [[ "$host" == "docker.io" ]]; then
    printf 'https://registry-1.docker.io/v2/'
    return
  fi

  printf 'https://%s/v2/' "$host"
}

run_preflight_checks() {
  local jarvis_image
  local registry_host
  local registry_url

  check_supported_platform

  docker info >/dev/null 2>&1 || fail "Docker daemon is not running. Start Docker and retry (for Linux: sudo systemctl start docker)."
  log "Preflight Docker daemon OK"

  check_free_disk
  check_free_ram

  check_https_endpoint "Installer fallback (raw.githubusercontent.com)" "https://raw.githubusercontent.com"

  jarvis_image="$(get_env_value "$ENV_FILE" "JARVIS_IMAGE")"
  registry_host="$(image_registry_host "$jarvis_image")"
  registry_url="$(registry_probe_url "$registry_host")"
  check_https_endpoint "Image registry (${registry_host})" "$registry_url"

  if [[ "$DEPLOY_MODE" == "build" ]]; then
    check_https_endpoint "npm registry" "https://registry.npmjs.org/pnpm"
  fi
}

compose_up_pull_mode() {
  log "Pulling images and starting services (postgres, redis, migrate, agent, worker, dashboard)"
  compose_run --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull
  compose_run --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
}

compose_up_build_mode() {
  [[ -f "$COMPOSE_BUILD_FILE" ]] || fail "Missing build override: ${COMPOSE_BUILD_FILE}"

  log "Building from source and starting services (postgres, redis, migrate, agent, worker, dashboard)"
  compose_run --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$COMPOSE_BUILD_FILE" up -d --build
}

start_services() {
  local jarvis_image
  jarvis_image="$(get_env_value "$ENV_FILE" "JARVIS_IMAGE")"

  if [[ "$DEPLOY_MODE" == "build" ]]; then
    log "Deploy mode: build-from-source (JARVIS_INSTALL_BUILD_FROM_SOURCE=1)"
    compose_up_build_mode
    return
  fi

  log "Deploy mode: pull prebuilt image (${jarvis_image})"
  if ! docker pull "$jarvis_image"; then
    if is_truthy "${JARVIS_INSTALL_STRICT_PULL:-}"; then
      fail "Failed to pull ${jarvis_image}. Set JARVIS_IMAGE to a valid published image or set JARVIS_INSTALL_BUILD_FROM_SOURCE=1."
    fi

    log "Could not pull ${jarvis_image}; falling back to build-from-source. Set JARVIS_INSTALL_STRICT_PULL=1 to disable fallback."
    DEPLOY_MODE="build"
    compose_up_build_mode
    return
  fi

  compose_up_pull_mode
}

main() {
  require_cmd docker
  require_cmd awk
  require_cmd openssl
  require_cmd curl
  require_cmd df
  require_cmd uname
  resolve_compose_bin

  ensure_env_file
  ensure_jarvis_image
  select_deploy_mode
  run_preflight_checks

  configure_setup_mode
  ensure_postgres_defaults
  ensure_redis_defaults
  configure_core_env
  configure_openrouter_key

  local dashboard_token
  dashboard_token="$(get_env_value "$ENV_FILE" "DASHBOARD_TOKEN")"
  if [[ -z "$dashboard_token" ]]; then
    dashboard_token="$(openssl rand -hex 32)"
    set_env_value "$ENV_FILE" "DASHBOARD_TOKEN" "$dashboard_token"
    log "Generated DASHBOARD_TOKEN"
  fi

  local encryption_key
  encryption_key="$(get_env_value "$ENV_FILE" "CREDENTIAL_ENCRYPTION_KEY")"
  if [[ -z "$encryption_key" ]]; then
    encryption_key="$(openssl rand -hex 32)"
    set_env_value "$ENV_FILE" "CREDENTIAL_ENCRYPTION_KEY" "$encryption_key"
    log "Generated CREDENTIAL_ENCRYPTION_KEY"
  fi

  local openrouter_key
  openrouter_key="$(get_env_value "$ENV_FILE" "OPENROUTER_API_KEY")"

  local dashboard_port
  dashboard_port="$(get_env_value "$ENV_FILE" "DASHBOARD_PORT")"
  if [[ -z "$dashboard_port" ]]; then
    dashboard_port="$DEFAULT_DASHBOARD_PORT"
    set_env_value "$ENV_FILE" "DASHBOARD_PORT" "$dashboard_port"
  fi

  start_services

  log "Jarvis is running."
  printf '\nDashboard URL: http://<server-ip>:%s\n' "$dashboard_port"
  printf 'Dashboard token: %s\n' "$(get_env_value "$ENV_FILE" "DASHBOARD_TOKEN")"
  printf 'Deploy mode used: %s\n' "$DEPLOY_MODE"
  if [[ -z "$openrouter_key" ]]; then
    printf 'Next step: open the dashboard and complete the setup wizard to add your OpenRouter key.\n'
  fi
  printf 'Show logs: %s --env-file %s -f %s logs -f agent worker dashboard\n' \
    "${COMPOSE_BIN[*]}" "$ENV_FILE" "$COMPOSE_FILE"
}

main "$@"
