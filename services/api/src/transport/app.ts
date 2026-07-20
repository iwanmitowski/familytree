import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { Kysely } from 'kysely';
import type { Logger } from '../logger';
import type { DB } from '../db/generated/db';
import { writeError, type AppEnv } from './http';
import { hmacAuth, type HmacAuthConfig } from '../auth/hmac';
import { registerInviteRoutes } from '../invites/routes';
import { registerSubmissionRoutes } from '../submissions/routes';
import { registerMatchingRoutes } from '../matching/routes';

export type { AppEnv } from './http';
export { writeError } from './http';

export interface AppDeps {
  logger: Logger;
  /** Resolves true when the database answers; must not throw for a plain "down". */
  ping: () => Promise<boolean>;
  /**
   * HMAC service auth for everything under /v1/internal/*. Optional so pure
   * transport tests can run without it; production always provides it.
   */
  hmac?: HmacAuthConfig;
  /** Database handle for the business routes. Optional for pure-transport tests. */
  db?: Kysely<DB>;
}

/** Shared dependencies passed to every route module. */
export interface RouteDeps {
  db: Kysely<DB>;
  logger: Logger;
}

export function createApp({ logger, ping, hmac, db }: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const requestId = c.req.header('x-request-id') ?? randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-Id', requestId);
    const start = performance.now();
    await next();
    // Metadata only — request/response bodies are never logged.
    logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - start),
        requestId,
      },
      'request',
    );
  });

  app.onError((err, c) => {
    logger.error(
      { err: { message: err.message, stack: err.stack }, requestId: c.get('requestId') },
      'unhandled error',
    );
    return writeError(c, 500, 'internal_error', 'Internal server error');
  });

  app.notFound((c) => writeError(c, 404, 'not_found', 'Not found'));

  // Every business endpoint requires a valid HMAC signature (idea.md §4).
  if (hmac) {
    app.use('/v1/internal/*', hmacAuth(hmac, logger));
  }

  // Business routes under /v1/internal (auth already applied above).
  if (db) {
    const deps: RouteDeps = { db, logger };
    registerInviteRoutes(app, deps);
    registerSubmissionRoutes(app, deps);
    registerMatchingRoutes(app, deps);
  }

  // Reveals nothing about versions, hosts, or infrastructure (idea.md §4).
  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.get('/ready', async (c) => {
    const ok = await ping().catch(() => false);
    return c.json({ status: ok ? 'ok' : 'unavailable' }, ok ? 200 : 503);
  });

  return app;
}
