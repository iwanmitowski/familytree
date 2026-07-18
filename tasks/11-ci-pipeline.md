# Task 11: CI pipeline

**Depends on:** 04, 08 · **Size:** M · **Spec:** idea.md §18 (.github/workflows), §20 (tests before deploy), §25.19 (no secrets in git)

## Goal
`.github/workflows/ci.yml` giving every PR/push fast, complete feedback: web checks, Go checks with real PostgreSQL, ARM64 cross-build, OpenAPI lint, secret scanning.

## Requirements
1. Triggers: `pull_request` and `push` to `main`; concurrency group cancelling in-progress runs per ref.
2. Jobs (use path filters so unrelated changes skip heavy jobs, but always run gitleaks):
   - **web**: Node 22, `npm ci`, `lint`, `typecheck`, `test -- --run`, `build` (in `apps/web`).
   - **api**: Go from `go.mod`, `go vet ./...`, `go build ./...`, unit tests; then integration: `postgres:16` service container, run `api migrate up` against it, `go test -tags=integration ./...` with `DATABASE_URL` pointing at the service.
   - **api-arm64**: `GOOS=linux GOARCH=arm64 go build ./...` (cross-compile gate for Ampere A1).
   - **docker-arm64**: buildx build `--platform linux/arm64` of `services/api/Dockerfile`, no push (PRs prove the image builds).
   - **contracts**: `npx @redocly/cli lint contracts/openapi.yaml`.
   - **gitleaks**: secret scan over the full history of the push/PR (e.g. `gitleaks/gitleaks-action`), no license key required for public/personal use; failing on findings (DoD §25.19).
3. sqlc drift check in the api job: run `sqlc generate` (via `sqlc` Docker image or installed binary) and `git diff --exit-code services/api/db/generated` to prove committed generated code is current.
4. No repository secrets required for CI; workflows must not reference deploy secrets (deploy arrives in Task 35).
5. Badge in README optional; keep total runtime economical (cache Go modules + npm).

## Acceptance criteria
- Workflow YAML is valid (`actionlint` clean if available) and all commands match the repo's actual scripts.
- A full local dry-run of each job's commands passes.

## Verification
- Run every job's commands locally (Windows: use Git Bash where needed).
- `npx actionlint` or careful YAML review.
- Commit as `task-11: ci pipeline`.
