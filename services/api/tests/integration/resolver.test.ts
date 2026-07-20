import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { createApp } from '../../src/transport/app';
import { insertPerson } from '../../src/people/repo';
import { insertParentChild, insertFamilyUnion, insertUnionPartner } from '../../src/genealogy/repo';
import { resolveRelationship } from '../../src/genealogy/resolver';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('RelationshipResolver', () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = createTestDb();
    await migrateToLatest(ctx.migrator);
    createApp({ logger, db: ctx.db, ping: async () => true });
  });

  afterAll(async () => {
    await ctx.destroy();
  });

  const person = () => insertPerson(ctx.db, { living_status: 'unknown' }).then((p) => p.id);
  const parentOf = (parent: string, child: string) =>
    insertParentChild(ctx.db, { parent_id: parent, child_id: child, verification_status: 'confirmed' });

  async function label(a: string, b: string): Promise<string | null> {
    const res = await resolveRelationship(ctx.db, a, b);
    return res.ok ? res.result.relationshipLabelBg : 'ERR';
  }

  it('classifies a 5-generation fixture', async () => {
    // gp -> p1, p2 (siblings); p1 -> a; p2 -> b (a and b are first cousins).
    const gp = await person();
    const p1 = await person();
    const p2 = await person();
    const a = await person();
    const b = await person();
    await parentOf(gp, p1);
    await parentOf(gp, p2);
    await parentOf(p1, a);
    await parentOf(p2, b);

    expect(await label(p1, a)).toBe('родител');
    expect(await label(a, p1)).toBe('дете');
    expect(await label(gp, a)).toBe('баба/дядо');
    expect(await label(p1, p2)).toBe('брат/сестра');
    expect(await label(p1, b)).toBe('чичо/леля'); // p1 is b's uncle
    expect(await label(b, p1)).toBe('племенник/племенница');
    expect(await label(a, b)).toBe('първи братовчеди');

    // Second cousins: extend one more generation.
    const a2 = await person();
    const b2 = await person();
    await parentOf(a, a2);
    await parentOf(b, b2);
    expect(await label(a2, b2)).toBe('втори братовчеди');
    // First cousins once removed.
    expect(await label(a, b2)).toBe('първи братовчеди (веднъж отместени)');
  });

  it('reports a through-marriage connection (partner of a sibling)', async () => {
    const gp = await person();
    const s1 = await person();
    const s2 = await person(); // sibling of s1
    const spouse = await person(); // partner of s2
    await parentOf(gp, s1);
    await parentOf(gp, s2);
    const union = await insertFamilyUnion(ctx.db, { union_type: 'marriage' });
    await insertUnionPartner(ctx.db, { union_id: union.id, person_id: s2 });
    await insertUnionPartner(ctx.db, { union_id: union.id, person_id: spouse });

    const res = await resolveRelationship(ctx.db, s1, spouse);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.connected).toBe(true);
      expect(res.result.relationshipLabelBg).toBe('роднина по сватовство');
      expect(res.result.path.some((s) => s.relation === 'partner')).toBe(true);
    }
  });

  it('returns connected:false for a disconnected pair', async () => {
    const a = await person();
    const b = await person();
    const res = await resolveRelationship(ctx.db, a, b);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.connected).toBe(false);
      expect(res.result.relationshipLabelBg).toBeNull();
    }
  });

  it('returns unknown_person for a missing id', async () => {
    const a = await person();
    const res = await resolveRelationship(ctx.db, a, '00000000-0000-0000-0000-000000000000');
    expect(res.ok).toBe(false);
  });

  it('gives confidence 100 for a confirmed blood path', async () => {
    const p = await person();
    const c = await person();
    await parentOf(p, c);
    const res = await resolveRelationship(ctx.db, p, c);
    expect(res.ok && res.result.confidence).toBe(100);
  });
});
