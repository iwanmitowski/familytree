# ADR 0004: TypeScript/Node backend instead of Go

- **Status:** Accepted (supersedes the Go backend choice in idea.md §2)
- **Date:** 2026-07-18
- **Context ref:** idea.md §2, §26; ADR 0001, ADR 0003

## Context

idea.md §2 specified a Go backend (chi, pgx, sqlc, goose). During environment setup the Go toolchain could not be installed on the development machine: the corporate MSI policy blocks the installer (winget exit 1625), and a portable SDK was not a sustainable path. Node 22/24 and the .NET SDK (8, 10) are both available and unblocked.

We chose **TypeScript/Node** for the Oracle API. The frontend and BFF are already Next.js/TypeScript, so a TypeScript backend makes the whole project a single language and enables real code sharing. This directly serves idea.md §26 ("choose the simplest architecture that preserves security, reliability, and extensibility").

## Decision

The Oracle API is a **TypeScript/Node** service. Canonical stack:

| Concern | Choice |
|---|---|
| Runtime | Node.js 22 LTS (server/prod); dev may run 24 |
| HTTP framework | **Hono** + `@hono/node-server` |
| DB driver | **pg** (node-postgres) connection pool |
| Type-safe SQL | **Kysely** query builder; **kysely-codegen** generates DB types into `services/api/src/db/generated` (committed) — the sqlc role |
| Migrations | **Kysely migrations** (TS files under `services/api/db/migrations`, raw DDL via the `sql` template) run by an `api migrate up/down/status` CLI — the goose role |
| Validation | **Zod**, shared with the frontend via `packages/shared` |
| Logging | **pino** structured JSON |
| Tests | **Vitest** (unit + integration against the dev Postgres) |
| Dev / build | `tsx` for dev; `tsc` type-check + `esbuild` bundle for prod |
| Container | `node:22-bookworm-slim`, multi-stage, non-root, `linux/arm64` |

The repository becomes an **npm workspaces** monorepo:

```text
apps/web/          Next.js app (frontend + BFF)
services/api/      Hono API (src/<domain>/, db/migrations, db/generated, tests)
packages/shared/   Shared HMAC signing, canonical-payload builder, Zod schemas, types
```

`services/api/src` keeps the domain folders from idea.md §18 (`auth`, `submissions`, `people`, `genealogy`, `matching`, `privacy`, `persistence`, `transport`).

## Consequences

**Positive**
- One language across the repo; one toolchain (already installed and unblocked).
- **The HMAC signing and canonical-payload code is shared** between the BFF and the API via `packages/shared`. The Go↔TypeScript cross-language test vectors from the original plan are no longer needed for correctness; they are kept as **golden regression tests** in `packages/shared`.
- Zod validation schemas are shared between client, BFF, and API — one source of truth for the questionnaire payload.
- Simpler CI (no Go build/cross-compile); ARM64 is a standard Node base image.

**Negative / risks**
- Node is less CPU/memory-efficient than Go on the Always Free ARM VM. Mitigated: the workload is light (family project), Hono is fast, and pooled `pg` is efficient. Acceptable.
- Type-safe SQL via Kysely is a query builder, not compiled-SQL codegen; recursive CTEs (genealogy) use raw `sql` fragments. Encapsulated in `services/api/src/genealogy` with tests.
- Long-running Node process must handle graceful shutdown and pool cleanup explicitly (implemented in the API skeleton).

## Unchanged by this ADR

- ADR 0001 (signed BFF → private API over HMAC) still holds; only the API's implementation language changes, and the signing code is now shared.
- ADR 0003 (relational graph in PostgreSQL, recursive CTEs) still holds; CTEs are executed via Kysely/`pg` instead of pgx/sqlc.
- The database schema, security model, privacy rules, and all product behavior are unchanged.
- idea.md remains the authoritative functional spec; only its **backend technology** (§2) is superseded here.
