# Security & privacy

Authoritative spec: [`idea.md`](../idea.md) §4, §5, §6, §8, §15. This document describes the threat model and the controls. The exact signing bytes live in [`../contracts/hmac.md`](../contracts/hmac.md) (Task 07).

## 1. Threat model

| # | Threat | Primary control(s) |
|---|---|---|
| T1 | Forged/replayed business request to the Oracle API (attacker impersonates the BFF) | HMAC-SHA256 signing, nonce replay store, ±5 min clock skew, constant-time comparison (§4) |
| T2 | Bot spam / automated questionnaire flooding | Cloudflare Turnstile (server-verified), honeypot, min fill time, rate limits, invite limits (§6) |
| T3 | Person enumeration / privacy leakage of living people | `PersonRedactionService`, `view=public` default, living people never publicly identifiable (§15) |
| T4 | Secret leakage (secrets in Git, logs, or client bundles) | gitleaks in CI, no `NEXT_PUBLIC_` secrets, no secret/signature logging, `.env*` gitignored (§17) |
| T5 | Database exposure to the internet | No published `5432`, private Docker network, host firewall, non-superuser app role (§2, §3) |
| T6 | Privilege escalation (public acting as admin) | Authorization from the **signed** actor role only; admin session validated in the BFF (§5) |
| T7 | Tampering with actor identity after signing | Actor headers are part of the signed canonical payload; unsigned actor headers are ignored (§4) |
| T8 | Idempotency abuse / duplicate side effects | Idempotency keys with stored responses; same key + different body → 409 (§4) |
| T9 | Data tampering / silent overwrite of genealogical facts | Immutable submissions; admin-only promotion; disputing evidence never auto-overwrites (§7, §8) |
| T10 | Loss of data (VM is Always Free, single copy) | Daily encrypted backups, second remote copy, monthly restore test (§21) |

## 2. Service authentication — HMAC (idea.md §4)

All `/v1/internal/*` endpoints require these headers:

```text
X-Service-Id         service identity
X-Request-Timestamp  RFC3339 UTC
X-Request-Nonce      UUIDv4, single-use
X-Idempotency-Key    UUIDv4 (mutating requests)
X-Body-SHA256        lowercase hex of the raw body
X-Actor-Id           acting principal (e.g. admin email or "public")
X-Actor-Role         "admin" | "public"
X-Signature          hex(HMAC-SHA256(SERVICE_HMAC_SECRET, canonicalPayload))
```

Canonical payload (newline-joined, in order): `HTTP_METHOD`, `REQUEST_PATH`, `TIMESTAMP`, `NONCE`, `IDEMPOTENCY_KEY`, `BODY_SHA256`, `ACTOR_ID`, `ACTOR_ROLE`. The exact escaping and empty-value rules are in [`../contracts/hmac.md`](../contracts/hmac.md). Signing (BFF) and verification (API) use the **same** implementation from `packages/shared`, so they cannot drift; golden test vectors guard against regressions.

The Oracle API, in order (idea.md §4):

1. Verify `X-Service-Id` is known.
2. Reject clock skew over ±5 minutes.
3. Reject a reused nonce (insert into `service_request_nonces`; unique violation ⇒ reject).
4. Verify the signature with **constant-time** comparison (`hmac.Equal`).
5. Enforce idempotency for mutating requests.
6. Trust `X-Actor-Id` / `X-Actor-Role` **only because** they are inside the signature.
7. Never log the shared secret or the full signature.
8. Return a **generic** message on any authentication failure.

Only `GET /health` is exempt. `GET /ready` is unauthenticated but returns only `ok`/`unavailable` — no versions, hostnames, or infrastructure details.

## 3. Admin authentication (idea.md §5)

- Auth.js in the Next.js app with an OAuth provider (Google) and a **strict email allowlist** (`ADMIN_EMAIL_ALLOWLIST`).
- Secure HttpOnly session cookies, `SameSite=Lax`, CSRF protection, short session lifetime, role `admin`.
- The Oracle API does **not** validate the OAuth session. The BFF validates the admin session, then issues a signed request carrying `actorId`/`actorRole`; the API authorizes from the signed role.
- Admin BFF mutations additionally require an `X-Admin-Request` marker set by our fetch wrapper (defense in depth alongside SameSite), blocked cross-origin by CORS.
- **E2E test credentials (idea.md §23):** a Credentials provider is registered **only** when `E2E_TEST_MODE=1`, for Playwright. It is **hard-guarded**: `e2eCredentialsProvider()` calls `assertE2EAllowed()`, which **throws** if `VERCEL_ENV` or `APP_ENV` is `production` — so a stray `E2E_TEST_MODE=1` in production fails closed at startup rather than exposing a password login. The test admin email must also be in `ADMIN_EMAIL_ALLOWLIST`. Never set `E2E_TEST_MODE` in a real deployment.

