import type { Kysely } from 'kysely';
import type { Logger } from '../logger';
import type { DB } from '../db/generated/db';
import { deleteExpiredIdempotencyKeys, deleteExpiredNonces } from './service-auth-repo';

const HOURLY_MS = 60 * 60 * 1000;

/**
 * Hourly cleanup of expired nonces and idempotency keys (idea.md §4).
 * The interval is unref'd so it never keeps the process alive; call the
 * returned stop() during graceful shutdown.
 */
export function startAuthJanitor(db: Kysely<DB>, logger: Logger, intervalMs = HOURLY_MS) {
  const run = async () => {
    try {
      const nonces = await deleteExpiredNonces(db);
      const keys = await deleteExpiredIdempotencyKeys(db);
      if (nonces > 0 || keys > 0) {
        logger.info({ nonces, idempotencyKeys: keys }, 'auth janitor pruned expired rows');
      }
    } catch (err) {
      logger.error({ err }, 'auth janitor run failed');
    }
  };

  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();

  return {
    stop: () => clearInterval(timer),
    /** Exposed for tests. */
    runOnce: run,
  };
}
