# Progress

Statuses: `todo` → `in-progress` → `done` (or `blocked` with a note).
The executing agent updates this file at the start and end of every task session.

> **Stack note (2026-07-18):** backend is **TypeScript/Node** (Hono + pg + Kysely), not Go — the Go/.NET toolchains are unavailable/blocked on this machine. See [ADR 0004](docs/adr/0004-typescript-node-backend.md). Repo is an npm-workspaces monorepo with `packages/shared` (HMAC + Zod). Schema, security, and product behavior are unchanged.

| # | Task | Status | Date | Notes |
|----|------|--------|------|-------|
| 01 | repo-scaffold | done | 2026-07-18 | Monorepo tree per idea.md §18 at repo root (no nested family-tree/). Added .gitignore, .editorconfig, .gitattributes (LF enforced; .sh stay LF for Linux), README. db/generated committed via .gitkeep. No package.json/go.mod/CI yet (later tasks). |
| 02 | architecture-docs-adrs | done | 2026-07-18 | docs/architecture.md (components, flow, network, auth, env inventory), docs/data-model.md (Mermaid erDiagram covering all 19 tables incl. nonces + idempotency_keys, per-table notes, enum summary), docs/security.md (threat model, HMAC, rate limits, GDPR). ADR 0001 (HMAC BFF), 0002 (staging vs canonical), 0003 (relational graph). Mermaid validated structurally via Node (depth 0, all required tables present); no browser render tool run. |
| 03 | openapi-contract | done | 2026-07-18 | contracts/openapi.yaml — OpenAPI 3.1 covering all §16 endpoints + invites (create/list/revoke/validate), tags per area, HMAC documented via ServiceHmac scheme + reusable header params, idempotency + uniform Error, tree projection & relationship-path examples verbatim from idea.md §13/§11. redocly lint: valid, 0 errors, 4 advisory warnings (SourceType reserved for task-24, etc). operationIds added. |
| 04 | api-skeleton-dev-env | done | 2026-07-19 | npm workspaces root (TS6/ESLint10/Vitest4) + @familytree/shared stub + @familytree/api (Hono 4, pg, Kysely 0.29, pino, zod 4). Health/ready, request-id, uniform errors, graceful shutdown. Static migration registry (db/migrations/index.ts) so bundled dist/db/migrate.js works in prod — verified. kysely-codegen wired (0 tables). Dev postgres compose (127.0.0.1:5433, UTF8, +familytree_test). 12 unit + 1 integration tests green; bundled server smoke-tested (/health, /ready 200). Note: Kysely 0.29 moved Migrator to 'kysely/migration' subpath. |
| 05 | migrations-staging-layer | done | 2026-07-19 | Migration 0001_staging_tables: invites, submissions, submission_people, submission_relationships, consents, audit_log, service_request_nonces, idempotency_keys — all CHECK/UNIQUE constraints per data-model, staging children CASCADE from submissions. Typed repos: invites (guarded atomic increment), submissions, audit, service-auth (nonce/idempotency with ON CONFLICT semantics). kysely-codegen regenerated (kysely_* excluded). 12 new integration tests: up/down/up cycle, dup local_key, used>max, guarded increment (max/revoked/expired), status CHECK, year-range CHECK, dup relationship, nonce replay, idempotency roundtrip+expiry. Bundled dist/db/migrate.js sees the migration. |
| 06 | migrations-canonical-layer | done | 2026-07-19 | Migration 0002_canonical_tables: people (+self-merge CHECK), person_names (partial unique preferred per type), places (UNIQUE NULLS NOT DISTINCT dedupe), person_events (year+date CHECKs), parent_child_relationships (self-parent CHECK, UNIQUE(parent,child,type), confidence 0-100), family_unions+union_partners, sources, evidence (ON DELETE RESTRICT), match_candidates (unique pair), person_merge_history. Deferred FK submission_people.matched_person_id → people added. Repos: people (+names/events/merge history, defaultValues fix for all-default inserts), places (concurrent-safe getOrCreate), genealogy (edges+unions), sources/evidence, matching (upsert preserves review state). 14 new integration tests — full acceptance matrix green (27 integration total). reviewed_by is TEXT (admin email) — ER updated. Bundled migrate sees both migrations. |
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
