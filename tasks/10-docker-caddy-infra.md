# Task 10: Production Docker Compose, Caddy, ARM64 image, Oracle infra

**Depends on:** 04 · **Size:** L · **Spec:** idea.md §2 (Database/Reverse proxy), §3, §19, §18 (infra/), §20 (Oracle side)

## Goal
Everything needed to run the stack on the Oracle VM: hardened compose file, Caddyfile, ARM64 API image, cloud-init, firewall documentation, and the first draft of the Bulgarian deployment guide.

## Requirements
1. `services/api/Dockerfile`: multi-stage — a `node:22-bookworm-slim` build stage runs `npm ci` (workspace-aware) + `npm run build` to produce `dist/`; the runtime stage is `node:22-bookworm-slim`, copies `dist/` + production `node_modules` (or an esbuild-bundled single file), runs as the non-root `node` user, targets `linux/arm64` via buildx. Container healthcheck uses Node's global `fetch` (no curl needed): `node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`.
2. `infra/oracle/docker-compose.prod.yml` (idea.md §19, all requirements):
   - services `caddy`, `api`, `postgres`; networks `public` (caddy) and `internal` (caddy+api+postgres);
   - **only caddy publishes ports (80/443)**; postgres and api have no host ports;
   - postgres:16 with named volume `pgdata`, `pg_isready` healthcheck, UTF-8 initdb args, env from `.env` (not committed);
   - initdb script `infra/oracle/initdb/01-app-user.sh`: creates a **non-superuser application role** (from env) with least privileges on the app database (idea.md §2); the API connects as this role, never as `postgres`;
   - api: `depends_on: postgres: condition: service_healthy`, healthcheck via the Node `fetch` one-liner above, `read_only: true` + `tmpfs: /tmp`, `restart: unless-stopped`, runs as the non-root `node` user;
   - one-shot `migrate` service (same api image, command `["node","dist/db/migrate.js","up"]`, profile `ops`) so migrations run safely before a new API rollout (idea.md §19);
   - logging driver options: json-file, `max-size: 10m`, `max-file: "3"` for all services;
   - optional `backup` profile placeholder (implemented in Task 33).
3. `infra/oracle/Caddyfile` (idea.md §2): site `{$API_DOMAIN}` → `reverse_proxy api:8080`; security headers (HSTS incl. subdomains, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, minimal CSP `default-src 'none'` for the API host); `request_body max_size 1MB`; sane proxy timeouts; no exposed admin endpoint; no `Server` version disclosure (`-Server` header removal).
4. `infra/oracle/cloud-init.yaml`: create deploy user with SSH key placeholder, install Docker + compose plugin, enable UFW with idea.md §3 rules (22 restricted to `ADMIN_IP` placeholder, 80, 443, default deny incoming), unattended-upgrades, create `/opt/familytree` with expected layout.
5. `infra/oracle/env.example`: all Oracle-side vars with placeholder values and Bulgarian+English comments (POSTGRES_*, APP_DB_USER/PASSWORD, DATABASE_URL, SERVICE_ID, SERVICE_HMAC_SECRET, API_DOMAIN, TZ etc.).
6. `infra/oracle/firewall.md`: OCI security-list rules table exactly per idea.md §3 (incl. the do-not-open list 5432/8080/3000), matching UFW commands, and verification steps (`ss -tlnp`, `docker ps` port check).
7. `docs/deployment-oracle-bg.md` (**Bulgarian**) first draft: VM provisioning, reserved public IP, DNS records (§3), cloud-init usage, uploading env file, first manual deploy (`docker compose --profile ops run migrate`, `docker compose up -d`), how TLS issuance works. Finalized in Task 35.

## Acceptance criteria
- `docker compose -f infra/oracle/docker-compose.prod.yml config` validates.
- `docker buildx build --platform linux/arm64 -f services/api/Dockerfile .` succeeds locally.
- Caddyfile passes `caddy validate` (run via the caddy Docker image with a dummy env).
- Grep proves no `5432` or api port is published in the prod compose.

## Verification
- Run the three commands above; document any Docker Desktop caveats in PROGRESS notes.
- Commit as `task-10: production infra (compose, caddy, arm64, cloud-init)`.
