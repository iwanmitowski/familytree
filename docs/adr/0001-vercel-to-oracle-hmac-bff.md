# ADR 0001: Vercel-to-Oracle communication via a signed BFF

- **Status:** Accepted
- **Date:** 2026-07-18
- **Context ref:** idea.md §2, §4, §5, §26

## Context

The frontend runs on Vercel; the database and business logic run on an Oracle Always Free ARM64 VM. We need the Vercel side to invoke backend operations securely. Three options were considered:

1. **Direct PostgreSQL connection from Vercel** to the Oracle database.
2. **Public REST API on Oracle protected by user OAuth tokens** validated on the Oracle side.
3. **Backend-for-Frontend (BFF) on Vercel that signs requests to a private Oracle API** with a shared secret (HMAC).

Constraints: PostgreSQL must never be exposed to the internet (idea.md §2, §3); the browser must never talk to the Oracle API directly (idea.md §2); public users have no accounts, so there is no per-user token to validate; the solution must be economical and simple (idea.md §26).

## Decision

Adopt **option 3**. Next.js Route Handlers act as a BFF: they validate input, verify Turnstile, authenticate admins (Auth.js), compute the client fingerprint, add an idempotency key, and **HMAC-SHA256-sign** each request to the Oracle API over a canonical payload (method, path, timestamp, nonce, idempotency key, body hash, actor id, actor role). The Oracle API verifies the signature (constant-time), rejects replays (nonce store) and stale requests (±5 min), enforces idempotency, and authorizes from the **signed** actor role. Only `GET /health` is unauthenticated. The exact bytes are pinned in `contracts/hmac.md` with Go↔TypeScript test vectors.

## Consequences

**Positive**
- PostgreSQL stays fully private; the only public surface is Caddy → API over TLS.
- Public users need no accounts; the BFF is the single trust translator (OAuth session → signed service request).
- Replay, tampering, and clock-skew attacks are mitigated; secrets never reach the browser.
- Symmetric HMAC is cheap and simple to operate — no token service, no key infrastructure beyond one shared secret.

**Negative / risks**
- The shared secret must be identical on Vercel and Oracle and rotated carefully (documented in deployment).
- The signing algorithm lives in `packages/shared` and is used by both the BFF (signing) and the API (verification), so there is a single implementation (see ADR 0004); golden test vectors in CI guard against regressions.
- All traffic funnels through the BFF; it must remain thin and must normalize errors so backend internals never leak (idea.md §17).

## Alternatives rejected

- **Direct DB from Vercel** — would require exposing PostgreSQL or a tunnel, violating idea.md §2/§3, and couples the frontend to the schema.
- **User-OAuth-validated public API** — public users have no accounts; validating OAuth on Oracle duplicates auth and enlarges the public attack surface. Admin OAuth is still handled, but on the Vercel side only.
