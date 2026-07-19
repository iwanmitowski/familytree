import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { Migrator, NO_MIGRATIONS, type MigrationProvider } from 'kysely/migration';
import { migrations } from '../../db/migrations/index';
import type { DB } from '../../src/db/generated/db';

/**
 * Integration tests run against the dedicated familytree_test database
 * (created by infra/dev/initdb) so they can freely migrate up/down without
 * touching familytree_dev data. Derived from DATABASE_URL by swapping the
 * database name.
 */
export function testDatabaseUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  const url = new URL(base);
  url.pathname = '/familytree_test';
  return url.toString();
}

const provider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};

export interface TestDb {
  db: Kysely<DB>;
  migrator: Migrator;
  destroy: () => Promise<void>;
}

export function createTestDb(): TestDb {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 5 });
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  const migrator = new Migrator({ db, provider });
  return { db, migrator, destroy: () => db.destroy() };
}

export async function migrateToLatest(migrator: Migrator): Promise<void> {
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}

export async function migrateToZero(migrator: Migrator): Promise<void> {
  const { error } = await migrator.migrateTo(NO_MIGRATIONS);
  if (error) throw error;
}
