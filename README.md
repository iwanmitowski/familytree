# Родословно дърво „Митовски“ · Mitovski Family Tree

**BG:** Некомерсиално семейно и историческо приложение за събиране, проверка, структуриране и визуализиране на информация за хора с фамилия Митовски и техните роднини. Роднините попълват въпросник на български без регистрация; администратор проверява данните и изгражда потвърдено родословно дърво.

**EN:** A non-commercial family-history application for collecting, verifying, structuring, and visualizing information about people named Mitovski and their relatives. Relatives fill in a Bulgarian questionnaire without registration; an administrator reviews the data and builds a confirmed genealogy graph.

## Architecture

```text
Browser
  → Vercel Next.js (frontend + BFF)
  → Vercel Route Handler
  → Oracle API over HTTPS  (Go, linux/arm64, Ampere A1)
  → PostgreSQL
```

- **Frontend + BFF:** Next.js (App Router) + TypeScript on Vercel. The browser never talks to the Oracle API directly.
- **Backend:** TypeScript/Node API (Hono, pg, Kysely) behind a Caddy reverse proxy on an Oracle Always Free ARM64 VM. All business endpoints require HMAC-signed service requests. (idea.md named Go; superseded — see [ADR 0004](docs/adr/0004-typescript-node-backend.md).)
- **Database:** PostgreSQL 16 in Docker, reachable only on a private Docker network — never exposed to the internet.
- **Data model:** three layers — immutable submissions → staging/candidate records → canonical confirmed genealogy graph. Only an admin promotes data between layers.

## Repository layout

```text
apps/web/        Next.js application (frontend + BFF)
services/api/    TypeScript/Node API (Hono; src/<domain>, db/migrations, src/db/generated, tests)
packages/shared/ Shared HMAC signing + canonical payload + Zod schemas/types (BFF + API)
contracts/       OpenAPI spec and cross-service contracts (e.g. HMAC signing)
infra/oracle/    Production Docker Compose, Caddyfile, cloud-init, firewall notes
scripts/         Deploy, backup/restore, export scripts (target Linux/CI)
docs/            Architecture, data model, security, deployment (docs/adr/ for decisions)
.github/         CI/CD workflows
```

## Planning & execution

- [`idea.md`](idea.md) — the authoritative functional specification (Bulgarian).
- [`PLAN.md`](PLAN.md) — implementation plan, task list, and how tasks are executed one at a time.
- [`PROGRESS.md`](PROGRESS.md) — live status of every task.
- [`tasks/`](tasks/) — individual task prompts; [`tasks/00-CONVENTIONS.md`](tasks/00-CONVENTIONS.md) is the standing contract.
- [`docs/`](docs/) — design documentation (added in Task 02+).

## Quickstart

> Prerequisites: Docker Desktop, Node 22+ LTS.

```text
# Install workspace deps (once, at the repo root)
npm install

# Backend + local database
docker compose -f docker-compose.dev.yml up -d
cp services/api/.env.example services/api/.env
npm run migrate:up -w @familytree/api
npm run dev -w @familytree/api        # serves http://127.0.0.1:8080 (/health, /ready)

# Checks (run from the root)
npm run lint && npm run typecheck && npm test
npm run test:integration -w @familytree/api   # needs the dev DB from compose

# Frontend (Next.js on http://localhost:3000)
npm run dev -w @familytree/web
```

The frontend uses Next.js (App Router) + Tailwind CSS v4 + shadcn/ui, Bulgarian
locale (`lang="bg"`), TanStack Query, and shares HMAC/validation code with the
API via `@familytree/shared`.

## License

Private family project. Not licensed for redistribution.
