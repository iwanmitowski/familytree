# Task 02: Architecture docs, ER diagram, security doc, ADRs

**Depends on:** 01 · **Size:** M · **Spec:** idea.md §1–§8, §15, §20, §26

## Goal
Produce the authoritative design documents required by idea.md §26 **before** production code: architecture, data model with ER diagram, security model, and three ADRs.

## Requirements
1. `docs/architecture.md` (English):
   - Component overview: Vercel Next.js (frontend + BFF), Go API on Oracle Ampere A1, PostgreSQL in Docker, Caddy reverse proxy.
   - Request flow diagram (idea.md §2) and network scheme incl. DNS + ingress rules (§3).
   - Authentication model: public users (no accounts), admin via Auth.js + allowlist, BFF→API HMAC (§4, §5).
   - Anti-abuse summary (§6) and the three data layers (§7).
   - Environment variable inventory per deployment target (§17, §20) — names and purpose only, no values.
2. `docs/data-model.md` (English):
   - A Mermaid `erDiagram` covering ALL tables from idea.md §8: `invites`, `submissions`, `submission_people`, `submission_relationships`, `people`, `person_names`, `places`, `person_events`, `parent_child_relationships`, `family_unions`, `union_partners`, `sources`, `evidence`, `match_candidates`, `person_merge_history`, `consents`, `audit_log`, `service_request_nonces`, plus `idempotency_keys` (needed by §4 idempotency checks).
   - Per-table notes: purpose, key constraints, enum values (submission status, resolution status, date_precision, relationship types, verification status, privacy levels, consent types, source types).
   - Explicit rules: imprecise dates (§8 date_precision, no fake Jan 1), merged/deleted people never active, derived kinship never stored (§11).
3. `docs/security.md` (English):
   - Threat model table (spoofed BFF requests, replay, bot spam, enumeration, data leakage of living people, secret leakage).
   - HMAC scheme (§4): headers, canonical payload, clock skew, nonce store, idempotency, constant-time comparison, generic failures.
   - Rate limits (§6) and what is/never is stored (fingerprint not raw IP, token hashes, no payload logging).
   - Privacy & GDPR notes: consent records (§8), data minimization, living-people defaults (§15), erasure approach (admin deletes/anonymizes on request).
4. ADRs in `docs/adr/` (format: Title, Status, Context, Decision, Consequences):
   - `0001-vercel-to-oracle-hmac-bff.md` — why BFF + HMAC instead of direct DB or public API with OAuth (§4, §26).
   - `0002-staging-vs-canonical-data.md` — immutable submissions → staging → canonical, admin-only promotion (§7).
   - `0003-relational-graph-model.md` — PostgreSQL relational graph + recursive CTEs over a graph DB or nested JSON (§11, §26).
5. Where idea.md is ambiguous, choose the simplest secure option and record it in the relevant doc/ADR.

## Acceptance criteria
- Mermaid diagram is syntactically valid (renders on GitHub).
- No contradictions with idea.md; every §8 table appears in the ER diagram.

## Verification
- Validate the Mermaid block (e.g. paste into a Mermaid live check or `npx @mermaid-js/mermaid-cli` if convenient; visual inspection acceptable).
- Commit as `task-02: architecture docs and ADRs`.
