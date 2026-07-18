# Task 11: CI pipeline

**Depends on:** 04, 08 · **Size:** M · **Spec:** idea.md §18 (.github/workflows), §20 (tests before deploy), §25.19 (no secrets in git)

## Goal
`.github/workflows/ci.yml` giving every PR/push fast, complete feedback: workspace checks, API checks with real PostgreSQL, ARM64 image build, OpenAPI lint, secret scanning.

## Requirements
1. Triggers: `pull_request` and `push` to `main`; concurrency group cancelling in-progress runs per ref. Use a single `npm ci` at the workspace root (cached) so all workspaces share one install.
2. Jobs (use path filters so unrelated changes skip heavy jobs, but always run gitleaks):
   - **web**: Node 22, `npm ci` (root), then `-w @familytree/web` `lint`, `typecheck`, `test -- --run`, `build`. Include `-w @familytree/shared` build/test so the shared package is validated.
   - **api**: Node 22, `-w @familytree/api` `lint`, `typecheck`, `test -- --run`, `build`; then integration: `postgres:16` service container, run `npm run migrate:up -w @familytree/api` against it, `npm run test:integration -w @familytree/api` with `DATABASE_URL` pointing at the service.
   - **docker-arm64**: buildx build `--platform linux/arm64` of `services/api/Dockerfile`, no push (PRs prove the ARM64 image builds for Ampere A1).
   - **contracts**: `npx @redocly/cli lint contracts/openapi.yaml`.
   - **gitleaks**: secret scan over the full history of the push/PR (e.g. `gitleaks/gitleaks-action`), no license key required for public/personal use; failing on findings (DoD §25.19).
3. Generated-code drift check in the api job: run `npm run codegen -w @familytree/api` (against the postgres service, post-migrate) and `git diff --exit-code services/api/src/db/generated` to prove the committed Kysely types are current.
4. No repository secrets required for CI; workflows must not reference deploy secrets (deploy arrives in Task 35).
5. Badge in README optional; keep total runtime economical (cache npm via `actions/setup-node` cache).

## Acceptance criteria
- Workflow YAML is valid (`actionlint` clean if available) and all commands match the repo's actual scripts.
- A full local dry-run of each job's commands passes.

## Verification
- Run every job's commands locally (Windows: use Git Bash where needed).
- `npx actionlint` or careful YAML review.
- Commit as `task-11: ci pipeline`.
