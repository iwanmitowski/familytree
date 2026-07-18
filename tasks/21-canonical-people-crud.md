# Task 21: Canonical people, names, places, events; create/link from submission

**Depends on:** 19 · **Size:** L · **Spec:** idea.md §7 (admin-only promotion), §8 (people, person_names, places, person_events, date precision), §16 (people + matching endpoints)

## Goal
The canonical `people` service: CRUD endpoints, and the two promotion actions that turn a staging `submission_person` into (or link it to) a canonical person — with correct imprecise-date handling and questionnaire sourcing.

## Requirements
1. `internal/people` endpoints (admin role, audit entries on every mutation):
   - `POST /v1/internal/people` `{name fields, livingStatus, privacyLevel?}` — manual creation; creates person + preferred `primary` name (normalized/transliterated via Task 19);
   - `GET /v1/internal/people` — search `q` against `person_names.normalized_name`/tokens (variant-aware via Task 19 expansion), filters (living status, privacy, includeMerged=false default), pagination;
   - `GET /v1/internal/people/{id}` — aggregate: names, events (with places), parent/child edge summaries, unions (filled further by Tasks 22–24); requesting a merged person returns `{mergedIntoPersonId}` with 409 or a redirect envelope — document choice in OpenAPI;
   - `PATCH /v1/internal/people/{id}` — `privacyLevel`, `livingStatus`, `notes` only.
2. Places helper (`internal/people` or `internal/genealogy`): `UpsertPlaceByText(ctx, tx, rawText)` → normalize (Task 19 `Normalize`), find-or-create `places` row (`place_type='settlement'` default; hierarchy is admin-curated later). Never duplicate by normalized name.
3. `POST /v1/internal/submission-people/{id}/create-person` — single transaction (idea.md §7: admin-only promotion):
   1. Guard: submission in `in_review`, submission person `resolution_status='pending'|'deferred'`;
   2. Create person (`living_status` from staging; `privacy_level='private'` — idea.md §15 default);
   3. Names: preferred `primary` from staging name fields; extra `birth` row when birth_surname differs; `nickname` row when present;
   4. Events with honest precision (idea.md §8): birth from `birth_year_from/to` (`year` when equal, `range`/`approximate` otherwise; **never a fabricated exact date**); death likewise when deceased; `residence` events from place texts via the places helper;
   5. Sourcing: ensure a `sources` row (`questionnaire`, submission_id) exists for the submission (idempotent), add `evidence` rows (`supports`) for the name and birth assertions;
   6. Set staging `matched_person_id` + `resolution_status='created'`; if a pending match candidate list exists, leave statuses untouched;
   7. Return the new person aggregate.
4. `POST /v1/internal/submission-people/{id}/link-person` `{personId}` — transaction: target exists, not merged/deleted; set `matched_person_id`, `resolution_status='linked'`; evidence row linking the questionnaire source to the person (`supports`, assertion `identity`); if the staging name differs from all existing names, add an `alias` (non-preferred) name row; set the corresponding `match_candidates` row (if any) `accepted`.
5. Update `contracts/openapi.yaml`.

## Acceptance criteria
- create-person yields person + names + honest-precision events + questionnaire source/evidence and marks staging `created`; link-person marks `linked`, never mutates the target's core data, and cannot target merged/deleted people; place text reuse dedupes; canonical writes happen only through these admin endpoints.

## Verification
- Integration tests for both promotions (full assertion of created rows incl. `date_precision` values), place dedupe, merged-target rejection, guard violations (submission not in review → 409/422).
- Standard Go verification + `go test -tags=integration ./...`.
- Commit as `task-21: canonical people crud and promotion`.
