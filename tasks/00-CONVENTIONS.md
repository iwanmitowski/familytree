# Task 00: Global Conventions — read at the start of EVERY session

This file is the standing contract for all task sessions. It complements `PLAN.md` (the plan) and `idea.md` (the authoritative functional spec, written in Bulgarian). If a convention here conflicts with `idea.md`, `idea.md` wins.

## 1. Session workflow

1. Read `PLAN.md`, this file, and `PROGRESS.md`.
2. Execute exactly **one** task: the one named in the prompt, or the first `todo` in `PROGRESS.md`.
3. Read the task file **and** every `idea.md` section it references before writing code.
4. Set the task's status to `in-progress` in `PROGRESS.md` when you start.
5. Implement production code + tests. **No pseudocode, no stub/TODO implementations for required behavior** (idea.md §26).
6. Run the task's Verification commands; fix failures until they pass.
7. Update `PROGRESS.md`: status `done`, date, short notes (deviations, decisions, follow-ups).
8. Commit everything as `task-NN: <short summary>`. Do not start the next task.
9. If genuinely blocked, set status `blocked` with a note explaining exactly what is needed, and stop.

## 2. Hard security invariants (never violate, in any task)

- Never commit secrets, credentials, tokens, or real personal data. `.env*` files are gitignored; only `.env.example` / `env.example` files (with empty or placeholder values) are committed.
- No secret environment variable may start with `NEXT_PUBLIC_` (idea.md §17). Only Turnstile **site key** may be public.
- PostgreSQL is never exposed to the internet: no published `5432` host port in production compose; only Caddy publishes `80`/`443` (idea.md §2, §19).
- Every Oracle business endpoint requires HMAC service authentication per idea.md §4. Only `GET /health` is exempt; it reveals nothing internal.
- The browser never calls the Oracle API directly — always through the Vercel BFF (idea.md §2).
- Never store: plain invitation tokens (hash only), raw IP addresses (HMAC fingerprint only), raw Turnstile tokens, secrets or full signatures in logs or audit records (idea.md §6, §8).
- Actor identity headers are trusted **only** because they are included in the HMAC signature (idea.md §4).
- Authentication failures return a generic message; details go to debug logs without secrets.
- Never auto-merge people based on match score; every promotion from staging to canonical is an explicit admin action (idea.md §7, §10).
- Original submission payloads are immutable after insert (idea.md §7).

## 3. Data invariants

- All timestamps are `TIMESTAMPTZ`; database encoding is UTF-8 (idea.md §2).
- Primary keys are UUIDs (`gen_random_uuid()`), tables/columns `snake_case`.
- Enumerations are enforced with `CHECK` constraints (documented in `docs/data-model.md`).
- Imprecise dates use `date_from`/`date_to`/`year_from`/`year_to` + `date_precision`; **never** fabricate a fake `January 1` for an unknown date (idea.md §8).
- Merged or soft-deleted people (`merged_into_person_id`, `deleted_at`) are never active graph nodes (idea.md §8).
- Living people default to `privacy_level = private`; living people are never fully exposed in public views (idea.md §15).
- The genealogy is stored as a relational graph (edges in tables), never as one big nested JSON document (idea.md §26).
- Derived kinship (sibling, cousin, uncle, grandparent) is computed from parent-child edges + unions, never stored canonically (idea.md §11).

## 4. Tech stack (pin on first use, then stay consistent)

> The backend is **TypeScript/Node**, not Go — see [ADR 0004](../docs/adr/0004-typescript-node-backend.md). idea.md §2 named Go; that technology choice is superseded. All product behavior, the schema, and the security model are unchanged.

- **Monorepo:** npm **workspaces** — `apps/*`, `services/*`, `packages/*`. Single root lockfile (`package-lock.json`, committed). Node 22 LTS target (`.nvmrc`); dev machine may run Node 24.
- **Web (`apps/web`):** Next.js (App Router) + TypeScript strict, Tailwind CSS, shadcn/ui, React Hook Form + Zod, TanStack Query, `@xyflow/react` (React Flow), `elkjs`, Auth.js, Vitest + Testing Library, Playwright.
- **API (`services/api`):** TypeScript strict, **Hono** + `@hono/node-server`; **pg** (node-postgres) pool; **Kysely** for type-safe SQL with **kysely-codegen** output committed under `services/api/src/db/generated`; **Kysely migrations** (TS files with raw `sql` DDL under `services/api/db/migrations`) applied via an `api migrate up|down|status` CLI; **Zod** validation; **pino** JSON logging; `tsx` for dev, `tsc` + `esbuild` for build.
- **Shared (`packages/shared`):** HMAC signing + canonical-payload builder, shared Zod schemas (questionnaire payload), and shared types — imported by both `apps/web` and `services/api`. Because the signing code is shared, there is **one** implementation (no cross-language parity problem); golden test vectors live here as regression tests.
- **DB:** PostgreSQL 16.
- **Infra:** Docker Compose, Caddy, GitHub Actions, Oracle Ampere A1 (`linux/arm64`), OCI Object Storage, `age` encryption, rclone. API container base `node:22-bookworm-slim` (arm64), multi-stage, non-root.

