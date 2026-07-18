# Task 05: Migrations — staging layer

**Depends on:** 04 · **Size:** M · **Spec:** idea.md §4 (nonces/idempotency), §7, §8 (invites, submissions, submission_people, submission_relationships, consents, audit_log)

## Goal
Goose migrations + basic sqlc queries for the staging/side tables: invites, submissions, submission people/relationships, consents, audit log, nonce store, idempotency keys.

## Requirements
1. New goose migration(s) in `services/api/db/migrations` (sequential, `-- +goose Up` / `-- +goose Down`, reversible). All PKs `UUID DEFAULT gen_random_uuid()`, all timestamps `TIMESTAMPTZ`, `created_at DEFAULT now()`. `updated_at` is app-managed (no triggers) — note this in `docs/data-model.md`.
2. Tables (fields per idea.md §8; add sensible NOT NULLs):
   - `invites`: `token_hash TEXT NOT NULL UNIQUE` (SHA-256 hex; **plain token never stored**), `recipient_label`, `campaign`, `expires_at`, `max_submissions INT NOT NULL DEFAULT 1`, `used_submissions INT NOT NULL DEFAULT 0`, `revoked_at`, `created_at`; `CHECK (used_submissions <= max_submissions)`, `CHECK (max_submissions > 0)`.
   - `submissions`: fields per §8; `status TEXT NOT NULL DEFAULT 'pending'` with `CHECK (status IN ('draft','pending','in_review','processed','rejected','spam'))`; `original_payload JSONB NOT NULL`; `client_fingerprint TEXT`; nullable FK `invite_id → invites`.
   - `submission_people`: fields per §8; `local_key TEXT NOT NULL`, `UNIQUE (submission_id, local_key)`; `living_status CHECK IN ('living','deceased','unknown')`; `resolution_status TEXT NOT NULL DEFAULT 'pending' CHECK IN ('pending','created','linked','deferred','ignored')`; `matched_person_id UUID` (no FK yet — people table arrives in Task 06; add the FK there); year fields `INT` with `CHECK (birth_year_from <= birth_year_to)` etc. when both present.
   - `submission_relationships`: per §8; `relationship_type CHECK IN ('parent','partner','sibling','child','other')` + `notes`; `UNIQUE (submission_id, from_local_key, to_local_key, relationship_type)`.
   - `consents`: per §8; `consent_type CHECK IN ('data_processing','contact','family_visibility','public_display','media_usage')`; `consent_version TEXT NOT NULL`; `accepted BOOLEAN NOT NULL`; `accepted_at`, `withdrawn_at`.
   - `audit_log`: per §8 (`actor_type CHECK IN ('admin','service','system','public')`, `actor_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata JSONB` — safe metadata only), append-only.
   - `service_request_nonces`: exactly per idea.md §4 DDL + index on `expires_at`.
   - `idempotency_keys`: `key TEXT PRIMARY KEY`, `service_id TEXT NOT NULL`, `request_hash TEXT NOT NULL`, `response_status INT`, `response_body JSONB`, `created_at`, `expires_at NOT NULL` + index on `expires_at`. (Required by idea.md §4 step 5.)
3. Indexes: `submissions (status, submitted_at DESC)`, `submissions (client_fingerprint, submitted_at)`, `submission_people (submission_id)`, `submission_people (normalized_name)`, `audit_log (entity_type, entity_id)`, FK columns.
4. sqlc queries (minimal set for later tasks): insert/get/list-by-status for submissions; insert submission_person / submission_relationship; insert consent; insert audit entry; invite insert/get-by-token-hash/list/increment-used (guarded)/revoke; nonce insert + delete-expired; idempotency get/insert + delete-expired. Run `sqlc generate`, commit output.
5. Update `docs/data-model.md` if anything differs from Task 02's draft.

## Acceptance criteria
- `api migrate up` then `down` to zero then `up` again succeeds on a clean dev DB.
- Constraints hold: duplicate `(submission_id, local_key)` rejected; `used_submissions > max_submissions` rejected.

## Verification
- Integration tests (build tag `integration`) covering the up/down/up cycle and the constraint cases above.
- Standard Go verification + `go test -tags=integration ./...`.
- Commit as `task-05: staging layer migrations`.
