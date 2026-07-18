# Task 22: Parent-child relationships + cycle prevention

**Depends on:** 21 · **Size:** M · **Spec:** idea.md §8 (parent_child_relationships), §12 (cycle prevention — entire section), §16 (relationships endpoints)

## Goal
Endpoints to propose, confirm, dispute, and delete parent-child edges, with transactional ancestry-cycle prevention.

## Requirements
1. `internal/genealogy` cycle checker: `WouldCreateCycle(ctx, tx, parentID, childID) (bool, error)` — recursive CTE ancestors-of(parentID) over edges with `verification_status IN ('proposed','confirmed')` (decision, per safety: pending edges also block cycles; `disputed`/`rejected` excluded — document in code + data-model doc); returns true if childID appears (or parentID == childID).
2. `POST /v1/internal/relationships/parent-child` `{parentId, childId, relationshipType, familyUnionId?, verificationStatus?='proposed', confidence?}` — **one transaction** (idea.md §12): take a deterministic advisory lock (e.g. `pg_advisory_xact_lock` on hash of sorted pair) to serialize competing inserts; guards: distinct ids, both people exist and are not merged/deleted, no duplicate `(parent, child, type)`; run cycle check; violation → 422 `cycle_detected`; insert; audit entry.
3. `PATCH /v1/internal/relationships/{id}`: change `verificationStatus` (`proposed→confirmed|disputed|rejected`, `confirmed→disputed`; anything else 409), `relationshipType`, `confidence`, `familyUnionId`; **confirming re-runs the cycle check** inside the transaction; audit entry.
4. `DELETE /v1/internal/relationships/{id}`: hard delete with a full row snapshot into the audit entry metadata.
5. `GET /v1/internal/relationships/between?personA=&personB=`: direct edges between the two people (both directions).
6. Update `contracts/openapi.yaml`; extend the person aggregate (Task 21 GET) with parents/children lists.

## Acceptance criteria — the idea.md §12 test list, verbatim
Integration tests must cover: **self-parent** rejected; **direct cycle** (A→B exists; B→A rejected); **multi-generation cycle** (A→B→C exists; C-as-parent-of-A rejected); **duplicate parent edge** rejected; **valid adoption edge** allowed alongside a biological edge for the same pair; **disputed edge** does not block an otherwise valid insert.

## Verification
- The §12 matrix above + a concurrency test (two transactions inserting A→B and B→A simultaneously; exactly one wins).
- Standard Go verification + `go test -tags=integration ./...`.
- Commit as `task-22: parent-child relationships with cycle prevention`.
