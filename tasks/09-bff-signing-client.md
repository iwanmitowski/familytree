# Task 09: BFF → Oracle signing client

**Depends on:** 07, 08 · **Size:** M · **Spec:** idea.md §4, §6 (fingerprint), §17 (route handler duties)

## Goal
The server-only TypeScript library the BFF uses to talk to the Oracle API: env validation, HMAC signing (bit-compatible with Go), client fingerprinting, idempotency keys, error normalization, correlation IDs.

## Requirements
1. `src/server/env.ts`: Zod-validated server env (vars from Task 08 list). Import `server-only`. Fail fast with clear messages. Client code can never import it.
2. `src/server/oracle/sign.ts`: implement the canonical payload + `HMAC-SHA256` signature exactly per `contracts/hmac.md` (Node `crypto`). Export pure functions (`buildCanonicalPayload`, `signRequest`) for testability.
3. `src/server/oracle/client.ts`: `oracleFetch(path, {method, body, actor, idempotencyKey})`:
   - serializes body once, computes `X-Body-SHA256` over those exact bytes;
   - sets all §4 headers (timestamp RFC3339 UTC, UUIDv4 nonce);
   - forwards/creates `X-Request-Id` (correlation ID — not part of the signature);
   - timeout (10s) via `AbortController`; retry only idempotent GETs (max 2, jittered);
   - never logs secrets or signatures.
4. Error normalization: parse the API error shape; return a typed `OracleError { status, code, message, requestId }` with safe Bulgarian-ready messages; anything unparseable → generic `upstream_error`. Internal backend details must never pass through to browsers (idea.md §17.9).
5. `src/server/fingerprint.ts`: `clientFingerprint(ip)` = `hex(HMAC-SHA256(IP_HASH_SECRET, normalizedIp))`; normalization: trim, strip port/zone, lowercase IPv6, IPv4-mapped IPv6 → IPv4. Helper to extract client IP from request headers (`x-forwarded-for` first hop on Vercel). **Raw IP is never stored or forwarded** (idea.md §6).
6. `src/server/idempotency.ts`: UUIDv4 idempotency key generator.
7. Vitest: **parity test loading `contracts/hmac-test-vectors.json` and asserting identical signatures** (the cross-language guarantee); fingerprint normalization cases; error normalization cases.

## Acceptance criteria
- Every vector from `contracts/hmac-test-vectors.json` produces an identical signature in TypeScript.
- No secret value can reach client bundles (spot-check the build output for the secret names).

## Verification
- Standard web verification; the vectors test is the critical gate.
- Commit as `task-09: bff signing client`.