## 4. Anti-abuse (idea.md §6)

Controls on the final questionnaire submit:

- **Turnstile** token verified server-side in the BFF before anything reaches the API.
- **Honeypot** field (must be empty) and **minimum fill time** (`durationMs`); tripping either flags the submission as `spam` server-side while returning a normal-looking success to avoid tipping off bots.
- **Max payload size** (100 KB at the BFF, 1 MB at Caddy), **max field lengths**, **no HTML** (`<`/`>` rejected) in plain-text fields.
- **Server-side Zod validation** mirroring the client schema.
- **Idempotency key** per submit attempt-series.
- **Rate limits** and **invite-token limits** (below).

### Rate limits (idea.md §6)

| Limit | Window | Key |
|---|---|---|
| 3 final submissions | 24 h | client fingerprint |
| 1 final submission | — | single-use invite token |
| 10 draft saves | 1 h | submission / fingerprint |
| 5 failed admin operations | 15 min | admin actor |

Exceeding a limit returns HTTP `429`.

### Client fingerprint (idea.md §6)

```text
clientFingerprint = HMAC-SHA256(IP_HASH_SECRET, normalizedClientIp)
```

The BFF derives the fingerprint and forwards only that. **The raw IP is never stored or forwarded.** Normalization: trim, strip port/zone id, lowercase IPv6, map IPv4-mapped IPv6 to IPv4.

## 5. What is never stored or logged (idea.md §6, §8, §22)

- Plain invitation tokens (only `sha256hex`).
- Raw IP addresses (only the HMAC fingerprint).
- Raw Turnstile tokens.
- Shared secrets or full signatures — not in logs, not in `audit_log`.
- Questionnaire payloads are **not** logged by default; request logs carry metadata only (method, route pattern, status, duration, request id).

## 6. Privacy & GDPR (idea.md §8, §15)

- **Privacy by design / data minimization.** Living people default to `privacy_level = private`. Public projections expose at most a masked label and a birth decade; email, phone, exact dates, addresses, precise locations, documents, notes, and internal source details are never exposed publicly.
- **Consent is explicit and versioned** (`consents` table): separate consents for data processing, contact, family visibility, public display, and media usage. `consent_version` records exactly which text the person agreed to.
- **Central redaction.** All public output passes through `PersonRedactionService` (Task 30); privacy logic is not duplicated across handlers.
- **Right to erasure / rectification.** An admin can reject, delete (`deleted_at`), or anonymize a person and withdraw consents (`withdrawn_at`); deleted/merged people are excluded from all active views and exports. Backups age out per the retention policy (§21).
- **Lawful basis.** Non-commercial family/historical project; personal data of living relatives is processed on the basis of the recorded consent, with minimization and access control as above.

## 7. Infrastructure hardening (idea.md §2, §3, §19)

- Only Caddy publishes `80`/`443`. PostgreSQL and the API have no host ports. Never open `5432`/`8080`/`3000`.
- Host firewall (UFW/nftables) mirrors the OCI security list: 80, 443 open; 22 restricted to the admin IP; default deny inbound.
- PostgreSQL runs as a dedicated non-superuser app role; the app never connects as `postgres`.
- Containers run as non-root where possible; the API image is a slim Node runtime (`node:22-bookworm-slim`) running as the non-root `node` user with a read-only filesystem (`tmpfs` for `/tmp`).
- Caddy adds HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, a minimal CSP for the API host, request timeouts, and a 1 MB body limit; it does not disclose internal service ports or version banners.

## 8. Secrets management

- All secrets live in Vercel project settings, the Oracle `.env` (not committed), or GitHub Actions secrets.
- No secret is prefixed `NEXT_PUBLIC_`; only the Turnstile **site** key is public.
- `gitleaks` scans every push/PR in CI (Task 11); `.env*` (except `*.example`) is gitignored.
