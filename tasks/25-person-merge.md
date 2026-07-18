# Task 25: Transactional person merge + merge history

**Depends on:** 22, 23, 24 · **Size:** L · **Spec:** idea.md §8 (person_merge_history, „Merge операцията трябва да е transactional"), §16 (`POST /v1/internal/people/{id}/merge`)

## Goal
A safe, fully transactional merge of a duplicate person into a target person, with a complete history snapshot and correct re-pointing of every referencing table.

## Requirements
1. `POST /v1/internal/people/{id}/merge` `{targetPersonId, reason}` (admin role; `reason` required):
   - Preconditions: ids distinct; neither person merged or deleted; advisory lock on both ids (sorted) to serialize;
   - Snapshot both full aggregates (names, events, relationships, unions, evidence refs) into `person_merge_history.snapshot` (JSONB) **before** any mutation;
   - Re-point, deduplicating against target where uniques exist:
     - `person_names`: move rows; identical `(normalized_name, name_type)` → drop moved duplicate; the source's preferred `primary` becomes a non-preferred `alias` when the target already has a preferred primary;
     - `person_events`: move; drop exact duplicates (same type, years, precision, place);
     - `parent_child_relationships`: rewrite `parent_id`/`child_id`; if the rewritten edge duplicates an existing one → drop moved; if a rewrite would produce `parent_id = child_id` → **abort the whole merge** with 422 `merge_would_create_self_edge`;
     - `union_partners`: re-point; duplicate partner in same union → drop moved; a union ending up with the target twice → abort 422;
     - `evidence` subjects, `match_candidates.canonical_person_id` (unique conflict → keep higher score), `submission_people.matched_person_id`: re-point;
   - Post-check inside the same transaction: run the cycle checker (Task 22) over the target's edges; cycle → rollback 422 `merge_creates_cycle`;
   - Mark source: `merged_into_person_id = target`, `deleted_at = now()`;
   - Write `person_merge_history` row + audit entry; return the merged target aggregate.
2. Merged-person resolution: shared helper `resolvePersonId(db, id)` following at most one `merged_into_person_id` hop (merging into an already-merged target is forbidden, so one hop suffices — enforce that with a precondition); people GET already surfaces the redirect envelope (Task 21).
3. Reject double merge (source already merged) and merging a person into itself via chain (`target.merged_into == source`).
4. Update `contracts/openapi.yaml`.

## Acceptance criteria
- Fixture: person B (duplicate of A) with own name variant, birth event, a child edge and a union partner — merge B→A results in: A owning the alias name, deduped events, re-pointed edges without duplicates, B flagged merged+deleted and excluded from search/tree; history snapshot contains B's full pre-merge state; conflicting merges roll back atomically (DB unchanged).

## Verification
- Integration tests: full merge fixture assertion; dedupe cases; self-edge abort; cycle abort; double-merge rejection; atomicity (inject failure late in tx → nothing persisted).
- Standard API verification + `npm run test:integration -w @familytree/api`.
- Commit as `task-25: transactional person merge`.