## 5. API conventions

- Internal REST endpoints under `/v1/internal/...` exactly as named in idea.md §16; JSON request/response, `camelCase` JSON fields.
- Uniform error shape: `{"error": {"code": "<machine_code>", "message": "<safe message>", "requestId": "<id>"}}`. HTTP: 400 validation, 401 auth, 403 role, 404, 409 conflict/idempotency mismatch, 422 domain rule (e.g. `cycle_detected`), 429 rate limit, 500 generic.
- Every endpoint change updates `contracts/openapi.yaml` in the same task.
- Request correlation: BFF forwards/generates `X-Request-Id`; the API logs it and echoes it in error bodies.

## 6. Language rules

- Code, identifiers, comments, commit messages, docs: **English**.
- All user-facing UI copy (public + admin), validation messages, kinship labels, match reason descriptions: **Bulgarian** (idea.md §9, §10, §11).
- Docs whose filename ends in `-bg.md` are written in **Bulgarian** (idea.md §18: `deployment-oracle-bg.md`, `backup-and-restore-bg.md`).

## 7. Testing conventions

- Every task ships tests for what it builds; §23 of idea.md is the master checklist.
- All code is TypeScript; tests use **Vitest**. Unit tests live next to the code (`*.test.ts`). Integration tests hit real PostgreSQL (dev compose) and are separated via a dedicated Vitest project/config (`vitest.integration.config.ts`) gated on `DATABASE_URL`, run with `npm run test:integration`. E2E via Playwright (Task 37).
- Standard verification commands (referenced by tasks as "standard API/web verification"):
  - API: `cd services/api && npm run lint && npm run typecheck && npm test -- --run && npm run build` (+ `npm run test:integration` when the task touches the DB; start DB with `docker compose -f docker-compose.dev.yml up -d`).
  - Web: `cd apps/web && npm run lint && npm run typecheck && npm test -- --run && npm run build`.
  - From the repo root, `npm run -ws --if-present <script>` runs a script across all workspaces.

## 8. Environment notes

- Development machine is Windows 11 with Docker Desktop. Node and Docker are available; the Go and .NET toolchains are not used (see ADR 0004 — the corporate MSI policy also blocks new installers, so stay within npm + Docker). Run shell scripts via Git Bash or WSL. All `scripts/*.sh` target the Linux server/CI (bash + `set -euo pipefail`); keep local dev workflows runnable with plain `npm`/`docker compose` commands so Windows is not blocked.
- Local dev PostgreSQL binds only `127.0.0.1:5433` (never a public bind; prod publishes no DB port at all).
- Placeholder domains `rod.mitovski.example` / `api.rod.mitovski.example` stay placeholders in code and docs; real values live only in env vars/DNS.

## 9. Documentation upkeep

- New/changed endpoints → `contracts/openapi.yaml`.
- Schema changes → new Kysely migration (never edit an applied migration) + update `docs/data-model.md` (tables + ER diagram), then regenerate `services/api/src/db/generated` types.
- New env var → the relevant `.env.example` / `infra/oracle/env.example` + mention in `docs/architecture.md` env inventory.
- Architectural deviation from idea.md or a significant ambiguous choice → new ADR in `docs/adr/` (sequential number, format: Status / Context / Decision / Consequences).
- Keep `README.md` quickstart commands correct as the repo grows.

## 10. Never-do list (from idea.md §26)

- No pseudocode where production code is required.
- No secrets in git; no PostgreSQL exposed to the internet.
- No bypassing validation or authentication "temporarily".
- No automatic person merges.
- No storing the genealogy as one giant JSON tree.
- No opening ports 5432/8080/3000 on the VM; only 80/443 (+22 restricted).
- When choosing between a complex and a simple architecture, choose the simple one as long as security, reliability, and future extensibility are preserved.
