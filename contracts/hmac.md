# HMAC service authentication contract

Normative spec for BFF → Oracle API request signing (idea.md §4). The single
implementation lives in `packages/shared/src/hmac.ts` and is used by **both**
sides — the BFF signs, the API verifies — so the two cannot drift. Golden
vectors: [`hmac-test-vectors.json`](hmac-test-vectors.json) (regenerate with
`npx tsx packages/shared/scripts/generate-hmac-vectors.ts`; a changed output
means the wire contract changed).

## Headers

| Header | Value |
|---|---|
| `X-Service-Id` | Service identity (config `SERVICE_ID`) |
| `X-Request-Timestamp` | RFC3339 UTC (`new Date().toISOString()`), rejected beyond ±5 min skew |
| `X-Request-Nonce` | UUIDv4, **single-use** (replay protection, 10 min TTL in the nonce store) |
| `X-Idempotency-Key` | UUIDv4; present only on mutating requests that want idempotency |
| `X-Body-SHA256` | Lowercase hex SHA-256 of the **raw body bytes**; empty body ⇒ `e3b0c442...b855` (hash of the empty string) |
| `X-Actor-Id` | Acting principal (admin email or `public`) |
| `X-Actor-Role` | `admin` \| `public` — trusted **only** because it is signed |
| `X-Signature` | `hex(HMAC-SHA256(SERVICE_HMAC_SECRET, canonicalPayload))` |

## Canonical payload

Newline-joined (`\n`), exactly these eight lines, in order:

```text
HTTP_METHOD            uppercase (GET, POST, ...)
REQUEST_PATH           percent-encoded path; if a query string exists: path + "?" + raw query
TIMESTAMP              the X-Request-Timestamp value, verbatim
NONCE                  the X-Request-Nonce value, verbatim
IDEMPOTENCY_KEY        the X-Idempotency-Key value, or "" when absent
BODY_SHA256            the X-Body-SHA256 value
ACTOR_ID               the X-Actor-Id value
ACTOR_ROLE             the X-Actor-Role value
```

`REQUEST_PATH` is the path as sent on the wire (percent-encoded form, e.g.
`/v1/internal/people?q=%D0%9C%D0%B8%D1%82%D0%BE%D0%B2&limit=10`). Both sides
derive it as `url.pathname + url.search`.

## Verification order (API middleware)

1. All required headers present; `X-Service-Id` matches the configured id.
2. Timestamp parses and is within ±5 minutes of server time.
3. Body hash matches the actual raw body.
4. Signature matches via **constant-time** comparison (`crypto.timingSafeEqual`).
5. Nonce inserted into `service_request_nonces` (TTL 10 min); an already-seen
   nonce ⇒ reject. (Runs after the pure crypto checks so unauthenticated
   garbage cannot write to the database.)
6. Idempotency (mutating methods carrying a key) — see below.

Every failure returns the same generic response — `401
{"error":{"code":"unauthorized","message":"authentication failed"}}` — and the
specific reason is logged at debug level only, never the secret or the full
signature (idea.md §4.7–4.8).

## Idempotency

**Request hash** (identifies "the same request retried"):

```text
sha256hex( METHOD \n REQUEST_PATH \n BODY_SHA256 \n ACTOR_ID \n ACTOR_ROLE )
```

Deliberately **excludes timestamp and nonce**: nonces are single-use, so every
retry rotates them; hashing the full canonical payload would make retries look
like new requests and break replay. (This refines the informal "hash of the
canonical payload" wording in the task spec.)

Semantics for a mutating request carrying `X-Idempotency-Key`:

- **New key** → claimed (stored with the request hash, TTL 24 h); the handler
  executes; a successful response (status < 500) is stored afterwards.
- **Known key + same request hash + stored response** → the stored response is
  replayed verbatim with header `Idempotent-Replay: true`; the handler does
  not run.
- **Known key + different request hash** → `409 {"error":{"code":"idempotency_conflict",...}}`.
- **Known key, no stored response** (previous attempt died mid-flight) → the
  handler re-executes and the new response is stored. Concurrent duplicates of
  the same key may therefore both execute — callers retry sequentially.

## Exemptions

- `GET /health` — public; returns `{"status":"ok"}` only.
- `GET /ready` — unauthenticated by decision; returns only `ok`/`unavailable`,
  no versions, hostnames, or infrastructure details.

Everything under `/v1/internal/*` requires a valid signature. Authorization is
derived from the signed `X-Actor-Role` (`requireRole('admin')` on admin-only
endpoints).

## Housekeeping

Expired nonces and idempotency keys are pruned hourly by an in-process janitor
(unref'd interval, stopped on graceful shutdown).
