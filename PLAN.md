# Family Tree "Mitovski" — Implementation Plan

> **Кратко на български:** Това е планът за изпълнение на проекта от [idea.md](idea.md). Работата е разбита на малки задачи в папка `tasks/`, изпълнявани от AI агент **една по една** (промпт по промпт). Всяка сесия започва с промпта от секцията "How to execute a task". Прогресът се води в [PROGRESS.md](PROGRESS.md). Задачите са на английски, защото Claude моделите следват технически инструкции най-прецизно на английски.

---

## 1. What we are building

A non-commercial genealogy application for the Mitovski family: a public Bulgarian-language questionnaire (no registration) feeds an admin-moderated staging area; an administrator resolves submitted people against a canonical genealogy graph (PostgreSQL, relational graph model), confirms relationships, and the family tree is visualized interactively (React Flow + ELK). Living people are private by default. Encrypted backups and GEDCOM/JSON/CSV exports are mandatory.

**The authoritative functional specification is `idea.md` (Bulgarian).** Every task references its sections (`idea.md §N`). When a task and `idea.md` disagree, `idea.md` wins unless the task explicitly documents a decision.

> **Backend stack note:** the Oracle API is **TypeScript/Node** (Hono + pg + Kysely), not Go. idea.md §2 named Go; that was superseded — see [ADR 0004](docs/adr/0004-typescript-node-backend.md). The repo is an npm-workspaces monorepo with a shared `packages/shared` (HMAC + Zod). All product behavior, schema, and security are unchanged.

```text
Browser
  → Vercel Next.js (frontend + BFF, Auth.js admin auth, Turnstile)
  → Vercel Route Handler (validate, fingerprint, HMAC-sign)
  → Oracle VM: Caddy (TLS, 80/443)
  → TypeScript/Node API (Hono, pg, Kysely, HMAC verification)  [linux/arm64, Ampere A1]
  → PostgreSQL 16 (Docker, private network only, no public port)
```

Three data layers (never bypassed): **immutable submissions → staging/candidate records → canonical confirmed graph**. Only an admin promotes data between layers.

## 2. Execution model

- One agent session = **one task**. Tasks live in `tasks/NN-name.md` and are numbered in dependency order.
- `tasks/00-CONVENTIONS.md` is the standing contract — the agent reads it at the start of **every** session.
- After finishing a task the agent updates `PROGRESS.md`, commits as `task-NN: <summary>`, and **stops**.
- Task sizes: **S** (small, mechanical), **M** (a normal focused session), **L** (large — do not combine with anything else).

### How to execute a task (copy-paste prompt for each session)

```text
Read PLAN.md, tasks/00-CONVENTIONS.md and PROGRESS.md. Then execute task NN:
read tasks/NN-<name>.md and the idea.md sections it references, implement it fully
(production code + tests, no placeholders), run the Verification steps and fix any
failures, update PROGRESS.md (status, date, notes), and commit as "task-NN: <summary>".
Work only on this task. Do not start the next one.
```

Or, to let the agent pick up where it left off:

```text
Read PLAN.md, tasks/00-CONVENTIONS.md and PROGRESS.md. Execute the FIRST task whose
status is "todo" in PROGRESS.md, following the same rules: implement fully with tests,
verify, update PROGRESS.md, commit, stop.
```

## 3. Stages and tasks

### Stage 0 — Foundations (docs before code, idea.md §26)

| # | Task file | Title | Depends on | Size |
|---|-----------|-------|------------|------|
| 01 | `01-repo-scaffold.md` | Monorepo scaffold & repo hygiene | — | S |
| 02 | `02-architecture-docs-adrs.md` | Architecture docs, ER diagram, security doc, 3 ADRs | 01 | M |
| 03 | `03-openapi-contract.md` | OpenAPI 3.1 contract | 02 | M |

### Stage 1 — Infrastructure & skeleton (idea.md §24 Phase 1)

| # | Task file | Title | Depends on | Size |
|---|-----------|-------|------------|------|
| 04 | `04-api-skeleton-dev-env.md` | TypeScript/Node API skeleton + local dev environment | 01 | M |
| 05 | `05-migrations-staging-layer.md` | Migrations: staging layer (invites, submissions, consents, audit, nonces) | 04 | M |
| 06 | `06-migrations-canonical-layer.md` | Migrations: canonical layer (people, relationships, unions, sources, evidence) | 05 | L |
| 07 | `07-hmac-auth-middleware.md` | HMAC service authentication middleware + test vectors | 05 | L |
| 08 | `08-nextjs-skeleton.md` | Next.js app skeleton (Tailwind, shadcn/ui, BG locale) | 01 | M |
| 09 | `09-bff-signing-client.md` | BFF → Oracle signing client + fingerprint + error normalization | 07, 08 | M |
| 10 | `10-docker-caddy-infra.md` | Prod Docker Compose, Caddy, ARM64 image, cloud-init, firewall docs | 04 | L |
| 11 | `11-ci-pipeline.md` | CI workflow (lint, tests, ARM64 build, OpenAPI lint, gitleaks) | 04, 08 | M |

### Stage 2 — Questionnaire (idea.md §24 Phase 2)

