# Task 04: TypeScript/Node API skeleton + local dev environment

**Depends on:** 01 · **Size:** M · **Spec:** idea.md §2 (Backend), §16 (Operations), §18 · **Stack:** [ADR 0004](../docs/adr/0004-typescript-node-backend.md)

> Backend is **TypeScript/Node** (Hono + pg + Kysely), not Go. This task also bootstraps the **npm workspaces** monorepo root that Task 08 (web) and Tasks 07/09 (shared) build on.

## Goal
A running Hono API with health/readiness, structured logging, graceful shutdown, a pg pool, Kysely + a migration CLI, and a local dev PostgreSQL via Docker Compose. Plus the workspace root and the `packages/shared` stub.

## Requirements
1. **Workspace root** (`/package.json`): private, `"workspaces": ["apps/*", "services/*", "packages/*"]`, `"engines": {"node": ">=22"}`, `.nvmrc` = `22`. Root scripts: `lint`, `typecheck`, `test`, `build` delegating with `npm run -ws --if-present <script>`. Add root dev tooling: TypeScript 5.x, ESLint (flat config) + `typescript-eslint`, Prettier, Vitest. Single committed `package-lock.json`. A shared base `tsconfig.base.json` (strict, `moduleResolution: "bundler"` or `node16`, `target: ES2022`, `noUncheckedIndexedAccess`) that packages extend.
2. **`packages/shared`** stub: `package.json` (name `@familytree/shared`, type module, exports `./*`), `tsconfig.json` extending the base, `src/index.ts` exporting a version constant and a placeholder. HMAC/Zod land in Tasks 07/09/13 — just make it build and be importable as `@familytree/shared`.
3. **`services/api`** (`@familytree/api`, private, ESM): dependencies `hono`, `@hono/node-server`, `pg`, `kysely`, `pino`, `zod`, `@familytree/shared` (workspace:\*); dev deps `tsx`, `esbuild`, `kysely-codegen`, `@types/pg`, `vitest`, `pino-pretty`.
4. **Config** (`src/config.ts`): parse env with Zod — `PORT` (default 8080), `DATABASE_URL` (required), `LOG_LEVEL` (default `info`), `ENV` (`dev|prod`, default `dev`). Fail fast with a clear message listing missing vars.
5. **Logging** (`src/logger.ts`): pino JSON logger (pretty in dev). A Hono middleware logging method, path, status, duration ms, and request id — **never** request/response bodies.
6. **HTTP app** (`src/transport/app.ts`): Hono app with middleware — request id (accept inbound `X-Request-Id` else generate a UUID), a recoverer/`onError` returning the uniform error shape (conventions §5), and the logger. JSON helpers `writeError(c, status, code, message)` producing `{"error":{code,message,requestId}}`.
7. **Endpoints:** `GET /health` → `{"status":"ok"}` only (no versions/hostnames/infra — idea.md §4); `GET /ready` → 200 `{status:"ok"}` when the DB ping succeeds, else 503 `{status:"unavailable"}`.
8. **Server entry** (`src/index.ts`): start `@hono/node-server`; graceful shutdown on SIGTERM/SIGINT — stop accepting, drain in-flight, close the pg pool, exit; ≤10s deadline.
9. **Persistence** (`src/persistence/db.ts`): a `pg` `Pool` (sane max), a Kysely instance typed against `src/db/generated`, and a `ping()` helper (`SELECT 1`).
10. **Migrations:** Kysely migration runner in `src/db/migrate.ts` exposing a CLI `api migrate up|down|status` (via a script). Migrations live in `services/api/db/migrations/*.ts` (each exports `up(db)`/`down(db)` using the `sql` template). Add a trivial no-op first migration only if needed to prove the runner; real tables arrive in Tasks 05–06. `kysely-codegen` config generates `src/db/generated/*` from the dev DB (committed); add a `codegen` script.
11. **`services/api` scripts:** `dev` (`tsx watch src/index.ts`), `build` (`tsc --noEmit` + `esbuild` bundle to `dist/`), `start` (`node dist/index.js`), `lint`, `typecheck`, `test` (vitest), `test:integration` (vitest with `vitest.integration.config.ts`), `migrate:up|down|status`, `codegen`.
12. **`docker-compose.dev.yml`** at repo root: `postgres:16-alpine`, bind **127.0.0.1:5433** only, `POSTGRES_DB=familytree_dev`, named volume, healthcheck (`pg_isready`), UTF-8. An initdb script creates a second database `familytree_test` for integration tests.
13. **`services/api/.env.example`**: `DATABASE_URL=postgres://familytree:familytree@localhost:5433/familytree_dev`, `PORT`, `LOG_LEVEL`, `ENV`.
14. **Tests:** unit tests for config parsing and the health handler (Vitest + Hono test client `app.request()`); an integration test (`vitest.integration.config.ts`) that pings the dev DB via the pool.
15. Update the root README quickstart (install, compose up, migrate, dev, curl health).

## Acceptance criteria
- `npm install` at root wires the workspaces; `npm run dev -w @familytree/api` serves `/health` and `/ready`; `/ready` is 503 when the DB is down, 200 when up.
- `api migrate status` runs cleanly; `npm run build -w @familytree/api` produces a runnable `dist/`.

## Verification
- `docker compose -f docker-compose.dev.yml up -d`
- Standard API verification (`lint`, `typecheck`, `test -- --run`, `build`) + `npm run test:integration -w @familytree/api`.
- `curl 127.0.0.1:8080/health` returns `{"status":"ok"}`.
- Commit as `task-04: api skeleton and dev env`.
