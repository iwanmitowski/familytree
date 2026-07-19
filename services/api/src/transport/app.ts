import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Logger } from '../logger';

export type AppEnv = { Variables: { requestId: string } };

export interface AppDeps {
  logger: Logger;
  /** Resolves true when the database answers; must not throw for a plain "down". */
  ping: () => Promise<boolean>;
}

export function writeError(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
) {
  return c.json({ error: { code, message, requestId: c.get('requestId') } }, status);
}

export function createApp({ logger, ping }: AppDeps) {
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

  // Reveals nothing about versions, hosts, or infrastructure (idea.md §4).
  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.get('/ready', async (c) => {
    const ok = await ping().catch(() => false);
    return c.json({ status: ok ? 'ok' : 'unavailable' }, ok ? 200 : 503);
  });

  return app;
}
