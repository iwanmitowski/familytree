# ADR 0003: Relational graph model in PostgreSQL

- **Status:** Accepted
- **Date:** 2026-07-18
- **Context ref:** idea.md §8, §11, §12, §13, §26

## Context

The genealogy is a graph: people connected by parent-child edges and partnerships, with derived kinship (siblings, cousins, uncles/aunts, grandparents) computed on top. We must compute ancestors, descendants, common ancestors, shortest kinship paths, and generation depth; prevent ancestry cycles; and project the graph as `nodes + edges` for visualization. We must also keep biological relationships distinct from relationships through marriage (idea.md §11).

Options considered:

1. **A dedicated graph database** (e.g. Neo4j).
2. **A single nested JSON document** representing the whole tree.
3. **A relational graph in PostgreSQL** — edges as rows, traversal via recursive CTEs.

## Decision

Adopt **option 3**. Model the graph relationally:

- Nodes: `people`.
- Directed edges: `parent_child_relationships` (`parent_id → child_id`) with type, verification status, confidence, and optional `family_union_id`.
- Partnerships: `family_unions` + `union_partners` (no `spouse_id` on `people`); a person may be in many unions.
- Derived kinship is **never stored** — it is computed with recursive CTEs (`ancestors`, `descendants`, `common ancestors`, shortest path) and labeled in Bulgarian by a `RelationshipResolver` (idea.md §11).
- Ancestry-cycle prevention runs in the same transaction as an edge insert/confirm (idea.md §12).
- The tree projection endpoint returns flat `nodes + edges` with synthetic union nodes and person deduplication, not nested JSON (idea.md §13).

## Consequences

**Positive**
- One datastore for everything (submissions, canonical graph, audit) — cheaper and simpler to operate and back up on an Always Free VM (idea.md §26).
- Recursive CTEs cover the required traversals; constraints (`CHECK`, `UNIQUE`, FKs) and transactions give strong integrity, including transactional cycle prevention.
- Provenance, privacy, and evidence integrate naturally as related tables.
- Deduplication and pedigree collapse are handled by referencing a single node from multiple edges.

**Negative / risks**
- Deep or wide traversals must be bounded (`maxDepth`, node caps) to stay performant; the projection enforces caps and a `truncated` flag (idea.md §13).
- Recursive CTEs are more verbose than a graph query language; mitigated by encapsulating them in `internal/genealogy` with tests.
- Cycle prevention correctness is critical; covered by the dedicated test matrix in idea.md §12.

## Alternatives rejected

- **Graph database** — extra operational component, cost, and backup complexity on a single Always Free VM; not justified at this scale (idea.md §26 favors the simpler option).
- **Nested JSON tree** — explicitly forbidden (idea.md §26): no integrity constraints, painful partial updates, no dedup, and unsafe for concurrent editing.
