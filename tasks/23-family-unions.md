# Task 23: Family unions & partners

**Depends on:** 21 · **Size:** M · **Spec:** idea.md §8 (family_unions, union_partners)

## Goal
Model partnerships/marriages as unions with partner rows — the structure the tree projection (Task 29) turns into union nodes.

## Requirements
1. Endpoints (admin role, audit, OpenAPI updated):
   - `POST /v1/internal/unions` `{unionType, partnerIds: [1..2]}` — creates union + partner rows; partners must exist, not merged/deleted;
   - `GET /v1/internal/unions/{id}` — union + partners + children (parent_child rows with this `family_union_id`);
   - `PATCH /v1/internal/unions/{id}` — `unionType`;
   - `POST /v1/internal/unions/{id}/partners` `{personId}` / `DELETE /v1/internal/unions/{id}/partners/{personId}` — max 2 partners (decision: unions are pairwise; a person with multiple partners over time gets multiple unions — idea.md §8 explicitly supports this); duplicate partner rejected;
   - `DELETE /v1/internal/unions/{id}` — only when no parent_child edge references it (else 409 `union_in_use`).
2. A person may belong to many unions — verify no accidental unique constraint prevents this; there is no `spouse_id` anywhere (idea.md §8).
3. Extend the person aggregate (Task 21 GET) with the person's unions (partners resolved with preferred names).
4. sqlc queries as needed; keep union children discoverable for Task 29 (`list parent_child by family_union_id`).

## Acceptance criteria
- Person with two sequential marriages: two unions, both listed on the aggregate; duplicate partner insert fails; deleting a union referenced by a child edge fails with 409.

## Verification
- Integration tests for the cases above.
- Standard Go verification + `go test -tags=integration ./...`.
- Commit as `task-23: family unions`.
