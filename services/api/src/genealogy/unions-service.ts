import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { insertAuditEntry } from '../audit/repo';
import { getPerson } from '../people/repo';
import {
  insertFamilyUnion,
  insertUnionPartner,
  listParentChildByUnion,
  listUnionPartners,
} from './repo';

type Db = Kysely<DB>;
export type UnionType = 'marriage' | 'partnership' | 'unknown';

const MAX_PARTNERS = 2;

export interface UnionView {
  id: string;
  unionType: string;
  partnerIds: string[];
  childIds: string[];
}

export type UnionResult =
  | { ok: true; union: UnionView }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'invalid'; message: string }
  | { ok: false; kind: 'conflict'; message: string };

async function activePerson(db: Db, id: string): Promise<boolean> {
  const p = await getPerson(db, id);
  return !!p && !p.deleted_at && !p.merged_into_person_id;
}

export async function getUnionView(db: Db, id: string): Promise<UnionView | undefined> {
  const union = await db
    .selectFrom('family_unions')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  if (!union) return undefined;
  const [partners, children] = await Promise.all([
    listUnionPartners(db, id),
    listParentChildByUnion(db, id),
  ]);
  return {
    id: union.id,
    unionType: union.union_type,
    partnerIds: partners.map((p) => p.person_id),
    childIds: [...new Set(children.map((c) => c.child_id))],
  };
}

/** Creates a union (marriage/partnership) with 1–2 partners (idea.md §8). */
export async function createUnion(
  db: Db,
  unionType: UnionType,
  partnerIds: string[],
  actorId: string,
): Promise<UnionResult> {
  if (partnerIds.length < 1 || partnerIds.length > MAX_PARTNERS) {
    return { ok: false, kind: 'invalid', message: 'Съюзът е между един или двама души' };
  }
  if (new Set(partnerIds).size !== partnerIds.length) {
    return { ok: false, kind: 'invalid', message: 'Партньорите трябва да са различни' };
  }

  return db.transaction().execute(async (trx): Promise<UnionResult> => {
    for (const id of partnerIds) {
      if (!(await activePerson(trx, id))) return { ok: false, kind: 'not_found' };
    }
    const union = await insertFamilyUnion(trx, { union_type: unionType });
    for (const personId of partnerIds) {
      await insertUnionPartner(trx, { union_id: union.id, person_id: personId });
    }
    await insertAuditEntry(trx, {
      actor_type: 'admin',
      actor_id: actorId,
      action: 'union.created',
      entity_type: 'family_union',
      entity_id: union.id,
      metadata: JSON.stringify({ unionType, partnerIds }),
    });
    return { ok: true, union: (await getUnionView(trx, union.id))! };
  });
}

export async function patchUnion(
  db: Db,
  id: string,
  unionType: UnionType,
  actorId: string,
): Promise<UnionResult> {
  const updated = await db
    .updateTable('family_unions')
    .set({ union_type: unionType })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
  if (!updated) return { ok: false, kind: 'not_found' };
  await insertAuditEntry(db, {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'union.updated',
    entity_type: 'family_union',
    entity_id: id,
  });
  return { ok: true, union: (await getUnionView(db, id))! };
}

export async function addPartner(
  db: Db,
  unionId: string,
  personId: string,
  actorId: string,
): Promise<UnionResult> {
  return db.transaction().execute(async (trx): Promise<UnionResult> => {
    const union = await trx
      .selectFrom('family_unions')
      .select('id')
      .where('id', '=', unionId)
      .executeTakeFirst();
    if (!union) return { ok: false, kind: 'not_found' };
    if (!(await activePerson(trx, personId))) return { ok: false, kind: 'not_found' };

    const partners = await listUnionPartners(trx, unionId);
    if (partners.some((p) => p.person_id === personId)) {
      return { ok: false, kind: 'conflict', message: 'Партньорът вече е в съюза' };
    }
    if (partners.length >= MAX_PARTNERS) {
      return { ok: false, kind: 'conflict', message: 'Съюзът вече има двама партньори' };
    }
    await insertUnionPartner(trx, { union_id: unionId, person_id: personId });
    await insertAuditEntry(trx, {
      actor_type: 'admin',
      actor_id: actorId,
      action: 'union.partner_added',
      entity_type: 'family_union',
      entity_id: unionId,
      metadata: JSON.stringify({ personId }),
    });
    return { ok: true, union: (await getUnionView(trx, unionId))! };
  });
}

export async function removePartner(
  db: Db,
  unionId: string,
  personId: string,
  actorId: string,
): Promise<UnionResult> {
  const deleted = await db
    .deleteFrom('union_partners')
    .where('union_id', '=', unionId)
    .where('person_id', '=', personId)
    .returningAll()
    .executeTakeFirst();
  if (!deleted) return { ok: false, kind: 'not_found' };
  await insertAuditEntry(db, {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'union.partner_removed',
    entity_type: 'family_union',
    entity_id: unionId,
    metadata: JSON.stringify({ personId }),
  });
  const view = await getUnionView(db, unionId);
  return view ? { ok: true, union: view } : { ok: false, kind: 'not_found' };
}

export async function deleteUnion(
  db: Db,
  id: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; kind: 'not_found' | 'in_use' }> {
  return db.transaction().execute(async (trx) => {
    const union = await trx.selectFrom('family_unions').select('id').where('id', '=', id).executeTakeFirst();
    if (!union) return { ok: false, kind: 'not_found' } as const;

    const referencing = await listParentChildByUnion(trx, id);
    if (referencing.length > 0) return { ok: false, kind: 'in_use' } as const;

    await trx.deleteFrom('family_unions').where('id', '=', id).execute();
    await insertAuditEntry(trx, {
      actor_type: 'admin',
      actor_id: actorId,
      action: 'union.deleted',
      entity_type: 'family_union',
      entity_id: id,
    });
    return { ok: true } as const;
  });
}
