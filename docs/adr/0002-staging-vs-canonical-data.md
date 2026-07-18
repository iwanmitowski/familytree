# ADR 0002: Immutable submissions, staging, and a canonical graph

- **Status:** Accepted
- **Date:** 2026-07-18
- **Context ref:** idea.md §7, §8, §10, §26

## Context

Data arrives from untrusted, non-expert relatives via a questionnaire. The same real person is described many times, inconsistently, across submissions. We must never let raw input silently become "truth," must be able to trace every canonical fact back to its source, and must let an administrator resolve duplicates and conflicts deliberately.

Naive approaches — writing questionnaire answers straight into a `people` table, or upserting people by name — would corrupt the graph, create duplicates, and lose provenance.

## Decision

Use **three explicit layers** (idea.md §7):

```text
Original submission (immutable)  →  Candidate / staging records  →  Canonical confirmed graph
```

1. **Immutable submissions.** The full questionnaire payload is stored once as `submissions.original_payload` (JSONB) and never mutated after it leaves `draft`. Described people/relationships are exploded into `submission_people` / `submission_relationships` for review.
2. **Staging / candidates.** `match_candidates` holds scored, explainable links between a submitted person and existing canonical people; `submission_people.resolution_status` tracks the admin's decision. Matching **never** auto-links.
3. **Canonical graph.** `people` + names/events/edges/unions/sources/evidence. Rows here are created or linked **only** by an explicit admin action.

Only an admin may create a canonical person, link a candidate to an existing person, confirm a relationship, reject a candidate, merge duplicates, mark a conflict, or change privacy (idea.md §7). Conflicting information is captured as `evidence` with a `disputes` stance and never auto-overwrites existing facts (idea.md §8).

## Consequences

**Positive**
- Full provenance and auditability: every canonical fact traces back to a source and a submission; the original input is preserved verbatim.
- Bad or malicious input is quarantined in Layer 1 and cannot corrupt the tree.
- Duplicate prevention and conflict handling become deliberate, reviewable admin operations, aligned with explainable match scores (idea.md §10).

**Negative / risks**
- More tables and an explicit review workflow — higher up-front complexity than a single `people` table. Accepted because the alternative loses provenance and integrity.
- Requires admin effort per submission; mitigated by ranked match candidates and suggested relationships in the review workspace.
- Data is duplicated between the immutable payload and the exploded staging rows; this is intentional (the payload is the legal record of what was submitted).

## Alternatives rejected

- **Direct write to canonical tables** — no provenance, immediate duplication/corruption, violates idea.md §7.
- **Automatic merge by match score** — explicitly forbidden (idea.md §7, §10); scores inform, humans decide.
