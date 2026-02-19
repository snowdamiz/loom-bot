# Phase 6: Browser, Identity, and Bootstrapping - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The agent can interact with any website, create and manage synthetic identities with full personas, store credentials securely in an encrypted vault, and provision its own tools and service accounts without operator involvement. Browser automation includes maximum stealth capability. The strategy engine (Phase 7) and self-extension code generation (Phase 8) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Identity lifecycle
- Full personas: complete fake identities with name, email, profile picture, backstory, consistent details across services
- Agent handles all verification autonomously (temp email, temp phone, CAPTCHA solving) — escalates to operator via Discord DM only when a real human identity is required, then waits for reply
- Agent decides whether to use single identity or identity pool based on the scenario at hand
- Agent decides when to retire/rotate identities based on risk signals (rate limits, CAPTCHA frequency, account warnings)

### Credential vault model
- Postgres pgcrypto (pgp_sym_encrypt/decrypt) for encryption at rest
- Credentials are identity-scoped — each credential belongs to a specific identity; retired identity = archived credentials
- Agent gets full access to raw credential values (secrets flow through LLM context)
- Full audit trail on dashboard: every credential access logged with who, when, why, which identity; operator sees credential metadata and access history (not secret values)

### Browser interaction scope
- Maximum stealth capability: stealth plugins, fingerprint randomization, residential proxies, human-like timing/mouse movements
- Agent should leverage tools like Browser Use and DevTools MCP when available (won't always work)
- Agent autonomously decides stealth level per situation — maximum capability available, agent optimizes usage
- CAPTCHA handling: agent decides approach per situation — solving services for critical flows, AI vision attempts for simple CAPTCHAs, escalate to operator if stuck
- Session persistence: agent decides per-service whether to persist browser state (cookies, storage) or start fresh
- Full SPA support (React, Vue, dynamic apps) with agent optimizing between lightweight HTTP requests and full browser rendering for efficiency

### Self-provisioning boundaries
- Fully autonomous npm package installation at runtime — no approval required
- Fully autonomous account creation on external services using synthetic identities — no approval required
- Fully autonomous provisioning of paid services — agent decides if cost is worth it, no additional approval beyond existing Phase 4 spend governance
- Runtime-installed packages persist permanently across restarts — agent's capabilities grow over time

### Claude's Discretion
- Browser engine choice (Playwright vs Puppeteer vs other)
- Specific stealth plugin selection and configuration
- Identity generation implementation (persona creation, profile picture sourcing)
- Session storage format and cleanup strategy for persistent browser state
- Package installation isolation/sandboxing approach

</decisions>

<specifics>
## Specific Ideas

- Agent should be able to use "Browser Use" and "DevTools MCP" tools when they're available and appropriate
- The overarching theme is maximum agent autonomy — the agent decides strategy per situation rather than following rigid rules
- Operator escalation only for real human identity requirements (not for technical hurdles the agent can solve itself)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-browser-identity-and-bootstrapping*
*Context gathered: 2026-02-18*
