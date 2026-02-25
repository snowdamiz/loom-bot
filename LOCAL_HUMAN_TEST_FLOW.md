# Local Human Test Flow (Installer Bootstrap): Setup to First Main Agent Launch

This runbook uses the installer flow (no manual env editing) to verify the full local operator path through first main-agent spawn.

## Scope

- Bootstrap via installer script only
- Setup wizard completion (OpenRouter + GitHub step)
- First main-agent launch validation (Supervisor spawns goal loop)

## Prerequisites

- Docker + Docker Compose
- `curl` and `bash`
- OpenRouter API key (you can provide during install or in dashboard setup wizard)

## 1. Bootstrap everything with the installer

### Option A: One-command remote bootstrap

```bash
bash <(curl -fsSL https://getloom.dev/install.sh)
```

Set your install dir for later commands:

```bash
if [ -d /opt/jarvis ]; then
  export JARVIS_DIR=/opt/jarvis
else
  export JARVIS_DIR="$HOME/jarvis"
fi
```

### Option B: Same flow from a local checkout

```bash
cd /Users/sn0w/Documents/dev/jarvis
export JARVIS_INSTALL_BUILD_FROM_SOURCE=1
pnpm docker:install
export JARVIS_DIR=/Users/sn0w/Documents/dev/jarvis
```

Both paths run `./scripts/install-docker.sh`, which:

- Creates/uses `.env.docker` automatically
- Runs strict preflight checks (OS/arch, Docker daemon, Compose, disk, RAM, outbound network)
- Generates `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `DASHBOARD_TOKEN`, `CREDENTIAL_ENCRYPTION_KEY` when missing
- Sets `DATABASE_URL`, `REDIS_URL`, and `DASHBOARD_PORT` defaults (with wizard prompts)
- Pulls released runtime images and starts `postgres`, `redis`, `migrate`, `agent`, `worker`, `dashboard`
- Falls back to source build automatically when image pull fails (or use `JARVIS_INSTALL_BUILD_FROM_SOURCE=1` explicitly)

No manual env variable editing is required.

## 2. Capture dashboard access values

Installer output prints:

- `Dashboard URL: http://<server-ip>:<port>`
- `Dashboard token: <token>`

For local machine testing, open `http://localhost:<port>` (default `3001`).

If you missed the token:

```bash
cd "$JARVIS_DIR"
grep '^DASHBOARD_TOKEN=' .env.docker | cut -d= -f2-
```

## 3. Confirm services are running

```bash
cd "$JARVIS_DIR"
docker compose --env-file .env.docker -f docker-compose.deploy.yml ps
```

Expected:

- `postgres`, `redis`, `agent`, `worker`, `dashboard` are up
- `migrate` completed successfully

Useful live logs:

```bash
cd "$JARVIS_DIR"
docker compose --env-file .env.docker -f docker-compose.deploy.yml logs -f agent worker dashboard
```

## 4. Login and complete setup wizard

1. Open dashboard in browser.
2. Authenticate with `DASHBOARD_TOKEN` from installer output.
3. Complete setup wizard:
- Step 1: OpenRouter key (`Validate & Save`)
- Step 2: GitHub (`Connect GitHub Account` or `Skip for Now`)

API verification:

```bash
cd "$JARVIS_DIR"
DASH_TOKEN="$(grep '^DASHBOARD_TOKEN=' .env.docker | cut -d= -f2-)"
curl -s http://localhost:3001/api/setup \
  -H "Authorization: Bearer $DASH_TOKEN"
```

Expected fields:

- `openrouterKeySet: true`
- `githubConnected: true`
- `complete: true`

## 5. Verify first-boot agent state

With clean first boot, `agent` logs should show:

- `Kill switch activated: first boot, agent starts OFF.`
- `Seed goal inserted: self-evolution mission (paused).`
- `Autonomous loop started. Supervisor active.`

Note: The seeded goal is `paused`, so no main goal loop starts yet.

## 6. Launch the first main agent

You need both:

1. Kill switch deactivated
2. At least one `active` goal

### 6.1 Deactivate kill switch

Dashboard path:

- `Overview` -> `Emergency Control` -> `Resume Agent`

Or API:

```bash
cd "$JARVIS_DIR"
DASH_TOKEN="$(grep '^DASHBOARD_TOKEN=' .env.docker | cut -d= -f2-)"
curl -s -X POST http://localhost:3001/api/kill-switch \
  -H "Authorization: Bearer $DASH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"deactivate","reason":"local human test"}'
```

### 6.2 Create an active operator goal

```bash
cd "$JARVIS_DIR"
DASH_TOKEN="$(grep '^DASHBOARD_TOKEN=' .env.docker | cut -d= -f2-)"
curl -s -X POST http://localhost:3001/api/goals \
  -H "Authorization: Bearer $DASH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Local human test goal: verify first main agent launch"}'
```

Expected response includes `goalId`.

## 7. Verify first main-agent spawn

Within about 10 seconds (supervisor tick), expect in agent logs:

- `[supervisor] Spawning main agent for goal <goalId>.`
- `[agent-loop] Executing sub-goal ...`

Status API check:

```bash
cd "$JARVIS_DIR"
DASH_TOKEN="$(grep '^DASHBOARD_TOKEN=' .env.docker | cut -d= -f2-)"
curl -s http://localhost:3001/api/status \
  -H "Authorization: Bearer $DASH_TOKEN"
```

Expected:

- `isHalted: false`
- `activeGoals` contains your injected goal
- `systemStatus: "running"`

## 8. Pass criteria

Test passes when all are true:

- Installer bootstrap completes without manual env editing
- Dashboard login works with generated token
- Setup wizard completes (`/api/setup.complete === true`)
- Kill switch can be deactivated
- Operator goal can be created via `/api/goals`
- Supervisor spawns first main agent and sub-goal execution begins

## Troubleshooting

- `401 Unauthorized`:
  - Wrong token. Re-read `DASHBOARD_TOKEN` from `.env.docker`.
- Setup wizard rejects OpenRouter key:
  - Invalid key or no network path to OpenRouter.
- No main agent spawn after resume:
  - Ensure you created an active goal after kill switch deactivation.
- Agent waits for OpenRouter key:
  - Finish setup wizard Step 1; agent polls and continues automatically.
- Port conflict on `3001`:
  - Change `DASHBOARD_PORT` in installer wizard and rerun installer.
