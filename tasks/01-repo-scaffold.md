# Task 01: Monorepo scaffold & repo hygiene

**Depends on:** none · **Size:** S · **Spec:** idea.md §18 (repository structure), §26 (working rules)

## Goal
Create the monorepo skeleton and hygiene files so every later task has a predictable home. No frameworks are initialized here (that happens in Tasks 04 and 08).

## Requirements
1. The repository root is this repo's root — do **not** create a nested `family-tree/` directory. Create the directory tree (idea.md §18 adapted to the TypeScript/Node stack, [ADR 0004](../docs/adr/0004-typescript-node-backend.md)):
   - `apps/web/` (empty for now)
   - `services/api/` with `src/{auth,submissions,people,genealogy,matching,privacy,persistence,transport}/`, `src/db/generated/`, `db/migrations/`, `tests/`
   - `packages/shared/src/`
   - `contracts/`, `infra/oracle/`, `scripts/`, `docs/adr/`, `.github/workflows/`
   - Put a `.gitkeep` in each empty directory.
2. Root `.gitignore` covering: Node (`node_modules`, `.next`, coverage, `dist`), env files (`.env`, `.env.*` — but NOT `.env.example` / `env.example`), IDE/OS junk, Docker override files, Playwright artifacts, `*.age`, `*.dump`. Note: `services/api/src/db/generated/` (kysely-codegen output) **is committed** — do not ignore it.
3. Root `.editorconfig`: UTF-8, LF line endings, final newline; 2-space indent for ts/tsx/js/json/yaml/md.
4. Root `README.md`: one-line project purpose in Bulgarian + English, the architecture flow diagram from idea.md §2 (ASCII block), links to `idea.md`, `PLAN.md`, `PROGRESS.md`, `docs/`, and a "Quickstart" section with placeholders that later tasks fill in.
5. Do not add licenses, `package.json`, or CI files yet (the workspace root `package.json` is created in Task 04).

## Acceptance criteria
- Directory tree matches idea.md §18 (adapted to repo root).
- `git status` is clean after commit; no secrets, no generated junk.

## Verification
- Inspect the tree (e.g. `git ls-files`) against idea.md §18.
- Commit as `task-01: monorepo scaffold`.
