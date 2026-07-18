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
- **Backend:** Go API (chi, pgx, sqlc) behind a Caddy reverse proxy on an Oracle Always Free ARM64 VM. All business endpoints require HMAC-signed service requests.
- **Database:** PostgreSQL 16 in Docker, reachable only on a private Docker network — never exposed to the internet.
- **Data model:** three layers — immutable submissions → staging/candidate records → canonical confirmed genealogy graph. Only an admin promotes data between layers.

## Repository layout

```text
apps/web/        Next.js application (frontend + BFF)
services/api/    Go API service (cmd, internal packages, db migrations/queries/generated)
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

> Filled in as the stack lands. Prerequisites: Docker Desktop, Node 22 LTS, Go 1.23+.

```text
# Backend + local database (added in Task 04)
docker compose -f docker-compose.dev.yml up -d
cd services/api && make migrate-up && make run

# Frontend (added in Task 08)
cd apps/web && npm install && npm run dev
```

## License

Private family project. Not licensed for redistribution.
