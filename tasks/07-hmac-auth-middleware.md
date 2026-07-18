# Task 07: HMAC service authentication (shared signer + API middleware)

**Depends on:** 05 · **Size:** L · **Spec:** idea.md §4 (entire section), §23 (HMAC tests) · **Stack:** [ADR 0004](../docs/adr/0004-typescript-node-backend.md)

## Goal
Implement HMAC service authentication as **shared code in `packages/shared`** (used to sign in the BFF, Task 09, and to verify here), the Hono middleware that enforces it on all `/v1/internal/*` endpoints, a written canonical-signing spec, and golden test vectors. Because signing and verification are the same module, there is no cross-language drift — the vectors are regression guards, not a parity contract.

## Requirements
1. `contracts/hmac.md` — precise spec the shared signer implements:
   - Headers (idea.md §4): `X-Service-Id`, `X-Request-Timestamp` (RFC3339 UTC), `X-Request-Nonce` (UUIDv4), `X-Idempotency-Key`, `X-Body-SHA256` (lowercase hex of raw body; empty body = hash of empty string), `X-Actor-Id`, `X-Actor-Role`, `X-Signature`.
   - Canonical payload: newline-joined, exactly: `HTTP_METHOD` (uppercase), `REQUEST_PATH` (escaped path; if a query string exists append `?` + raw query), `TIMESTAMP`, `NONCE`, `IDEMPOTENCY_KEY` (empty string when absent), `BODY_SHA256`, `ACTOR_ID`, `ACTOR_ROLE`.
   - Signature: `hex(HMAC-SHA256(SERVICE_HMAC_SECRET, canonicalPayload))`.
2. **Shared signer** in `packages/shared/src/hmac.ts` (Node `crypto`, pure functions): `buildCanonicalPayload(parts)`, `bodySha256(raw)`, `signCanonical(secret, payload)`, `sign(secret, requestParts)` → all headers, and `verify(secret, headers, method, path, rawBody)` → typed result. This is the single implementation the BFF (Task 09) imports for signing.
3. `contracts/hmac-test-vectors.json`: ≥6 vectors generated **by the shared signer** — GET no body, GET with query string, POST with JSON body, POST with Cyrillic (UTF-8) body, empty idempotency key, actor variations. Each vector: secret, all inputs, canonical payload string, body hash, expected signature. A `packages/shared` test regenerates and asserts them (golden regression).
4. **Hono middleware** in `services/api/src/auth/hmac.ts` applied to everything under `/v1/internal` (idea.md §4 checks, in order):
   1. Known `X-Service-Id` (config: `SERVICE_ID`, `SERVICE_HMAC_SECRET`).
   2. Timestamp parseable and within ±5 minutes.
   3. Nonce not seen: insert into `service_request_nonces` (expiry now+10min); unique-violation ⇒ reject.
   4. Signature valid via `verify()` using **constant-time comparison** (`crypto.timingSafeEqual`).
   5. Idempotency (mutating methods with a key): if the key exists with the same `request_hash` (hash of canonical payload) ⇒ replay the stored response (status + body) without re-executing; same key + different hash ⇒ 409. Provide a wrapper that captures and stores successful responses in `idempotency_keys`.
   6. Actor: place `actorId`/`actorRole` on the Hono context (`c.set`), trusted only because signed. Helper `requireRole('admin')` middleware for admin-only endpoints.
5. Failures return generic 401 `{"error":{"code":"unauthorized","message":"authentication failed",...}}`. Log details at debug level **without** the secret or full signature (idea.md §4.7–4.8).
6. Background janitor (a `setInterval`, unref'd, hourly): delete expired nonces and idempotency keys (idea.md §4). Stopped on graceful shutdown.
7. Exemptions: `GET /health` (public, reveals nothing). Decision (document in `contracts/hmac.md`): `GET /ready` stays unauthenticated but returns only `ok`/`unavailable`.
8. Config additions → `services/api/.env.example`.

## Acceptance criteria
- All §23 auth cases behave correctly: valid request passes; bad signature, expired timestamp, future timestamp, reused nonce all → 401; idempotent replay returns the stored response; same key different body → 409; tampering with `X-Actor-Role` after signing → 401.

## Verification
- Unit tests (Vitest) for canonical payload construction (all vector cases) in `packages/shared` + the full middleware matrix in `services/api`; integration tests for nonce uniqueness and idempotency storage.
- A test asserting every vector in `contracts/hmac-test-vectors.json` verifies against the middleware.
- Standard API verification + `npm run test:integration -w @familytree/api`; `npm test -w @familytree/shared`.
- Commit as `task-07: hmac auth (shared signer + api middleware)`.
