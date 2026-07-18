# Task 20: Match candidates engine

**Depends on:** 19 · **Size:** L · **Spec:** idea.md §10 (matching score, reasons, admin choices), §8 (match_candidates), §16 (matching endpoints)

## Goal
Explainable candidate matching: given a submission person, retrieve plausible canonical people, score them with documented weights and Bulgarian reason descriptions, and persist `match_candidates`. **No automatic linking, ever.**

## Requirements
1. Package `internal/matching`:
   - `Score(sp SubmissionPersonCtx, cp CanonicalPersonCtx) MatchResult` where contexts carry: normalized names, birth surname, nickname, birth year range, normalized birthplace, parents' normalized names, partners' names, children's names, source count.
   - Scoring fields & default weights (constants, documented): full normalized-name match 35 / token overlap partial; birth surname 10; birth year exact 15, ±1 → 10, ±3 → 5; birthplace 10; parent names overlap up to 15; partner 5; children 5; nickname 5. Cap 100. Emit `reasons: [{field, score, description}]` with **Bulgarian** descriptions exactly in the spirit of the idea.md §10 example („Пълно съвпадение на името", „Разлика от една година").
   - Candidate retrieval (sqlc): prefilter canonical people by surname-variant match OR ≥1 shared name token OR birth year within ±2; exclude merged/deleted; limit 50, then score in Go; keep score ≥ 30, top 10.
2. Endpoint `POST /v1/internal/submission-people/{id}/find-matches` (admin role):
   - Runs retrieval + scoring; **upserts** `match_candidates` (unique pair): new pairs `status='pending'`; existing pairs refresh `score`/`reasons` but never touch reviewed status fields;
   - Returns candidates ranked by score with reasons;
   - Writes audit entry `matching.run`;
   - Asserted invariant: this endpoint never writes `matched_person_id` or creates people (idea.md §10 — admin must always choose).
3. Update `contracts/openapi.yaml`.

## Acceptance criteria
- For a fixture graph: an exact homonym with matching year scores high with correct reasons; same name different generation scores mid; unrelated person scores below threshold and is not stored; re-running refreshes scores without duplicating rows or resetting a reviewed candidate.

## Verification
- Unit tests for scoring cases + Bulgarian reason snapshots; integration tests for prefilter recall (variant surnames found) and upsert semantics.
- Standard Go verification + `go test -tags=integration ./...`.
- Commit as `task-20: match candidates engine`.
