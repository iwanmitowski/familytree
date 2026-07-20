import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { insertPerson, insertPersonName, insertPersonEvent } from '../../src/people/repo';
import { insertParentChild } from '../../src/genealogy/repo';
import { FORBIDDEN_PUBLIC_FIELDS } from '../../src/privacy/redact';
import { normalize } from '../../src/names';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'privacy-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-privacy';
const logger = pino({ enabled: false });

describe.skipIf(!testDatabaseUrl())('privacy redaction in the tree', () => {
  let ctx: TestDb;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    ctx = createTestDb();
    await migrateToLatest(ctx.migrator);
    app = createApp({
      logger,
      db: ctx.db,
      ping: async () => true,
      hmac: { serviceId: SERVICE_ID, secret: SECRET, store: dbAuthStore(ctx.db) },
    });
  });

  afterAll(async () => {
    await ctx.destroy();
  });

  async function person(first: string, living: 'living' | 'deceased', privacy: 'private' | 'family' | 'public', birthYear: number) {
    const p = await insertPerson(ctx.db, { living_status: living, privacy_level: privacy, notes: 'секретна бележка' });
    await insertPersonName(ctx.db, { person_id: p.id, first_name: first, surname: 'Митовски', normalized_name: normalize(`${first} Митовски`), name_type: 'primary', is_preferred: true });
    await insertPersonEvent(ctx.db, { person_id: p.id, event_type: 'birth', year_from: birthYear, year_to: birthYear, date_precision: 'year' });
    return p.id;
  }

  function get(path: string, role: 'admin' | 'public') {
    const signed = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method: 'GET',
      pathWithQuery: path,
      rawBody: '',
      actorId: role === 'admin' ? 'admin@example.com' : 'public',
      actorRole: role,
    });
    return app.request(`http://api.test${path}`, { method: 'GET', headers: signed.headers });
  }

  it('masks living people and private data in the public tree, shows all to admin', async () => {
    const root = await person('Дядо', 'deceased', 'public', 1930);
    const livingChild = await person('Живо', 'living', 'private', 1985);
    const deceasedPrivate = await person('Таен', 'deceased', 'private', 1960);
    await insertParentChild(ctx.db, { parent_id: root, child_id: livingChild, verification_status: 'confirmed' });
    await insertParentChild(ctx.db, { parent_id: root, child_id: deceasedPrivate, verification_status: 'confirmed' });

    // Public view.
    const pubRes = await get(`/v1/internal/tree/${root}?descendants=2`, 'public');
    expect(pubRes.status).toBe(200);
    const pub = (await pubRes.json()) as { nodes: { id: string; label: string; living: boolean; birthYear: number | null }[] };
    const livingNode = pub.nodes.find((n) => n.id === livingChild)!;
    expect(livingNode.label).toBe('Жив член на семейството');
    expect(livingNode.birthYear).toBeNull();
    const privateNode = pub.nodes.find((n) => n.id === deceasedPrivate)!;
    expect(privateNode.label).toBe('Член на семейството');
    const rootNode = pub.nodes.find((n) => n.id === root)!;
    expect(rootNode.label).toBe('Дядо Митовски'); // deceased + public → visible

    // No forbidden field name anywhere in the public JSON.
    const pubJson = JSON.stringify(pub);
    for (const field of FORBIDDEN_PUBLIC_FIELDS) {
      expect(pubJson).not.toContain(`"${field}"`);
    }
    expect(pubJson).not.toContain('секретна бележка');

    // Admin view shows the living child's real name.
    const adminRes = await get(`/v1/internal/tree/${root}?descendants=2&view=admin`, 'admin');
    const admin = (await adminRes.json()) as { nodes: { id: string; label: string }[] };
    expect(admin.nodes.find((n) => n.id === livingChild)!.label).toBe('Живо Митовски');
  });

  it('a public relationship-path returns only the label + confidence (no ids)', async () => {
    const p = await person('Родител', 'deceased', 'public', 1940);
    const c = await person('Дете', 'deceased', 'public', 1965);
    await insertParentChild(ctx.db, { parent_id: p, child_id: c, verification_status: 'confirmed' });

    const res = await get(`/v1/internal/relationship-path?personA=${p}&personB=${c}`, 'public');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.relationshipLabelBg).toBe('родител');
    expect(body).not.toHaveProperty('path');
    expect(body).not.toHaveProperty('commonAncestors');
    expect(JSON.stringify(body)).not.toContain(p);
  });

  it('a non-admin actor cannot obtain the admin view even with view=admin', async () => {
    const root = await person('Тест', 'living', 'public', 1990);
    const res = await get(`/v1/internal/tree/${root}?view=admin`, 'public');
    const body = (await res.json()) as { nodes: { id: string; label: string }[] };
    expect(body.nodes.find((n) => n.id === root)!.label).toBe('Жив член на семейството');
  });
});
