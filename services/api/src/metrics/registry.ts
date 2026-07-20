import { readFileSync } from 'node:fs';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type pg from 'pg';

/**
 * Prometheus metrics (idea.md §22). Exposed on /metrics, which is reachable only
 * on the internal Docker network (never routed by Caddy). Business counters use
 * bounded labels; request metrics use the route pattern, not the raw path.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequests = new Counter({
  name: 'http_requests_total',
  help: 'HTTP requests by route, method, status',
  labelNames: ['route', 'method', 'status'],
  registers: [registry],
});

export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['route', 'method', 'status'],
  buckets: [0.005, 0.02, 0.05, 0.1, 0.3, 1, 3],
  registers: [registry],
});

export const submissionsCreated = new Counter({
  name: 'submissions_created_total',
  help: 'Submissions stored',
  registers: [registry],
});
export const hmacFailures = new Counter({
  name: 'hmac_failures_total',
  help: 'Rejected HMAC requests',
  registers: [registry],
});
export const turnstileRejections = new Counter({
  name: 'turnstile_rejections_total',
  help: 'Turnstile rejections reported by the BFF',
  registers: [registry],
});
export const rateLimitHits = new Counter({
  name: 'rate_limit_hits_total',
  help: 'Rate-limit rejections',
  registers: [registry],
});
export const spamFlagged = new Counter({
  name: 'spam_flagged_total',
  help: 'Submissions flagged as spam',
  registers: [registry],
});

let backupStatusPath: string | undefined;

new Gauge({
  name: 'backup_last_success_timestamp',
  help: 'Unix seconds of the last successful backup',
  registers: [registry],
  // Read backup-status.json (mounted read-only) on each scrape, if present.
  collect() {
    if (!backupStatusPath) return;
    try {
      const status = JSON.parse(readFileSync(backupStatusPath, 'utf8')) as { result?: string; timestamp?: string };
      if (status.result === 'success' && status.timestamp) {
        this.set(Math.floor(new Date(status.timestamp).getTime() / 1000));
      }
    } catch {
      // No status file yet — leave the gauge unset.
    }
  },
});

/** Binds pg pool gauges (read lazily on scrape). */
export function bindPoolMetrics(pool: pg.Pool): void {
  new Gauge({ name: 'db_pool_total', help: 'Total pool clients', registers: [registry], collect() { this.set(pool.totalCount); } });
  new Gauge({ name: 'db_pool_idle', help: 'Idle pool clients', registers: [registry], collect() { this.set(pool.idleCount); } });
  new Gauge({ name: 'db_pool_waiting', help: 'Waiting pool requests', registers: [registry], collect() { this.set(pool.waitingCount); } });
}

/** Points the backup gauge at the status file path (read on each scrape). */
export function bindBackupMetric(statusPath: string): void {
  backupStatusPath = statusPath;
}

export function metricsText(): Promise<string> {
  return registry.metrics();
}
