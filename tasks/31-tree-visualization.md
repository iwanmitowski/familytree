# Task 31: Tree visualization (React Flow + ELK)

**Depends on:** 29, 30 · **Size:** L · **Spec:** idea.md §14 (entire section), §2 (React Flow + ELK.js)

## Goal
The interactive family tree page rendering the projection with React Flow, laid out by ELK, with person/union node components, base controls, and public/admin variants.

## Requirements
1. Dependencies: `@xyflow/react`, `elkjs`. Layout runs in a Web Worker (elkjs worker build) so big graphs don't block the UI; fall back to main-thread if workers unavailable.
2. Data flow: `/tree` (public) and `/admin/tree` (admin view) pages → TanStack Query fetch of `GET /api/tree/[personId]?...` (public) / admin BFF route (admin) → `projectionToFlow()` transform in `src/features/tree/`:
   - Person nodes/union nodes/edges from the projection; ELK `layered` algorithm, top-to-bottom, one layer per `generation` (use ELK layer constraints from the generation number so ancestors are above, per idea.md §14 convention); partners placed adjacent via union-node edges;
   - Edge styling: partner edges solid horizontal-ish, child edges solid; `proposed` edges dashed with „предложена" tooltip; adoptive/step edges labelled.
3. `PersonNode` component (idea.md §14): име (or mask label from redaction), години („1932–2001", „ок. 1950", „р. 1980-те" for public living), населено място, verification badge, source-count chip, placeholder avatar (photos are post-MVP); masked nodes get a distinct subdued style. `UnionNode`: small circular connector with union-type tooltip.
4. Root selection: person search box (public search hits the redacted public list — living people are not findable publicly; admin search full); URL state `?root=<personId>` shareable.
5. Base interactions (rest come in Task 32): zoom, pan, fit-view button, „Центрирай" on root, select node → basic info popover.
6. States: loading skeleton over the canvas area, Bulgarian empty state („Няма данни за показване"), error state with retry (idea.md §14 list).
7. Component/unit tests: `projectionToFlow` transform (fixture projection → expected RF nodes/edges incl. generation layering, union wiring), PersonNode render variants (full, masked, proposed edge badge).

## Acceptance criteria
- Dev walk-through: pick a root in admin tree → laid-out multi-generation tree with unions, readable at 100+, no person duplicated visually; public tree of the same root shows masked living members; layout does not freeze the tab.

## Verification
- Standard web verification; manual dev check with the Stage 3 fixture family (document the fixture seeding steps used).
- Commit as `task-31: tree visualization`.
