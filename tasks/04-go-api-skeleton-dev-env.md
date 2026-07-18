# Task 04: Go API skeleton + local dev environment

**Depends on:** 01 · **Size:** M · **Spec:** idea.md §2 (Backend), §16 (Operations), §18

## Goal
A running Go API with health/readiness, structured logging, graceful shutdown, pgx pool, goose + sqlc wiring, and a local dev PostgreSQL via Docker Compose.

## Requirements
1. Go module at `services/api` (module path per conventions §4), Go 1.23+. Dependencies: `go-chi/chi/v5`, `jackc/pgx/v5` (pool), `pressly/goose/v3`.
2. `cmd/api/main.go` with subcommands (plain `os.Args` switch, no CLI framework):
   - `api` (default) — run the HTTP server;
   - `api migrate up|down|status` — run goose migrations from an `embed.FS` of `db/migrations`;
   - `api healthcheck` — GET `http://127.0.0.1:$PORT/health`, exit 0/1 (used later by Docker healthcheck).
3. Config from env (`internal/config`): `PORT` (default 8080), `DATABASE_URL`, `LOG_LEVEL`, `ENV` (dev/prod). Fail fast with a clear message on missing required vars.
4. Logging: `log/slog` JSON handler; request logging middleware (method, path, status, duration ms, request ID). Never log request/response bodies.
5. Router (`internal/transport`): chi with middleware — request ID (accept inbound `X-Request-Id` else generate UUID), recoverer returning the uniform JSON error shape, request logger. JSON helpers `WriteJSON` / `WriteError` implementing the conventions §5 error shape.
6. Endpoints: `GET /health` → `{"status":"ok"}` only (no versions/hostnames/infra details, idea.md §4); `GET /ready` → 200 if DB ping OK else 503 (body: status only).
7. Graceful shutdown on SIGTERM/SIGINT: stop accepting, drain ≤10s, close pool (idea.md §2).
8. `internal/persistence`: pgxpool constructor (sane pool sizes), `Ping(ctx)` helper.
9. sqlc: `services/api/sqlc.yaml` (engine postgresql, pgx/v5, queries `db/queries`, output `db/generated`, committed). Add one trivial query file (e.g. `SELECT 1`) so `sqlc generate` produces compiling output.
10. `docker-compose.dev.yml` at repo root: `postgres:16-alpine`, bind **127.0.0.1:5433** only, `POSTGRES_DB=familytree_dev`, named volume, healthcheck (`pg_isready`), UTF-8. Add an initdb script creating a second database `familytree_test` for integration tests.
11. `services/api/.env.example` (`DATABASE_URL=postgres://...localhost:5433/familytree_dev`, `PORT`, `LOG_LEVEL`, `ENV`).
12. `services/api/Makefile` (usable from Git Bash): `run`, `test`, `test-integration`, `migrate-up`, `migrate-status`, `sqlc`, `build`, `build-arm64` (`GOOS=linux GOARCH=arm64`).
13. Tests: unit tests for config parsing and the health handler; integration test (build tag `integration`) that pings the dev DB.
14. Update README quickstart (compose up, migrate, run, curl health).

## Acceptance criteria
- `go run ./cmd/api` serves `/health` and `/ready` locally; `/ready` is 503 when DB is down, 200 when up.
- `api migrate status` runs cleanly (zero migrations yet).
- ARM64 build succeeds.

## Verification
- `docker compose -f docker-compose.dev.yml up -d`
- Standard Go verification + `go test -tags=integration ./...`
- `make build-arm64` (or the equivalent env-prefixed `go build`).
- Commit as `task-04: go api skeleton and dev env`.
