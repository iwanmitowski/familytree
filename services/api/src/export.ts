import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { DB } from './db/generated/db';
import { loadConfig } from './config';
import { fetchExportData } from './export/data';
import { toCsvPeople, toCsvRelationships, toGedcom, toJsonExport } from './export/formats';

/**
 * Data export CLI (idea.md §21). Usage:
 *   node dist/export.js gedcom|json|csv-people|csv-relationships --out <path> [--public]
 */
async function main(): Promise<void> {
  const [, , format, ...rest] = process.argv;
  const outIdx = rest.indexOf('--out');
  const outPath = outIdx >= 0 ? rest[outIdx + 1] : undefined;
  const publicOnly = rest.includes('--public');

  if (!format || !outPath) {
    console.error('Usage: export <gedcom|json|csv-people|csv-relationships> --out <path> [--public]');
    process.exit(2);
  }

  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 2 });
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

  try {
    const data = await fetchExportData(db, publicOnly);
    const content =
      format === 'gedcom'
        ? toGedcom(data)
        : format === 'json'
          ? toJsonExport(data)
          : format === 'csv-people'
            ? toCsvPeople(data)
            : format === 'csv-relationships'
              ? toCsvRelationships(data)
              : null;
    if (content === null) {
      console.error(`Unknown format: ${format}`);
      process.exit(2);
    }
    writeFileSync(outPath, content, 'utf8');
    console.log(`Wrote ${format} (${publicOnly ? 'public' : 'full'}) to ${outPath}`);
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
