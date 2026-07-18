# Task 36: Monitoring, metrics, correlation, disk alerts

**Depends on:** 16 · **Size:** M · **Spec:** idea.md §22 (entire list), §17.10 (correlation ID)

## Goal
Economical observability: Prometheus metrics on the internal network, correlated logs across Vercel and Oracle, abuse counters, backup status surfaced, and disk alerts.

## Requirements
1. Go metrics (`prometheus/client_golang`), endpoint `GET /metrics` bound so it is reachable **only** on the internal Docker network (not routed by Caddy, not HMAC-exempt from outside — verify Caddyfile has no route to it):
   - HTTP: request counter + duration histogram labelled `{route, method, status}` (chi route pattern, not raw path — bounded cardinality);
   - DB: pgxpool stats gauges (acquired/idle/max), query duration histogram via a pgx tracer;
   - Business counters (idea.md §22): `submissions_created_total`, `hmac_failures_total`, `turnstile_rejections_total`, `rate_limit_hits_total`, `spam_flagged_total`;
   - Backup: a small file-reader gauge exposing `backup_last_success_timestamp` from Task 33's `backup-status.json` (mounted read-only into the api container).
2. Turnstile rejections happen in the BFF: add `POST /v1/internal/abuse-events` `{kind: turnstile_rejected|honeypot|too_fast|rate_limited_bff}` (service auth, no payload details) — the BFF fires it on those events; Go counts + audit-logs them (idea.md §6 „audit записи за подозрителни заявки").
3. Correlation (idea.md §17.10, §22): verify end-to-end that the BFF's `X-Request-Id` is logged by both sides and returned in error bodies; add a BFF log line `{requestId, route, status, durationMs}` per proxied call (no payloads — idea.md §22 „Не логвай questionnaire payload").
4. Host disk alerts (idea.md §22): `scripts/check-disk.sh` — `df` on the data mount + docker volume usage; over threshold (default 80%) → POST `NOTIFY_WEBHOOK_URL` + non-zero exit; cron entry (daily) added to `infra/oracle/cron.d/familytree`.
5. Log-hygiene audit: grep the codebase for payload/body logging; assert log statements at request level contain only metadata; fix any violations found.
6. Docs: „Monitoring" section in `docs/architecture.md` (what exists, how to scrape locally, what to check weekly) + weekly-check list appended to `docs/deployment-oracle-bg.md` (Bulgarian).

## Acceptance criteria
- `/metrics` returns all series locally; a submission increments its counter; an invalid-HMAC request increments failures; `/metrics` is not reachable through Caddy config; disk script alerts correctly on a simulated 90% (`df` output injected via test hook).

## Verification
- Unit tests: metrics registration, abuse-event endpoint, disk-script threshold logic (bash test with fake `df`); integration: counter increments on real requests.
- Standard Go verification; `shellcheck scripts/check-disk.sh`.
- Commit as `task-36: monitoring and alerts`.
