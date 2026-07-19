import type { Migration } from 'kysely/migration';

/**
 * Static migration registry. Registered migrations are bundled into the
 * production image, so `node dist/db/migrate.js up` works without shipping
 * loose .ts files (see Task 10).
 *
 * Adding a migration (Task 05+):
 *   1. Create `NNNN_name.ts` next to this file exporting `up(db)` / `down(db)`.
 *   2. Import it below and add it to the record, keyed by its file name
 *      (sortable, zero-padded):
 *
 *        import * as m0002 from './0002_canonical_tables';
 *        export const migrations: Record<string, Migration> = {
 *          ...,
 *          '0002_canonical_tables': m0002,
 *        };
 */
import * as m0001 from './0001_staging_tables';
import * as m0002 from './0002_canonical_tables';

export const migrations: Record<string, Migration> = {
  '0001_staging_tables': m0001,
  '0002_canonical_tables': m0002,
};
