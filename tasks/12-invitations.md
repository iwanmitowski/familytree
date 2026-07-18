# Task 12: Invitation tokens

**Depends on:** 07 · **Size:** M · **Spec:** idea.md §5 (invitation token), §6 (invite limits), §8 (invites)

## Goal
Go endpoints for creating, listing, validating, and revoking invitation tokens. Plain tokens exist only in the creation response; the database stores hashes only.

## Requirements
1. `internal/submissions` (or a dedicated `internal/invites` package) with admin-only endpoints (HMAC + `RequireRole("admin")`):
   - `POST /v1/internal/invites` `{recipientLabel, campaign?, expiresAt?, maxSubmissions?}` → generates a token (32 bytes `crypto/rand`, base64url, prefix `inv_` for recognizability), stores only `sha256hex(token)` in `token_hash`, returns `{id, token, ...}` — the **only** time the plain token appears (idea.md §8).
   - `GET /v1/internal/invites` → list with usage stats (`usedSubmissions/maxSubmissions`, expired/revoked flags). Never returns hashes or plain tokens.
   - `POST /v1/internal/invites/{id}/revoke` → sets `revoked_at`; idempotent.
   - `GET /v1/internal/invites/validate?token=...` (service-level, used by the BFF before rendering the form) → `{valid, reason?}` where reason ∈ `expired|revoked|exhausted|not_found`; respond in constant-ish time and do not distinguish `not_found` from invalid format in the message.
2. Domain helper used by Task 16: `ConsumeInvite(ctx, tx, plainToken)` — inside the caller's transaction: look up by hash **with row lock**, validate (not revoked, not expired, `used_submissions < max_submissions`), increment `used_submissions`. Returns typed errors for each failure.
3. Audit log entries: `invite.created`, `invite.revoked` (actor from HMAC context).
4. Update `contracts/openapi.yaml`.

## Acceptance criteria
- DB never contains a plain token (tests assert only 64-hex hashes stored).
- Exhausted/expired/revoked invites fail validation and consumption with the right reasons; concurrent consumption cannot exceed `max_submissions` (row-lock test).

## Verification
- Unit tests (token generation/hashing) + integration tests (CRUD, consumption race using two concurrent transactions, constraint `used <= max` holds).
- Standard Go verification + `go test -tags=integration ./...`.
- Commit as `task-12: invitation tokens`.
