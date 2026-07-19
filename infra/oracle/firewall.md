# Firewall & network rules (Oracle)

Two layers enforce the same policy (idea.md §3): the **OCI security list**
(cloud) and the **host firewall** (UFW, from `cloud-init.yaml`). Defence in
depth — the database and the API are never reachable from the internet.

## OCI security list — ingress

| Protocol | Port | Source | Purpose |
|---|---|---|---|
| TCP | 80 | `0.0.0.0/0` | HTTP (Caddy; redirects to HTTPS / ACME) |
| TCP | 443 | `0.0.0.0/0` | HTTPS (Caddy → API) |
| TCP | 22 | `<ADMIN_IP>/32` | SSH, administrator only |

Egress: allow all (needed for TLS issuance, image pulls, backups to object storage).

## Never opened

```text
5432   PostgreSQL   — internal Docker network only
8080   Go/Node API  — reachable only from Caddy on the internal network
3000   (dev)        — never in production
```

Only Caddy publishes host ports (`80`, `443`). In
`docker-compose.prod.yml` the `postgres` and `api` services declare **no**
`ports:` mapping, and the `internal` network is marked `internal: true`.

## Host firewall (UFW)

`cloud-init.yaml` applies:

```sh
ufw default deny incoming
ufw default allow outgoing
ufw allow from <ADMIN_IP> to any port 22 proto tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

## Verification

After deploy, confirm nothing sensitive is listening on a public interface:

```sh
# Only 80/443 (caddy) should be bound on 0.0.0.0; never 5432/8080.
sudo ss -tlnp | grep -E '0.0.0.0|:::' 

# No published port for postgres/api.
docker compose -f docker-compose.prod.yml ps --format '{{.Service}} {{.Ports}}'

# UFW status.
sudo ufw status verbose
```

Expected: `caddy` shows `0.0.0.0:80->…, 0.0.0.0:443->…`; `postgres` and `api`
show no `->` host mapping.
