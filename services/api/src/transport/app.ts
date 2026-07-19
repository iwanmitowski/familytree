import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { Logger } from '../logger';
import { writeError, type AppEnv } from './http';
import { hmacAuth, type HmacAuthConfig } from '../auth/hmac';

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
}

export function createApp({ logger, ping, hmac }: AppDeps) {
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

  // Reveals nothing about versions, hosts, or infrastructure (idea.md §4).
  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.get('/ready', async (c) => {
    const ok = await ping().catch(() => false);
    return c.json({ status: ok ? 'ok' : 'unavailable' }, ok ? 200 : 503);
  });

  return app;
}
