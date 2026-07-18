# Task 29: Tree projection API (nodes + edges)

**Depends on:** 23, 28 · **Size:** L · **Spec:** idea.md §13 (entire section — response shape is normative), §14 (generation convention)

## Goal
`GET /v1/internal/tree/{personId}` returning the flat `nodes + edges` projection with synthetic union nodes, generation numbers, person deduplication, and truncation — exactly the idea.md §13 contract.

## Requirements
1. Endpoint with query params per idea.md §13: `ancestors` (default 4, max 6), `descendants` (default 2, max 6), `includePartners` (default true), `includeSiblings` (default false), `view` (`private|public` — plumbed through now, enforced fully in Task 30).
2. Projection builder in `internal/genealogy`:
   - Traverse from root using the bounded subgraph queries (Task 28): ancestors up, descendants down; when `includeSiblings`, add other children of included parents; when `includePartners`, add union partners of included people;
   - **Union nodes** (idea.md §13): one synthetic node per included `family_union`; partner edges `person → union` (`type: "partner"`), child edges `union → child` (`type: "child"`, carrying `relationshipType`) when the child edge has that `family_union_id` or both parents are in the union; children without a union get direct `person → person` child edges;
   - **Generation numbers** per idea.md §14: root 0, parents −1, grandparents −2, children +1; partners share their partner's generation; union node sits on the parents' generation;
   - **Dedup:** a person reachable through multiple branches (pedigree collapse) appears as **one** node with multiple edges (idea.md §13);
   - Include both `proposed` and `confirmed` edges; each edge carries `verificationStatus` (UI styles them differently); `disputed`/`rejected` excluded;
   - Caps: max 400 nodes — stop expanding breadth-first and set `truncated: true` (idea.md §13);
   - Node payload per §13 example (id, type, label = preferred name, birthYear/deathYear from events honoring precision — approximate years render as the year with an `approximate` flag, unknown stays null — living, generation, privacyLevel) + `verificationState` and `sourceCount` for §14 node display.
3. Convenience endpoints from idea.md §16: `GET /v1/internal/tree/{personId}/ancestors` and `/descendants` as parameterized shortcuts.
4. Root id resolution follows merged people (one hop) — a merged id projects the target's tree with a note field.
5. Update OpenAPI with the full response schema (§13 example verbatim as the example).

## Acceptance criteria
- Fixture with: remarriage (person in 2 unions with children in each), a pedigree-collapse marriage of relatives, proposed + confirmed edges, and >400-node synthetic expansion — projection yields single person nodes (no duplicates), correct union wiring, correct generations, `truncated` set appropriately.

## Verification
- Integration tests on the fixtures above (assert node/edge sets, generations, dedup by counting node ids, truncation).
- Standard Go verification + `go test -tags=integration ./...`.
- Commit as `task-29: tree projection api`.
