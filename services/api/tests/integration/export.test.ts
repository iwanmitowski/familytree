import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { insertPerson, insertPersonName, insertPersonEvent } from '../../src/people/repo';
import { fetchExportData } from '../../src/export/data';
import { toGedcom, toJsonExport } from '../../src/export/formats';
import { normalize } from '../../src/names';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

describe.skipIf(!testDatabaseUrl())('data export', () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = createTestDb();
    await migrateToLatest(ctx.migrator);
  });

  afterAll(async () => {
    await ctx.destroy();
  });

  it('the public export drops living people; the full export includes them', async () => {
    const marker = `Експорт${Date.now()}`;
    const deceased = await insertPerson(ctx.db, { living_status: 'deceased', privacy_level: 'public' });
    await insertPersonName(ctx.db, { person_id: deceased.id, first_name: marker, surname: 'Покойник', normalized_name: normalize(`${marker} Покойник`), name_type: 'primary', is_preferred: true });
    await insertPersonEvent(ctx.db, { person_id: deceased.id, event_type: 'birth', year_from: 1940, year_to: 1940, date_precision: 'year' });

    const living = await insertPerson(ctx.db, { living_status: 'living', privacy_level: 'private' });
    await insertPersonName(ctx.db, { person_id: living.id, first_name: `${marker}Жив`, surname: 'Живков', normalized_name: normalize(`${marker}Жив Живков`), name_type: 'primary', is_preferred: true });

    const full = await fetchExportData(ctx.db, false);
    expect(full.people.map((p) => p.id)).toEqual(expect.arrayContaining([deceased.id, living.id]));

    const pub = await fetchExportData(ctx.db, true);
    expect(pub.people.map((p) => p.id)).toContain(deceased.id);
    expect(pub.people.map((p) => p.id)).not.toContain(living.id);

    // The public GEDCOM never contains the living person's name.
    const ged = toGedcom(pub);
    expect(ged).toContain(marker);
    expect(ged).not.toContain(`${marker}Жив`);

    // JSON re-import shape.
    const json = JSON.parse(toJsonExport(pub)) as { exportVersion: number };
    expect(json.exportVersion).toBe(1);
  });
});
