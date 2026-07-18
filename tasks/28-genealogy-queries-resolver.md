# Task 28: Recursive genealogy queries + RelationshipResolver + Bulgarian kinship labels

**Depends on:** 22 · **Size:** L · **Spec:** idea.md §11 (entire section), §23 (relationship/common-ancestor/cousin tests)

## Goal
The genealogy computation core: recursive CTEs for ancestry, a `RelationshipResolver` that names the kinship between any two people in Bulgarian, and the relationship-path endpoint.

## Requirements
1. Kysely recursive CTE queries (raw `sql`) over **confirmed** parent-child edges, excluding merged/deleted people (idea.md §11): `ancestors(personId, maxDepth)` (with depth), `descendants(personId, maxDepth)`, `commonAncestors(a, b, maxDepth)` (each ancestor with both depths, ordered by combined depth), plus a bounded subgraph fetch (`edges within N generations of X`) reused by Task 29.
2. `src/genealogy` `RelationshipResolver` with `resolve(personAId, personBId, maxDepth)` → exactly the idea.md §11 shape: `{connected, relationshipLabelBg, commonAncestors, path, confidence}`:
   - Build a bounded in-memory graph (CTE results + union partner edges) and BFS the shortest path A→B; edge kinds: parent/child/partner;
   - Classification from common-ancestor depths `(d1, d2)`: direct line (родител/дете, баба/дядо ↔ внук/внучка, прабаба/прадядо…), siblings `(1,1)` — брат/сестра, uncle/aunt `(1,2)` — чичо/леля ↔ племенник/племенница, cousins: degree = `min(d1,d2) − 1`, removal = `|d1 − d2|` → „първи братовчеди", „втори братовчеди", removals as „… веднъж отместени" (document label choices);
   - Partner-hop paths append „съпруг/съпруга на …" / „партньор на …" — kept distinct from blood kinship (idea.md §11: biological separate from through-marriage); a pure-partner connection is `connected: true` with a through-marriage label;
   - `confidence`: 100 for all-confirmed biological paths; −15 per `proposed` edge on the path (floor 30); document the formula;
   - Labels: neutral where gender is unknown (e.g. „родител", „баба/дядо") — living_status/gender data is limited, prefer the slash forms from idea.md §11.
3. `GET /v1/internal/relationship-path?personA=&personB=&maxDepth=6` (admin for now; public redaction handled in Task 30) returning the resolver result; 404-free: unknown ids → 422 `unknown_person`; disconnected → `{connected:false}`. Update OpenAPI.
4. Derived kinship is computed, never stored (assert no new relationship tables/rows — idea.md §11).

## Acceptance criteria
- Label matrix correct on a 5-generation fixture incl.: parent, grandparent, sibling, uncle/nephew, first and second cousins, first cousins once removed, partner-of-sibling (through-marriage), disconnected pair.

## Verification
- Unit tests for the classification math + Bulgarian label table (snapshot); integration tests for the CTEs (depth limits honored, merged people excluded); resolver end-to-end on the fixture.
- Standard API verification + `npm run test:integration -w @familytree/api`.
- Commit as `task-28: genealogy queries and relationship resolver`.
