# Production Deployment Guide (Install Script)

This guide shows how to run Jarvis in production using the install script flow:

```bash
bash <(curl -fsSL https://getloom.dev/install.sh)
```

It is designed for hosts where you control a Linux VM with Docker and Docker Compose.

## What the install script does

The install flow (`install.sh` -> `scripts/install-hosted.sh` -> `scripts/install-docker.sh`) will:

- Download/update Jarvis source
- Preserve existing `.env.docker` on reinstall
- Run strict preflight checks (OS/arch, Docker daemon, Compose, disk, RAM, outbound network)
- Generate missing secrets (`POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `DASHBOARD_TOKEN`, `CREDENTIAL_ENCRYPTION_KEY`)
- Configure `DATABASE_URL`, `REDIS_URL`, and `DASHBOARD_PORT`
- Set `JARVIS_IMAGE` to `ghcr.io/snowdamiz/loom-bot:latest` when not already set
- Pull and start production services from `docker-compose.deploy.yml`:
  - `postgres`
  - `redis`
  - `migrate`
  - `agent`
  - `worker`
  - `dashboard`

## Platform compatibility

### Works well

- DigitalOcean Droplets
- AWS EC2
- GCP Compute Engine
- Azure VM
- Hetzner / Linode / VPS providers

### Advanced / experimental

- Fly.io (Docker-in-Docker VM/Machine mode)

### Not compatible with install-script flow

- Heroku dynos (no Docker daemon + Docker Compose access inside dyno runtime)

If you must use Heroku, you need a custom deployment model (separate containers/services and external Postgres/Redis), not this installer workflow.

## Production prerequisites

- Ubuntu/Debian Linux VM (recommended)
- Root or sudo access
- Public IP or domain
- Open outbound internet access (for package pulls and OpenRouter)
- Ports:
  - `22` (SSH)
  - `3001` (or your chosen `DASHBOARD_PORT`)

## Baseline server setup

Run on a fresh Ubuntu host:

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg lsb-release

# Install Docker (official convenience script)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker

# Verify Docker + Compose
docker --version
docker compose version
```

## One-command production install

```bash
bash <(curl -fsSL https://getloom.dev/install.sh)
```

The installer prompts for:

- `DATABASE_URL` (press Enter to keep default bundled Postgres)
- `REDIS_URL` (press Enter to keep default bundled Redis)
- `DASHBOARD_PORT` (default `3001`)
- Optional `OPENROUTER_API_KEY`

Installer runtime mode defaults to image pull (`JARVIS_IMAGE`). To force source build use `JARVIS_INSTALL_BUILD_FROM_SOURCE=1`.
To fail hard on image pull failures instead of build fallback, set `JARVIS_INSTALL_STRICT_PULL=1`.

At the end, it prints:

- Dashboard URL
- Dashboard token
- Logs command

## Fly.io recipe (advanced / experimental)

This recipe treats Fly as a VM host where you run Docker yourself. Use this only if you are comfortable debugging Docker-in-Docker storage/daemon issues.

1. Create a Fly VM/Machine with persistent disk and enough resources.
1. SSH into the machine.
1. Install Docker + Compose (baseline setup above).
1. Run:

```bash
bash <(curl -fsSL https://getloom.dev/install.sh)
```

1. Open inbound `DASHBOARD_PORT` (default `3001`) in your Fly networking/firewall setup.
1. Optional but recommended: put a TLS reverse proxy in front of dashboard.

Notes for Fly:

- Persist data by preserving Docker volumes (`postgres_data`, `agent_tools`).
- If replacing machines, migrate/attach persistent volume data before cutover.
- If overlayfs/storage-driver issues appear, use a standard Ubuntu VM provider as the default fallback path.

## Heroku note

Heroku dynos do not support this install-script architecture because it depends on:

- Running Docker daemon
- Running Docker Compose-managed multi-service stack
- Persistent local volumes for Postgres/Redis and agent tools

Use a VM provider (or Fly VM/Machine mode) for this installer flow.

## Non-interactive/CI install

For automation pipelines:

```bash
export JARVIS_INSTALL_NONINTERACTIVE=1
bash <(curl -fsSL https://getloom.dev/install.sh)
```

Optional secret injection before install:

```bash
export OPENROUTER_API_KEY='sk-or-...'
export JARVIS_INSTALL_NONINTERACTIVE=1
bash <(curl -fsSL https://getloom.dev/install.sh)
```

## Post-install verification

From install directory (`/opt/jarvis` for root, `~/jarvis` otherwise):

```bash
docker compose --env-file .env.docker -f docker-compose.deploy.yml ps
docker compose --env-file .env.docker -f docker-compose.deploy.yml logs -f agent worker dashboard
```

Expected:

- `postgres`, `redis`, `agent`, `worker`, `dashboard` running
- `migrate` exited successfully

## First login and activation

1. Open `http://<server-ip>:<DASHBOARD_PORT>`.
1. Login with `DASHBOARD_TOKEN` from installer output.
1. Complete setup wizard (OpenRouter + GitHub step).
1. Deactivate kill switch in dashboard to allow operations.

## Operations

### Show logs

```bash
docker compose --env-file .env.docker -f docker-compose.deploy.yml logs -f agent worker dashboard
```

### Restart stack

```bash
docker compose --env-file .env.docker -f docker-compose.deploy.yml restart
```

### Stop stack

```bash
docker compose --env-file .env.docker -f docker-compose.deploy.yml down
```

### Upgrade to latest

Use the dedicated update script (it preserves `.env.docker`):

```bash
bash <(curl -fsSL https://getloom.dev/update.sh)
```

If you need interactive prompts during an update, run:

```bash
JARVIS_INSTALL_NONINTERACTIVE=0 bash <(curl -fsSL https://getloom.dev/update.sh)
```

## Production hardening checklist

- Set a strong `DASHBOARD_TOKEN` (auto-generated by installer if missing).
- Restrict dashboard access with firewall/security groups.
- Put TLS termination in front of dashboard (Nginx/Caddy/Cloudflare Tunnel).
- Keep host patched (`apt upgrade`).
- Back up Docker volume data regularly, especially Postgres.
- Monitor disk growth for Postgres and logs.
- Rotate secrets (`DASHBOARD_TOKEN`, `CREDENTIAL_ENCRYPTION_KEY`, API keys) on schedule.

## Backup notes

At minimum, back up:

- Postgres data volume (`postgres_data`)
- `.env.docker`
- Agent-authored tools volume (`agent_tools`)

Without these, you lose state, credentials, and runtime-created tools.

## Troubleshooting

- `Docker daemon is not running` during install:
  - Start Docker service and rerun.
- `Docker Compose is not available`:
  - Install Compose v2 (`docker compose`).
- `Need at least <n>GB free disk` or `Need at least <n>MB available RAM`:
  - Free resources on host, or lower thresholds temporarily via `JARVIS_MIN_FREE_DISK_GB` / `JARVIS_MIN_FREE_RAM_MB`.
- `Failed to pull ghcr.io/...`:
  - Set `JARVIS_IMAGE` to a valid published image, or run with `JARVIS_INSTALL_BUILD_FROM_SOURCE=1`.
- Dashboard unreachable:
  - Check firewall/security group and `DASHBOARD_PORT` mapping.
- `401 Unauthorized` in dashboard/API:
  - Verify `DASHBOARD_TOKEN` in `.env.docker`.
- Agent waits for OpenRouter key:
  - Add key in setup wizard or set `OPENROUTER_API_KEY` in `.env.docker`, then restart stack.
