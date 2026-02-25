# Deployment Friction Report (Production Install)

Date: 2026-02-20
Scope: Attempted production deployment using the documented install flow (`curl -fsSL https://getloom.dev/install.sh | bash`) on Fly Machines.

## Executive summary

This was not only a Fly issue.

- Primary friction is in installer/distribution and build strategy.
- Fly amplified the pain because the current install model assumes a normal VM with a stable Docker daemon, Compose plugin, and compatible storage driver.
- The current "one-command install" promise is not true in practice for fresh hosts.

## What failed and why

| Symptom | Category | Likely root cause | End-user impact |
|---|---|---|---|
| `https://getloom.dev/install.sh` returned HTML instead of shell script | Installer/distribution | Install script is not reliably served from the public domain path used in docs | First command fails immediately |
| Docker daemon not ready by default on Fly machine | Host/platform + installer assumptions | Installer expects Docker already installed and running (`scripts/install-docker.sh`) | Users must perform manual host bootstrap |
| Compose plugin install friction/conflicts | Host/bootstrap | No single supported host bootstrap path; package differences across images | Users debug apt/dpkg instead of installing app |
| Docker build storage failure (`overlayfs` invalid argument) | Fly-specific (nested Docker) | Docker-in-Docker storage driver mismatch in this environment | Build cannot proceed without low-level daemon tuning |
| Corepack/pnpm fetch instability in container build | Build strategy | Build happens at install time with network-heavy dependency resolution | Non-deterministic install failures |
| TypeScript failure at `@jarvis/tools` -> `@jarvis/browser` during container build | Build pipeline robustness | Source-build-on-target is brittle; failures are expensive and opaque to end users | Install blocks late after long build |

## Is this Fly.io fault?

Partially.

- Fly-specific issue: Docker-in-Docker ergonomics (daemon lifecycle, storage driver behavior) are a real source of friction here.
- Not Fly-specific: script distribution reliability, install-time source builds, and weak preflight checks would still cause failures on other hosts.

Conclusion: Fly is not the sole root cause. The install flow is currently too fragile and host-dependent.

## Main product gaps for end users

1. No reliable installer delivery endpoint for `install.sh`.
2. "One-command" UX depends on hidden prerequisites not auto-validated or auto-remediated.
3. Install performs full monorepo build on target host instead of pulling a tested image artifact.
4. No provider-specific golden path with hard guarantees.
5. Failure messages are mostly low-level and not task-oriented.

## Priority improvements (to make install easy)

## P0 (immediate)

1. Fix script delivery:
- Ensure `https://getloom.dev/install.sh` serves the shell script with correct content type.
- Add fallback command in docs (for example, GitHub raw URL).
- Add a CI check that validates installer URL returns a shell script, not HTML.

2. Add strict preflight to installer:
- Verify OS, arch, Docker daemon, Compose, free disk/RAM, and outbound network before any heavy work.
- Fail with actionable remediation commands.

3. Correct docs on Fly:
- Move Fly from "works well" to "advanced/experimental" for current installer architecture.
- Recommend a simpler default host for now (standard Ubuntu VM where Docker is first-class).

## P1 (short term)

1. Stop building source at install time by default:
- Publish versioned OCI images (for example GHCR) in CI.
- Installer should `docker compose pull` + `up`, not `build`.
- Keep `--build-from-source` as opt-in.

2. Pin and verify artifacts:
- Install by release version, not mutable `main`.
- Add digest pinning/checksum for scripts and images.

3. Add install smoke tests in CI:
- Fresh-VM integration tests for the documented command.
- Mark release as failed if install path fails.

## P2 (structural)

1. Provide two explicit deploy tracks:
- "VM Easy Mode" (recommended): single Ubuntu VM with cloud-init/bootstrap script.
- "Fly Native Mode": no Docker-in-Docker; native Fly app topology with external Postgres/Redis.

2. Reduce interactive friction:
- Non-interactive-first installer with optional guided mode.
- Single summary at end: URL, token, next step.

## Recommended golden path (now)

Until P1 is complete, the easiest path for end users should be:

1. Use a standard Ubuntu VM provider (DigitalOcean/Linode/Hetzner EC2-style VM).
2. Run one tested bootstrap script that installs/starts Docker.
3. Run Jarvis installer in non-interactive mode with minimal required env.

Do not position Fly Docker-in-Docker as the default path.

## Definition of "easy install" success

1. Fresh host to running dashboard in under 10 minutes.
2. One command from docs works without manual package conflict debugging.
3. No source compilation on end-user machine by default.
4. Deterministic outputs: URL, token, health status.
5. Automated CI continuously validates the exact documented install command.

## Concrete repo changes to queue next

1. Update `README.md` install section and provider recommendations.
2. Update `PRODUCTION_INSTALL_SCRIPT_DEPLOYMENT.md` compatibility table and Fly guidance.
3. Add preflight checks to `scripts/install-docker.sh` and/or a dedicated `scripts/preflight.sh`.
4. Add release artifact pipeline (publish `jarvis` image, then installer consumes released image).
5. Add CI job that curls installer URL and asserts it is a shell script.
