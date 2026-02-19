# Phase 10: GitHub Identity and Repo Trust - Research

**Researched:** 2026-02-19
**Domain:** GitHub OAuth identity, trusted repository binding, credential security, and self-modification guardrails
**Confidence:** HIGH-MEDIUM (GitHub OAuth and REST endpoints HIGH; repo-permission edge behavior MEDIUM)

<user_constraints>
## User Constraints (from CONTEXT.md)

No `10-CONTEXT.md` exists yet, so this research used roadmap + requirements only.

Planning assumptions used for this phase:
- Keep existing stack: Hono API + React dashboard + Drizzle/Postgres.
- Reuse existing credential security model (`credentials` table + `CREDENTIAL_ENCRYPTION_KEY`) for GitHub tokens.
- Phase 10 scope is identity + trust binding only; branch/commit/PR orchestration belongs to Phase 11.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEXT-01 | Setup wizard must implement real GitHub OAuth code exchange | Implement OAuth web flow with `GET /login/oauth/authorize` and `POST /login/oauth/access_token`, plus `state` and PKCE validation. |
| SEXT-02 | Persist validated GitHub identity and selected target repository | Call `GET /user`, `GET /user/repos`, and `GET /repos/{owner}/{repo}`; persist user + immutable repo identifiers (`id`, `full_name`, `default_branch`). |
| SEXT-03 | Store GitHub access tokens with existing secret security model | Store token in encrypted `credentials` table (`service='github'`, `key='oauth_token'`) instead of plaintext `setup_state` or logs. |
| SEXT-04 | Deny built-in/core self-modifications if GitHub trust not complete | Add a hard precondition in `tool_write` built-in path that requires connected GitHub identity + validated repo binding + active token credential. |
</phase_requirements>

---

## Summary

The current implementation is intentionally stubbed: `POST /api/setup/github` writes `githubConnected=true` and `githubUsername='pending-oauth'` without real identity proof, token exchange, or repository trust binding. This satisfies UI progression but does not establish an authenticated source of truth for self-modification.

The safest Phase 10 architecture is a two-step trust model:
1. **Identity proof** through real OAuth code exchange, then immediate identity revalidation with `GET /user`.
2. **Repository trust binding** through explicit repo selection + server-side permission verification, persisted as immutable repo identifiers.

This directly supports SEXT-01..04 and sets up Phase 11 branch/PR flow without redesign. Key implementation decision: **store GitHub tokens in encrypted credentials infrastructure, not in setup_state JSON fields or logs**.

**Primary recommendation:** Implement OAuth web flow with `state` + PKCE, persist identity/repo trust tuple, and gate built-in `tool_write` on that tuple.

---

## Standard Stack

### Core

| Library/Capability | Version | Purpose | Why Standard |
|--------------------|---------|---------|--------------|
| GitHub OAuth web app flow (`/login/oauth/authorize`, `/login/oauth/access_token`) | GitHub API (current) | Real user auth and token issuance | Canonical GitHub OAuth flow with documented security controls (`state`, PKCE). |
| GitHub REST API (`/user`, `/user/repos`, `/repos/{owner}/{repo}`) | REST `2022-11-28` | Identity + repo validation | Official endpoint set for delegated repository access checks. |
| `hono` | `^4.7.5` (existing) | Setup API route implementation | Already used in dashboard backend; no framework migration needed. |
| `drizzle-orm` + `pg` | `^0.40.0` + `^8.13.3` (existing) | Persist setup trust state and encrypted token refs | Existing DB stack with typed schema evolution. |
| `credentials` vault schema + pgcrypto AES-256 path | existing | Token-at-rest protection | Existing encrypted credential pattern already used for secrets. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@octokit/rest` | `22.0.1` | Typed GitHub REST client | Use if you want stronger typed endpoint calls and pagination ergonomics. |
| `@octokit/oauth-app` | `8.0.3` | OAuth exchange helper | Optional abstraction over manual token exchange requests. |
| Node `crypto` (built-in) | Node runtime | Generate `state` and PKCE verifier/challenge | Mandatory for CSRF resistance and PKCE correctness. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OAuth App in Phase 10 | GitHub App user-to-server auth | GitHub Apps are more secure/fine-grained long-term, but add installation/permission complexity for this phase. |
| Raw `fetch` for GitHub API | Octokit client | `fetch` keeps dependency surface minimal; Octokit improves typing and endpoint ergonomics. |
| Token in `setup_state`/`agent_state` | Encrypted `credentials` entry + credential ID reference | Plaintext JSON is easier but fails SEXT-03 security requirement. |
| Boolean-only `githubConnected` trust | Persisted identity + repo tuple (`user_id`, `repo_id`, `full_name`, `default_branch`, validated_at) | Boolean-only trust is easy to spoof and cannot protect built-in modifications. |

**Installation (if using Octokit):**
```bash
pnpm add @octokit/rest @octokit/oauth-app --filter @jarvis/dashboard
```

---

## Architecture Patterns

### Recommended Project Structure

```
apps/dashboard/src/routes/
├── setup.ts                    # Extend with OAuth start, callback, bind endpoints
└── oauth-callback.ts (optional) # Public callback route outside /api auth middleware