| # | Task file | Title | Depends on | Size |
|---|-----------|-------|------------|------|
| 12 | `12-invitations.md` | Invitation tokens (hash-only storage, limits, revocation) | 07 | M |
| 13 | `13-questionnaire-schema-validation.md` | Questionnaire Zod schemas, payload model, draft persistence | 08 | M |
| 14 | `14-questionnaire-ui-steps-1-4.md` | Questionnaire UI: steps 1–4 + multi-step shell | 13 | L |
| 15 | `15-questionnaire-ui-steps-5-7.md` | Questionnaire UI: steps 5–7, consent, summary, Turnstile | 14 | L |
| 16 | `16-submission-pipeline.md` | Submission pipeline end-to-end (BFF + API, anti-abuse, rate limits) | 09, 12, 15 | L |
| 17 | `17-admin-auth.md` | Admin authentication (Auth.js, allowlist, admin shell) | 08 | M |
| 18 | `18-admin-submissions-inbox.md` | Admin submissions inbox + status workflow + invites UI | 16, 17 | L |

### Stage 3 — Review & canonical graph (idea.md §24 Phase 3)

| # | Task file | Title | Depends on | Size |
|---|-----------|-------|------------|------|
| 19 | `19-name-normalization.md` | Name normalization & transliteration package | 06 | M |
| 20 | `20-match-engine.md` | Match candidates engine with explainable scores | 19 | L |
| 21 | `21-canonical-people-crud.md` | Canonical people, names, places, events; create/link from submission | 19 | L |
| 22 | `22-parent-child-cycle-prevention.md` | Parent-child relationships + transactional cycle prevention | 21 | M |
| 23 | `23-family-unions.md` | Family unions & partners | 21 | M |
| 24 | `24-sources-evidence.md` | Sources & evidence model | 21 | M |
| 25 | `25-person-merge.md` | Transactional person merge + merge history | 22, 23, 24 | L |
| 26 | `26-admin-people-browser.md` | Admin people browser, editing, merge UI | 25 | L |
| 27 | `27-admin-review-workspace.md` | Admin review workspace: resolve people, confirm relationships | 20, 26 | L |

### Stage 4 — Tree & privacy (idea.md §24 Phase 4)

| # | Task file | Title | Depends on | Size |
|---|-----------|-------|------------|------|
| 28 | `28-genealogy-queries-resolver.md` | Recursive CTEs + RelationshipResolver + Bulgarian kinship labels | 22 | L |
| 29 | `29-tree-projection-api.md` | Tree projection API (nodes + edges, union nodes, dedup) | 23, 28 | L |
| 30 | `30-privacy-redaction.md` | PersonRedactionService + public/admin views | 29 | M |
| 31 | `31-tree-visualization.md` | React Flow + ELK tree visualization | 29, 30 | L |
| 32 | `32-tree-ux-path-highlight.md` | Tree UX: expand/collapse, path highlighting, mobile fallback | 31 | M |

### Stage 5 — Ops & delivery (idea.md §24 Phase 5, §20–§23)

| # | Task file | Title | Depends on | Size |
|---|-----------|-------|------------|------|
| 33 | `33-backup-restore.md` | Encrypted backups, retention, restore & verify scripts, BG docs | 10 | L |
| 34 | `34-exports-gedcom-json-csv.md` | GEDCOM / JSON / CSV exports | 23 | M |
| 35 | `35-deploy-workflows.md` | Deploy workflows (ARM64 build, SSH deploy, healthcheck, rollback) | 10, 11 | M |
| 36 | `36-monitoring.md` | Metrics, correlation IDs, abuse counters, disk alerts | 16 | M |
| 37 | `37-e2e-playwright.md` | Playwright E2E suite (full flow per idea.md §23) | 27, 31 | L |

### Post-MVP (optional, idea.md §24 Phase 6)

| # | Task file | Title | Depends on | Size |
|---|-----------|-------|------------|------|
| 38 | `38-file-uploads.md` | Private file uploads (photos/documents) — OPTIONAL, post-MVP | 26, 33 | L |

## 4. Definition of Done mapping (idea.md §25)

| DoD item | Covered by tasks |
|---|---|
| 1. Questionnaire without registration | 13, 14, 15, 16 |
| 2. Server-side bot protection | 16 |
| 3. Submission enters as pending | 16 |
| 4. Submissions never mutate canonical tree | 05, 16 (design: §7 layers) |
| 5. Admin can review submissions | 17, 18 |
| 6. Admin can find match candidates | 20, 27 |
| 7. Admin can create/link person | 21, 27 |
| 8. Admin can confirm parent-child | 22, 27 |
| 9. Ancestry cycles rejected | 22 |
| 10. Tree rendered as nodes + edges | 29, 31 |
| 11. No duplicated person node | 29 |
| 12. Living people hidden in public mode | 30 |
| 13. PostgreSQL not reachable from internet | 10 |
| 14. Only HMAC-signed business requests accepted | 07 |
| 15. Automatic encrypted backup | 33 |
| 16. Documented restore procedure | 33 |
| 17. Runs on ARM64 Oracle VM | 10, 35 |
| 18. Frontend on Vercel | 08, 35 |
| 19. No secrets in git | 01, 11 (gitleaks), conventions |
| 20. Automated tests for main flows | every task + 37 |

## 5. Notes

- **MVP = tasks 01–37.** Task 38 (file uploads) is explicitly post-MVP: idea.md §25 does not require it.
- Placeholder domains everywhere: `rod.mitovski.example` / `api.rod.mitovski.example` (idea.md §3). Real domains are configured only via environment/DNS, never hardcoded.
- Prefer the simplest secure option on any ambiguity, and record the decision (task notes in PROGRESS.md; ADR for architectural decisions) — idea.md §26.
