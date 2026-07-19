import 'dotenv/config';
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { Migrator, type MigrationProvider } from 'kysely/migration';
import { migrations } from '../../db/migrations/index';
import { loadConfig } from '../config';

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations() {
    return migrations;
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'up' && command !== 'down' && command !== 'status') {
    console.error('Usage: migrate up|down|status');
    process.exit(2);
  }

  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 2 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the migrator runs against whatever schema exists
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) });
  const migrator = new Migrator({ db, provider: new StaticMigrationProvider() });

  try {
    if (command === 'status') {
      const all = await migrator.getMigrations();
      for (const m of all) {
        console.log(`${m.executedAt ? 'applied' : 'pending'}  ${m.name}`);
      }
      const pending = all.filter((m) => !m.executedAt).length;
      console.log(`${all.length} migration(s), ${pending} pending`);
      return;
    }

    const { error, results } =
      command === 'up' ? await migrator.migrateToLatest() : await migrator.migrateDown();

    for (const r of results ?? []) {
      console.log(`${r.status}  ${r.migrationName}`);
    }
    if (error) {
      console.error('Migration failed:', error);
      process.exitCode = 1;
    }
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
