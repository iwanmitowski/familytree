# Progress

Statuses: `todo` → `in-progress` → `done` (or `blocked` with a note).
The executing agent updates this file at the start and end of every task session.

| # | Task | Status | Date | Notes |
|----|------|--------|------|-------|
| 01 | repo-scaffold | done | 2026-07-18 | Monorepo tree per idea.md §18 at repo root (no nested family-tree/). Added .gitignore, .editorconfig, .gitattributes (LF enforced; .sh stay LF for Linux), README. db/generated committed via .gitkeep. No package.json/go.mod/CI yet (later tasks). |
| 02 | architecture-docs-adrs | done | 2026-07-18 | docs/architecture.md (components, flow, network, auth, env inventory), docs/data-model.md (Mermaid erDiagram covering all 19 tables incl. nonces + idempotency_keys, per-table notes, enum summary), docs/security.md (threat model, HMAC, rate limits, GDPR). ADR 0001 (HMAC BFF), 0002 (staging vs canonical), 0003 (relational graph). Mermaid validated structurally via Node (depth 0, all required tables present); no browser render tool run. |
| 03 | openapi-contract | done | 2026-07-18 | contracts/openapi.yaml — OpenAPI 3.1 covering all §16 endpoints + invites (create/list/revoke/validate), tags per area, HMAC documented via ServiceHmac scheme + reusable header params, idempotency + uniform Error, tree projection & relationship-path examples verbatim from idea.md §13/§11. redocly lint: valid, 0 errors, 4 advisory warnings (SourceType reserved for task-24, etc). operationIds added. |
| 04 | go-api-skeleton-dev-env | todo | | |
| 05 | migrations-staging-layer | todo | | |
| 06 | migrations-canonical-layer | todo | | |
| 07 | hmac-auth-middleware | todo | | |
| 08 | nextjs-skeleton | todo | | |
| 09 | bff-signing-client | todo | | |
| 10 | docker-caddy-infra | todo | | |
| 11 | ci-pipeline | todo | | |
| 12 | invitations | todo | | |
| 13 | questionnaire-schema-validation | todo | | |
| 14 | questionnaire-ui-steps-1-4 | todo | | |
| 15 | questionnaire-ui-steps-5-7 | todo | | |
| 16 | submission-pipeline | todo | | |
| 17 | admin-auth | todo | | |
| 18 | admin-submissions-inbox | todo | | |
| 19 | name-normalization | todo | | |
| 20 | match-engine | todo | | |
| 21 | canonical-people-crud | todo | | |
| 22 | parent-child-cycle-prevention | todo | | |
| 23 | family-unions | todo | | |
| 24 | sources-evidence | todo | | |
| 25 | person-merge | todo | | |
| 26 | admin-people-browser | todo | | |
| 27 | admin-review-workspace | todo | | |
| 28 | genealogy-queries-resolver | todo | | |
| 29 | tree-projection-api | todo | | |
| 30 | privacy-redaction | todo | | |
| 31 | tree-visualization | todo | | |
| 32 | tree-ux-path-highlight | todo | | |
| 33 | backup-restore | todo | | |
| 34 | exports-gedcom-json-csv | todo | | |
| 35 | deploy-workflows | todo | | |
| 36 | monitoring | todo | | |
| 37 | e2e-playwright | todo | | |
| 38 | file-uploads (post-MVP, optional) | todo | | |