packages/db/src/schema/
├── setup-state.ts              # Add repo-binding trust columns
└── identities.ts               # Reuse credentials table for encrypted oauth token storage

packages/tools/src/self-extension/
└── tool-writer.ts              # Add built-in modification precondition guard
```

### Pattern 1: Split Start/Callback OAuth Flow (auth-aware)

**What:** Use authenticated start endpoint to mint state/PKCE, then public callback route to receive GitHub redirect.

**When to use:** Always, because `/api/*` currently requires bearer auth and GitHub callback cannot send dashboard bearer headers.

**Implementation shape:**
- `POST /api/setup/github/start` (authenticated): generate `state`, `code_verifier`, optional `return_to`, persist short-lived challenge record, return authorize URL.
- Browser redirects to GitHub authorize URL.
- `GET /setup/github/callback` (public route): verify `state`, exchange `code`, fetch `GET /user`, store encrypted token + identity metadata, mark `githubConnected=true`, redirect back to dashboard.

### Pattern 2: Server-Side Repository Trust Binding

**What:** Operator selects repo; backend validates and persists immutable repo identity.

**When to use:** Immediately after identity connect, before any self-modifying built-in action.

**Validation flow:**
1. `GET /repos/{owner}/{repo}` with bearer token.
2. Assert repository exists and returned `id`, `full_name`, `default_branch`.
3. Assert sufficient permission (`permissions.push` or `permissions.admin`); optionally cross-check with collaborator permission endpoint.
4. Persist binding and `validatedAt` timestamp.

### Pattern 3: Token Storage via Existing Credential Vault Model

**What:** Store OAuth token in encrypted credential rows and only persist credential reference in setup state.

**When to use:** Every GitHub token write/refresh/revocation path.

**Data model pattern:**
- `credentials`: `service='github'`, `key='oauth_token'`, encrypted value.
- `setup_state`: `githubTokenCredentialId`, `githubUserId`, `githubUsername`, `githubRepoFullName`, `githubRepoId`, `githubRepoDefaultBranch`, `githubRepoValidatedAt`.

### Pattern 4: Built-In Self-Modification Guard (SEXT-04)

**What:** Reject `builtinModify=true` unless trust preconditions pass.

**When to use:** At the top of built-in branch in `createToolWriteTool(...).execute()`.

**Guard checks:**
- Setup row exists and `githubConnected` true.
- Repo binding fields non-null and recently validated.
- Active GitHub token credential exists.
- If any check fails: return deterministic, operator-readable rejection message.

### Anti-Patterns to Avoid

- Keeping GitHub callback under `/api/*` auth middleware (callback will fail without dashboard bearer token).
- Treating `githubConnected` boolean alone as trust proof.
- Accepting client-provided username/repo values without GitHub API verification.
- Writing OAuth tokens into `setup_state`, logs, exceptions, or telemetry payloads.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth CSRF defense | Homegrown weak nonce flow | GitHub-documented `state` + PKCE (`S256`) | Standard, reviewed, and interoperable with GitHub token exchange rules. |
| Repo permission inference | Custom string-role mapping from UI | GitHub permissions fields/endpoints | Avoids privilege misclassification and org-team inheritance mistakes. |
| Secret-at-rest crypto | Ad hoc app-level token encryption format | Existing pgcrypto-backed credential vault model | Already integrated and aligned with project secret model. |
| Trust gating | Scattered checks across multiple call sites | Single reusable guard used by `tool_write` built-in path | Prevents bypass drift and simplifies future Phase 11/12 enforcement. |

**Key insight:** the hardest failures here are trust-boundary mistakes, not OAuth syntax mistakes.

---

## Common Pitfalls

### Pitfall 1: Auth middleware blocks callback
**What goes wrong:** GitHub redirects to callback that is protected by bearer auth.
**Why it happens:** global `/api/*` auth middleware catches callback path.
**How to avoid:** expose callback outside `/api/*` or add explicit middleware bypass.
**Warning signs:** OAuth returns from GitHub, then immediately sees 401/403 from dashboard.

### Pitfall 2: Identity and repo get out of sync
**What goes wrong:** `githubUsername` stored, but token now belongs to another user or lost repo access.
**Why it happens:** token validated once, never revalidated.
**How to avoid:** revalidate with `GET /user` on connect and before critical operations; persist `validatedAt` and fail closed on mismatch.
**Warning signs:** branch/PR calls return 403 for previously bound repo.

### Pitfall 3: Over-broad OAuth scopes without policy
**What goes wrong:** app requests full `repo` when only metadata is needed in some paths.
**Why it happens:** scope strategy not defined early.
**How to avoid:** document minimum viable scope set for each endpoint and enforce in setup docs.
**Warning signs:** organization policy blocks authorization requests.

### Pitfall 4: Token leakage in diagnostics
**What goes wrong:** token values appear in route error payloads or logs.
**Why it happens:** raw request/response logging around OAuth exchange.
**How to avoid:** strict secret redaction and never include token fields in thrown errors.
**Warning signs:** grep finds token-like prefixes in logs or activity entries.

---

## Code Examples

### OAuth Start Endpoint (state + PKCE)

```typescript
import { randomBytes, createHash } from 'node:crypto';

function toBase64Url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const state = toBase64Url(randomBytes(32));
const codeVerifier = toBase64Url(randomBytes(32));
const codeChallenge = toBase64Url(createHash('sha256').update(codeVerifier).digest());

// Persist { state, codeVerifier, expiresAt } server-side, then redirect to authorize URL.
```

### OAuth Callback Exchange + Identity Validation

```typescript
const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_id, client_secret, code, redirect_uri, code_verifier }),
});
const tokenJson = await tokenRes.json() as { access_token?: string };

const userRes = await fetch('https://api.github.com/user', {
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${tokenJson.access_token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  },
});
```

### Built-In Modification Guard Hook

```typescript
if (input.builtinModify) {
  const trust = await loadGitHubTrustState(db);
  if (!trust.ok) {
    return { success: false, error: `Built-in modification blocked: ${trust.reason}` };
  }
  // Continue with staging deploy path
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OAuth without PKCE/state rigor | OAuth authorization code with PKCE + state | Current best practice in GitHub OAuth docs | Stronger CSRF/interception resistance. |
| Boolean setup completion | Trust tuple (identity + bound repo + validation timestamp) | Current secure onboarding pattern | Enables enforceable policy checks for self-modification. |
| OAuth app as default recommendation | GitHub Apps preferred for fine-grained, short-lived tokens | Current GitHub guidance | Indicates migration target after Phase 10 baseline is stable. |

**Deprecated/outdated for this domain:**
- Treating a successful redirect alone as proof of durable repository trust.

---

## Open Questions

1. **OAuth App now vs GitHub App now**
   - What we know: GitHub recommends GitHub Apps for fine-grained permissions and short-lived tokens.
   - What's unclear: Whether current milestone prioritizes fastest secure path (OAuth App) or immediate GitHub App install complexity.
   - Recommendation: Implement OAuth App trust flow in Phase 10, keep schema/API shaped for GitHub App migration in Phase 11/12.

2. **Single bound repository vs multi-repository set**
   - What we know: requirement says selected target repository (singular).
   - What's unclear: whether future strategy requires concurrent repos.
   - Recommendation: store one active binding now with room for future `github_repo_bindings` table.

3. **Token refresh policy for OAuth app tokens**
   - What we know: OAuth tokens may be long-lived until revoked (depends on app configuration/features).
   - What's unclear: whether this app will enable expiring-token optional features.
   - Recommendation: implement revocation handling now; add explicit refresh flow only if expiring mode is enabled.

---

## Sources

### Primary (HIGH confidence)
- GitHub OAuth web flow: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- OAuth scopes (including `repo`, `read:user`, `user:email`): https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
- GitHub Apps vs OAuth apps guidance: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps
- REST auth headers and API versioning: https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api
- REST repositories endpoints (`GET /user/repos`, `GET /repos/{owner}/{repo}`): https://docs.github.com/en/rest/repos/repos
- REST users endpoint (`GET /user`): https://docs.github.com/en/rest/users/users
- REST collaborator permission endpoint: https://docs.github.com/en/rest/collaborators/collaborators
- OAuth app token check endpoint (`POST /applications/{client_id}/token`): https://docs.github.com/en/rest/apps/oauth-applications

### Secondary (MEDIUM confidence)
- npm registry current package versions (queried 2026-02-19):
  - `@octokit/rest` = `22.0.1`
  - `@octokit/oauth-app` = `8.0.3`
  - `@octokit/auth-oauth-user` = `6.0.2`

### Codebase context
- `apps/dashboard/src/routes/setup.ts`
- `apps/dashboard/client/src/components/SetupStepGitHub.tsx`
- `packages/db/src/schema/setup-state.ts`
- `packages/db/src/schema/identities.ts`
- `packages/tools/src/self-extension/tool-writer.ts`
- `packages/tools/src/self-extension/index.ts`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (official docs + current dependency inventory)
- Architecture patterns: HIGH-MEDIUM (directly constrained by existing auth middleware and code layout)
- Pitfalls: HIGH (observed from current implementation and documented endpoint behavior)

**Research date:** 2026-02-19
**Valid until:** 2026-03-21 (revalidate GitHub docs/endpoints before execution)
