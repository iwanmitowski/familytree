import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { createApp } from '../../src/transport/app';
import { insertPerson, insertPersonEvent, insertPersonName } from '../../src/people/repo';
import { insertParentChild, insertFamilyUnion, insertUnionPartner } from '../../src/genealogy/repo';
import { mergePerson, resolvePersonId } from '../../src/people/merge';
import { searchPeople } from '../../src/people/service';
import { normalize } from '../../src/names';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('person merge', () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = createTestDb();
    await migrateToLatest(ctx.migrator);
    createApp({ logger, db: ctx.db, ping: async () => true });
  });

  afterAll(async () => {
    await ctx.destroy();
  });

  async function personWithName(first: string, surname: string): Promise<string> {
    const p = await insertPerson(ctx.db, { living_status: 'deceased' });
    await insertPersonName(ctx.db, {
      person_id: p.id,
      first_name: first,
      surname,
      normalized_name: normalize(`${first} ${surname}`),
      name_type: 'primary',
      is_preferred: true,
    });
    return p.id;
  }

  it('merges a duplicate into the target, re-pointing everything and flagging the source', async () => {
    const a = await personWithName('Иван', 'Митовски');
    const b = await personWithName('Йоан', 'Митовски');
    const child = (await insertPerson(ctx.db, { living_status: 'unknown' })).id;
    const spouse = (await insertPerson(ctx.db, { living_status: 'unknown' })).id;

    await insertPersonEvent(ctx.db, { person_id: b, event_type: 'birth', year_from: 1950, year_to: 1950, date_precision: 'year' });
    await insertParentChild(ctx.db, { parent_id: b, child_id: child, verification_status: 'confirmed' });
    const union = await insertFamilyUnion(ctx.db, { union_type: 'marriage' });
    await insertUnionPartner(ctx.db, { union_id: union.id, person_id: b });
    await insertUnionPartner(ctx.db, { union_id: union.id, person_id: spouse });

    const result = await mergePerson(ctx.db, b, a, 'дубликат', 'admin@example.com');
    expect(result.ok).toBe(true);

    // A now owns B's variant name as a non-preferred alias.
    const aliasNames = await ctx.db.selectFrom('person_names').selectAll().where('person_id', '=', a).execute();
    expect(aliasNames.some((n) => n.normalized_name === normalize('Йоан Митовски') && n.name_type === 'alias')).toBe(true);

    // B's birth event moved to A.
    const events = await ctx.db.selectFrom('person_events').selectAll().where('person_id', '=', a).execute();
    expect(events.some((e) => e.event_type === 'birth' && e.year_from === 1950)).toBe(true);

    // The child edge now points from A.
    const edges = await ctx.db.selectFrom('parent_child_relationships').selectAll().where('parent_id', '=', a).execute();
    expect(edges.some((e) => e.child_id === child)).toBe(true);

    // The union partner is A, not B.
    const partners = await ctx.db.selectFrom('union_partners').selectAll().where('union_id', '=', union.id).execute();
    expect(partners.map((p) => p.person_id).sort()).toEqual([a, spouse].sort());

    // B is merged + deleted and no longer found in search.
    const bRow = await ctx.db.selectFrom('people').selectAll().where('id', '=', b).executeTakeFirstOrThrow();
    expect(bRow.merged_into_person_id).toBe(a);
    expect(bRow.deleted_at).not.toBeNull();
    const found = await searchPeople(ctx.db, 'Йоан Митовски');
    expect(found.items.map((p) => p.id)).not.toContain(b);

    // Merge history captured B's snapshot.
    const history = await ctx.db.selectFrom('person_merge_history').selectAll().where('source_person_id', '=', b).executeTakeFirstOrThrow();
    expect(history.target_person_id).toBe(a);
    expect((history.snapshot as { person: { id: string } }).person.id).toBe(b);
  });

  it('resolvePersonId follows one merged hop', async () => {
    const a = await personWithName('Мария', 'Иванова');
    const b = await personWithName('Мари', 'Иванова');
    await mergePerson(ctx.db, b, a, 'дубликат', 'admin');
    expect(await resolvePersonId(ctx.db, b)).toBe(a);
    expect(await resolvePersonId(ctx.db, a)).toBe(a);
  });

  it('aborts a merge that would create a self-edge, leaving the DB unchanged', async () => {
    const a = await personWithName('Петър', 'Иванов');
    const b = await personWithName('Петро', 'Иванов');
    // B is the parent of A; merging B→A would make A its own parent.
    await insertParentChild(ctx.db, { parent_id: b, child_id: a, verification_status: 'confirmed' });

    const result = await mergePerson(ctx.db, b, a, 'дубликат', 'admin');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('invalid');

    // Atomic rollback: B is still active and the edge is intact.
    const bRow = await ctx.db.selectFrom('people').selectAll().where('id', '=', b).executeTakeFirstOrThrow();
    expect(bRow.merged_into_person_id).toBeNull();
    expect(bRow.deleted_at).toBeNull();
    const edge = await ctx.db.selectFrom('parent_child_relationships').selectAll().where('parent_id', '=', b).where('child_id', '=', a).executeTakeFirst();
    expect(edge).toBeDefined();
  });

  it('aborts a merge that would create an ancestry cycle', async () => {
    const a = await personWithName('Ана', 'Ц');
    const b = await personWithName('Ани', 'Ц');
    const x = (await insertPerson(ctx.db, { living_status: 'unknown' })).id;
    // A → X (A parent of X), and X → B (X parent of B). Merging B→A makes X→A,
    // producing A→X→A.
    await insertParentChild(ctx.db, { parent_id: a, child_id: x, verification_status: 'confirmed' });
    await insertParentChild(ctx.db, { parent_id: x, child_id: b, verification_status: 'confirmed' });

    const result = await mergePerson(ctx.db, b, a, 'дубликат', 'admin');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('conflict');
    const bRow = await ctx.db.selectFrom('people').selectAll().where('id', '=', b).executeTakeFirstOrThrow();
    expect(bRow.merged_into_person_id).toBeNull();
  });

  it('rejects merging an already-merged source', async () => {
    const a = await personWithName('Стоян', 'П');
    const b = await personWithName('Стойо', 'П');
    expect((await mergePerson(ctx.db, b, a, 'r', 'admin')).ok).toBe(true);
    const second = await mergePerson(ctx.db, b, a, 'r', 'admin');
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.kind).toBe('conflict');
  });

  it('rejects merging a person into itself', async () => {
    const a = await personWithName('Т', 'Т');
    const res = await mergePerson(ctx.db, a, a, 'r', 'admin');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.kind).toBe('invalid');
  });
});
