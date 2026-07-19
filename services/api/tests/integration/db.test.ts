import { describe, expect, it } from 'vitest';
import { createPool, ping } from '../../src/persistence/db';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('database connectivity', () => {
  it('pings the dev database', async () => {
    const pool = createPool(databaseUrl!);
    try {
      await expect(ping(pool)).resolves.toBe(true);
    } finally {
      await pool.end();
    }
  });
});
