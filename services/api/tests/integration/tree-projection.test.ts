import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { createApp } from '../../src/transport/app';
import { insertPerson, insertPersonName, insertPersonEvent } from '../../src/people/repo';
import { insertParentChild, insertFamilyUnion, insertUnionPartner } from '../../src/genealogy/repo';
import { buildTreeProjection } from '../../src/genealogy/projection';
import { normalize } from '../../src/names';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('tree projection (idea.md §13)', () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = createTestDb();
    await migrateToLatest(ctx.migrator);
    createApp({ logger, db: ctx.db, ping: async () => true });
  });

  afterAll(async () => {
    await ctx.destroy();
  });

  async function person(first: string, birthYear?: number): Promise<string> {
    const p = await insertPerson(ctx.db, { living_status: 'deceased', privacy_level: 'family' });
    await insertPersonName(ctx.db, { person_id: p.id, first_name: first, normalized_name: normalize(first), name_type: 'primary', is_preferred: true });
    if (birthYear) await insertPersonEvent(ctx.db, { person_id: p.id, event_type: 'birth', year_from: birthYear, year_to: birthYear, date_precision: 'year' });
    return p.id;
  }
  const parentOf = (parent: string, child: string, unionId?: string) =>
    insertParentChild(ctx.db, { parent_id: parent, child_id: child, family_union_id: unionId ?? null, verification_status: 'confirmed' });

  it('projects generations, union nodes, and deduplicates a shared person', async () => {
    const root = await person('Корен', 1950);
    const father = await person('Баща', 1925);
    const mother = await person('Майка', 1927);
    const child = await person('Дете', 1975);
    const grandchild = await person('Внук', 2000);

    const parentsUnion = await insertFamilyUnion(ctx.db, { union_type: 'marriage' });
    await insertUnionPartner(ctx.db, { union_id: parentsUnion.id, person_id: father });
    await insertUnionPartner(ctx.db, { union_id: parentsUnion.id, person_id: mother });
    await parentOf(father, root, parentsUnion.id);
    await parentOf(mother, root, parentsUnion.id);
    await parentOf(root, child);
    await parentOf(child, grandchild);

    const proj = (await buildTreeProjection(ctx.db, root, { ancestors: 2, descendants: 2, includePartners: true }))!;

    const genOf = (id: string) => proj.nodes.find((n) => n.id === id)?.generation;
    expect(genOf(root)).toBe(0);
    expect(genOf(father)).toBe(-1);
    expect(genOf(child)).toBe(1);
    expect(genOf(grandchild)).toBe(2);

    // Exactly one node per person id (dedup).
    const ids = proj.nodes.filter((n) => n.type === 'person').map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);

    // A union node exists with partner edges from father and mother.
    const unionNode = proj.nodes.find((n) => n.type === 'union');
    expect(unionNode).toBeDefined();
    const partnerEdges = proj.edges.filter((e) => e.type === 'partner' && e.target === unionNode!.id);
    expect(partnerEdges.map((e) => e.source).sort()).toEqual([father, mother].sort());

    // The parents' child edge routes through the union node.
    const unionChildEdge = proj.edges.find((e) => e.type === 'child' && e.source === unionNode!.id && e.target === root);
    expect(unionChildEdge).toBeDefined();

    expect(proj.truncated).toBe(false);
    expect(proj.rootPersonId).toBe(root);
  });

  it('a person reachable through two branches appears once (pedigree collapse)', async () => {
    // A marries B; both descend from a common ancestor C (cousin marriage).
    const c = await person('Общ');
    const p1 = await person('Клон1');
    const p2 = await person('Клон2');
    const a = await person('А');
    const b = await person('Б');
    const kid = await person('Дете2');
    await parentOf(c, p1);
    await parentOf(c, p2);
    await parentOf(p1, a);
    await parentOf(p2, b);
    await parentOf(a, kid);
    await parentOf(b, kid);

    const proj = (await buildTreeProjection(ctx.db, kid, { ancestors: 4, descendants: 0 }))!;
    const cNodes = proj.nodes.filter((n) => n.id === c);
    expect(cNodes).toHaveLength(1); // single node despite two ancestry paths
  });

  it('resolves a merged root to the target and 404s a deleted one', async () => {
    const target = await person('Цел');
    const merged = await insertPerson(ctx.db, { living_status: 'unknown' });
    await ctx.db.updateTable('people').set({ merged_into_person_id: target }).where('id', '=', merged.id).execute();
    const proj = await buildTreeProjection(ctx.db, merged.id, {});
    expect(proj?.rootPersonId).toBe(target);

    const deleted = await insertPerson(ctx.db, { living_status: 'unknown' });
    await ctx.db.updateTable('people').set({ deleted_at: new Date() }).where('id', '=', deleted.id).execute();
    expect(await buildTreeProjection(ctx.db, deleted.id, {})).toBeUndefined();
  });

  it('sets truncated when the node cap is exceeded', async () => {
    const root = await person('Голям корен');
    // Create a wide set of descendants beyond the cap via one generation.
    const parent = root;
    for (let i = 0; i < 405; i++) {
      const child = await insertPerson(ctx.db, { living_status: 'unknown' });
      await parentOf(parent, child.id);
    }
    const proj = (await buildTreeProjection(ctx.db, root, { ancestors: 0, descendants: 1, includePartners: false }))!;
    expect(proj.truncated).toBe(true);
    expect(proj.nodes.filter((n) => n.type === 'person').length).toBeLessThanOrEqual(400);
  });
});
