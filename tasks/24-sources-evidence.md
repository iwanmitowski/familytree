# Task 24: Sources & evidence

**Depends on:** 21 · **Size:** M · **Spec:** idea.md §8 (sources, evidence — „конфликтна информация не презаписва")

## Goal
CRUD for sources and evidence links so every genealogical assertion can carry multiple supporting or disputing sources — without ever auto-mutating the asserted data.

## Requirements
1. Endpoints (admin role, audit, OpenAPI updated):
   - `POST /v1/internal/sources` `{sourceType, title, description?, submissionId?}` / `GET /v1/internal/sources?type=&q=` / `GET /v1/internal/sources/{id}` (with its evidence list) / `PATCH /v1/internal/sources/{id}`;
   - `POST /v1/internal/evidence` `{sourceId, subjectType, subjectId, assertion, stance, confidence?, notes?}` — validates the subject row exists for the given type; `GET /v1/internal/evidence?subjectType=&subjectId=`; `DELETE /v1/internal/evidence/{id}`;
   - Deleting a source with evidence → 409 (`ON DELETE RESTRICT` surfaced cleanly).
2. **Invariant enforced by design and asserted in tests:** evidence writes never touch subject tables. A `disputes` evidence row changes nothing on the person/event/relationship — resolution is a separate explicit admin edit (idea.md §8).
3. Wire-up: confirm the questionnaire-source helper from Task 21 is idempotent and reused here (one `questionnaire` source per submission).
4. Extend the person aggregate with per-person source counts (distinct sources across the person's evidence subjects) — the tree node needs this number later (idea.md §14).

## Acceptance criteria
- One assertion can hold N sources with mixed stances; disputing evidence leaves subject data untouched; source deletion is blocked while referenced; person aggregate reports a correct source count.

## Verification
- Integration tests for the cases above (incl. a snapshot proving the disputed event is byte-identical after evidence insert).
- Standard Go verification + `go test -tags=integration ./...`.
- Commit as `task-24: sources and evidence`.
