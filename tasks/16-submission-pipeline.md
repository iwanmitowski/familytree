# Task 16: Submission pipeline end-to-end

**Depends on:** 09, 12, 15 · **Size:** L · **Spec:** idea.md §6 (entire), §7, §8 (submissions), §16 (submission endpoints), §17 (route handler duties)

## Goal
The complete server-side path: BFF routes validate + verify Turnstile + fingerprint + sign; the Go API stores immutable submissions with staging people/relationships/consents, enforces rate limits and invite consumption, and lists submissions for review.

## Requirements — BFF (`apps/web`)
1. `POST /api/questionnaire/submit` route handler (idea.md §17 duties, in order):
   1. Enforce max body size 100KB (reject 413) before parsing;
   2. Zod-validate the full payload (server-side mirror of Task 13 schemas — reuse them);
   3. Verify Turnstile server-side (`TURNSTILE_SECRET_KEY`, `siteverify`) — failure → 400 `turnstile_failed`;
   4. Anti-abuse heuristics: honeypot non-empty OR `durationMs < 60s` ⇒ still forward to the API but flagged `spamSignal: "honeypot"|"too_fast"` (the API stores it as `status='spam'` with `spam_reason`) — silent to the client (returns success) to avoid tipping off bots; document this decision;
   5. Compute `clientFingerprint` (Task 09); never forward raw IP;
   6. Use the client-provided idempotency key (validate UUID) for the signed request;
   7. `oracleFetch('POST /v1/internal/submissions', ...)` with actor `{id:'public', role:'public'}`;
   8. Map errors per conventions §5; pass through 429 with `Retry-After` if present.
2. `POST /api/questionnaire/draft`: same guards minus Turnstile; forwards to the draft endpoint below; per-fingerprint draft limit handled by the API.
3. `GET /api/questionnaire/invite-check?token=` → proxies invite validation (Task 12) so the form can show an early Bulgarian error for dead invite links.

## Requirements — Go API
4. `POST /v1/internal/submissions` — single transaction:
   1. Rate limit: without a valid invite, max **3 processed-or-pending final submissions per fingerprint per 24h** (count query) → 429 `rate_limited`; with invite, `ConsumeInvite` (Task 12) governs instead (idea.md §6 limits);
   2. Insert `submissions` row: `status='pending'` (or `'spam'` + `spam_reason` when `spamSignal` present), immutable `original_payload`, fingerprint, `submitted_at`, optional `invite_id`;
   3. Parse payload → insert `submission_people` (all local keys; fill `normalized_name` with a simple lower/trim placeholder — upgraded in Task 19) and `submission_relationships`;
   4. Insert `consents` rows (type, version, accepted, accepted_at);
   5. Audit entry `submission.created`;
   6. Return `{submissionId}`. Idempotent replay handled by Task 07 middleware.
5. `POST /v1/internal/submissions/draft`: upsert draft-status submission by `draftId` (create returns id); enforce **10 draft saves per hour per fingerprint** → 429. Drafts only ever update `original_payload`+`updated_at` of `status='draft'` rows; a submit with `draftId` promotes the draft row to `pending` (payload replaced by the final one, then immutable).
6. `GET /v1/internal/submissions` (filters: status, invite campaign; pagination; ordered `submitted_at DESC`) and `GET /v1/internal/submissions/{id}` (full detail incl. people, relationships, consents, spam reason, fingerprint **prefix only** in responses). Admin role required for reads.
7. Update `contracts/openapi.yaml`.

## Acceptance criteria
- Happy path: valid submit → pending submission with people/relationships/consents rows; canonical tables untouched (idea.md §7 / DoD §25.4).
- 4th final submission from one fingerprint in 24h → 429; 11th draft save in an hour → 429; exhausted invite → clear error; idempotent retry returns the same submissionId without a duplicate row; honeypot submission lands as `spam` while the client sees success.

## Verification
- Go integration tests for every acceptance case; BFF unit tests (mocking `oracleFetch` and Turnstile): size limit, turnstile fail, honeypot flagging, fingerprint present, no raw IP anywhere in the outbound request.
- Standard Go + web verification; manual E2E smoke: run API + web locally (`TURNSTILE` test keys), submit a real questionnaire, see the row in the dev DB.
- Commit as `task-16: submission pipeline`.
