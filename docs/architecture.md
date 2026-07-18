# Architecture

Authoritative functional spec: [`idea.md`](../idea.md). This document explains **how** the system is put together and **why**. On any conflict, `idea.md` wins.

## 1. Overview

The Mitovski family tree is a non-commercial application for collecting, verifying, structuring, and visualizing genealogical information. Relatives fill in a Bulgarian questionnaire without registration; an administrator reviews every submission and curates a canonical genealogy graph that is then visualized as an interactive tree.

Two deployment targets:

- **Vercel** hosts the Next.js application, which is both the **frontend** (public questionnaire, public tree, admin console) and the **Backend-for-Frontend (BFF)**.
- **Oracle Cloud Always Free (Ampere A1, `linux/arm64`)** hosts the TypeScript/Node API, PostgreSQL, and a Caddy reverse proxy, all in Docker.

> **Backend technology:** idea.md §2 specified Go; that choice is superseded — the API is TypeScript/Node (Hono + pg + Kysely). See [ADR 0004](adr/0004-typescript-node-backend.md). The repo is an npm-workspaces monorepo (`apps/*`, `services/*`, `packages/*`) so the HMAC signing and Zod schemas are shared code.

The browser never talks to the Oracle API directly (idea.md §2).

## 2. Request flow

```text
Browser
  → Vercel Next.js (frontend + BFF)
  → Vercel Route Handler   (validate, verify Turnstile, fingerprint, HMAC-sign)
  → Oracle: Caddy (TLS 443)
  → TypeScript/Node API (Hono, pg, Kysely; HMAC verification, authorization from signed actor)
  → PostgreSQL (private Docker network only)
```

Every hop narrows trust: the browser is untrusted; the BFF authenticates admins and signs service requests; the API verifies signatures and enforces authorization; PostgreSQL is reachable only inside the Docker network.

## 3. Components

### 3.1 Frontend + BFF (Vercel, Next.js App Router, TypeScript)

- Public questionnaire (multi-step, Bulgarian, mobile-first), public tree, and the admin console.
- **BFF Route Handlers** are the only thing that talks to the Oracle API. They validate input (Zod), verify Cloudflare Turnstile server-side, compute the client fingerprint, add an idempotency key, HMAC-sign the request, normalize errors, and attach a correlation ID (idea.md §17).
- Admin authentication via Auth.js (OAuth provider + email allowlist). The Oracle API never sees the OAuth session — the BFF translates a valid admin session into a signed request carrying `actorId`/`actorRole` (idea.md §5).
- UI stack: Tailwind CSS, shadcn/ui, React Hook Form + Zod, TanStack Query, React Flow + ELK.js for the tree.

### 3.2 Backend (Oracle, TypeScript/Node)

- Hono HTTP framework on `@hono/node-server`; `pg` connection pool; Kysely for type-safe SQL (raw `sql` for recursive CTEs); Kysely migrations run via an `api migrate` CLI.
- Structured JSON logging (pino), graceful shutdown, `GET /health` and `GET /ready` (idea.md §2).
- All `/v1/internal/*` business endpoints require a valid HMAC service signature; authorization is derived from the **signed** actor role (idea.md §4, §5).
- Runs on `linux/arm64` (Ampere A1) via a `node:22-bookworm-slim` image.
- The HMAC verification and canonical-payload code comes from `packages/shared` — the same module the BFF uses to sign, so signing and verification cannot drift.

### 3.3 Database (Oracle, PostgreSQL 16 in Docker)

- Private Docker network only; **no** published host port `5432`; persistent named volume; UTF-8; `TIMESTAMPTZ` timestamps.
- A dedicated, non-superuser application role; the app never connects as `postgres` (idea.md §2).

### 3.4 Reverse proxy (Oracle, Caddy)

- Listens on 80/443, manages TLS certificates automatically, reverse-proxies to the API, adds security headers, enforces timeouts and body-size limits, and never exposes internal service ports (idea.md §2).

## 4. Network scheme (idea.md §3)

Placeholder domains (real values live only in DNS/env, never in code):

```text
APP_DOMAIN = rod.mitovski.example        → Vercel
API_DOMAIN = api.rod.mitovski.example    → Oracle reserved public IP
```

Oracle ingress (security list + host firewall via UFW/nftables, identical rules):

```text
TCP 80   from 0.0.0.0/0
TCP 443  from 0.0.0.0/0
TCP 22   from the administrator IP only
```

Never opened: `5432`, `8080`, `3000`. PostgreSQL listens only on the Docker network; the API is reachable only from Caddy on the Docker network.

```text
public network:    caddy
internal network:  caddy · api · postgres
```

## 5. Authentication & authorization

