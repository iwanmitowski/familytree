import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { DB } from '../db/generated/db';

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export function createDb(pool: pg.Pool): Kysely<DB> {
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

export async function ping(pool: pg.Pool): Promise<boolean> {
  await pool.query('SELECT 1');
  return true;
}
