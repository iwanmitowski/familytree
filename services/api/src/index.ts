import 'dotenv/config';
import { serve } from '@hono/node-server';
import { loadConfig } from './config';
import { createLogger } from './logger';
import { createApp } from './transport/app';
import { createPool, ping } from './persistence/db';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.ENV);
const pool = createPool(config.DATABASE_URL);

const app = createApp({
  logger,
  ping: () => ping(pool).catch(() => false),
});

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: '0.0.0.0' }, (info) => {
  logger.info({ port: info.port }, 'api listening');
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  const deadline = setTimeout(() => {
    logger.error('shutdown deadline exceeded, forcing exit');
    process.exit(1);
  }, 10_000);
  deadline.unref();

  // close() waits for in-flight requests to drain before invoking the callback.
  server.close((closeErr) => {
    void pool
      .end()
      .catch((poolErr: unknown) => logger.error({ err: poolErr }, 'error closing pool'))
      .finally(() => {
        if (closeErr) {
          logger.error({ err: closeErr }, 'error closing server');
          process.exit(1);
        }
        logger.info('shutdown complete');
        process.exit(0);
      });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