### 5.1 Public users (idea.md §5)
No registration, no accounts. They may fill the questionnaire and optionally use an invitation token. They can never edit the tree directly.

### 5.2 Administrator (idea.md §5)
Auth.js in the Next.js app with an OAuth provider (Google) and an email allowlist; secure HttpOnly session cookies, SameSite, CSRF protection, short session lifetime, role `admin`. The Oracle API does not validate the OAuth session; it trusts the actor role **only because it is inside the HMAC signature**.

### 5.3 Service authentication (BFF → Oracle, idea.md §4)
HMAC-SHA256 over a canonical payload. See [`security.md`](security.md) and [`../contracts/hmac.md`](../contracts/hmac.md) (added in Task 07) for the exact scheme. Checks: known service id, timestamp within ±5 min, unused nonce, constant-time signature comparison, idempotency key, and actor headers trusted only when signed. Only `GET /health` is exempt.

## 6. Data layers (idea.md §7)

```text
Original submission  (immutable)
        ↓
Candidate / staging records
        ↓
Canonical confirmed genealogy graph
```

A questionnaire submission is **never** written directly as a confirmed person or relationship. The original payload is immutable; processing creates separate candidate records; only an admin promotes data to the canonical graph (create person, link to existing, confirm relationship, reject, merge, mark conflict, change privacy). Details in [`data-model.md`](data-model.md).

## 7. Anti-abuse (idea.md §6)

Cloudflare Turnstile on final submit (verified server-side in the BFF), honeypot field, minimum fill time, max payload size, server-side Zod validation, idempotency keys, rate limiting, invite-token limits, max field lengths, no HTML in plain-text fields, and audit entries for suspicious requests. The client IP is used only to derive an HMAC fingerprint (`clientFingerprint = HMAC-SHA256(IP_HASH_SECRET, normalizedIp)`); the raw IP is never stored or forwarded. See [`security.md`](security.md).

## 8. Privacy (idea.md §15)

Living people default to `privacy_level = private`. Public projections of living people are reduced to a masked label and a birth decade at most; email, phone, exact dates, addresses, precise locations, documents, notes, and internal source details are never exposed publicly. A single `PersonRedactionService` centralizes this logic (Task 30).

## 9. Repository structure

See [`../README.md`](../README.md) and idea.md §18. npm-workspaces monorepo: `apps/web` (Next.js), `services/api` (TypeScript/Node), `packages/shared` (HMAC + Zod), `contracts` (OpenAPI + HMAC), `infra/oracle` (Compose, Caddy, cloud-init), `scripts`, `docs`.

## 10. Environment variable inventory

Names and purpose only — values live in Vercel project settings, the Oracle `.env` file, and GitHub Actions secrets. No secret is ever committed, and no secret is prefixed `NEXT_PUBLIC_` (idea.md §17).

### 10.1 Vercel / web (idea.md §17, §20)

| Variable | Purpose | Public? |
|---|---|---|
| `ORACLE_API_BASE_URL` | Base URL of the Oracle API (`https://api.rod.mitovski.example`) | server |
| `SERVICE_ID` | Service identity sent as `X-Service-Id` | server |
| `SERVICE_HMAC_SECRET` | Shared secret for request signing | server, secret |
| `IP_HASH_SECRET` | Key for the client-IP fingerprint HMAC | server, secret |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile **site** key (safe to expose) | public |
| `TURNSTILE_SECRET_KEY` | Turnstile server-side verification key | server, secret |
| `AUTH_SECRET` | Auth.js session/JWT signing | server, secret |
| `ADMIN_EMAIL_ALLOWLIST` | Comma-separated admin emails | server |
| `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` | OAuth provider credentials | server, secret |

### 10.2 Oracle / API (idea.md §2, §20)

| Variable | Purpose |
|---|---|
| `PORT` | API listen port (internal, default 8080) |
| `DATABASE_URL` | App-role connection string (non-superuser) |
| `LOG_LEVEL`, `ENV` | Logging + environment mode |
| `SERVICE_ID`, `SERVICE_HMAC_SECRET` | Must match the Vercel values |
| `POSTGRES_*`, `APP_DB_USER`, `APP_DB_PASSWORD` | Database provisioning + app role |
| `API_DOMAIN` | Caddy site / TLS |
| `AGE_RECIPIENT`, rclone remotes, `NOTIFY_WEBHOOK_URL` | Backups (Task 33) |

### 10.3 GitHub Actions (Task 35)

`DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_KEY`, and (if needed) a container-registry token. Deploy workflows skip gracefully without them.

## 11. Design principle

When choosing between a complex and a simple architecture, choose the simple one as long as security, reliability, and future extensibility are preserved (idea.md §26). Significant or ambiguous decisions are recorded as ADRs in [`adr/`](adr/).
