import { sql, type Insertable, type Kysely, type Selectable, type Updateable } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;
export type ParentChildRow = Selectable<DB['parent_child_relationships']>;
export type FamilyUnionRow = Selectable<DB['family_unions']>;
export type UnionPartnerRow = Selectable<DB['union_partners']>;

export function insertParentChild(
  db: Db,
  values: Insertable<DB['parent_child_relationships']>,
): Promise<ParentChildRow> {
  return db
    .insertInto('parent_child_relationships')
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function getParentChild(db: Db, id: string): Promise<ParentChildRow | undefined> {
  return db
    .selectFrom('parent_child_relationships')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
}

export function patchParentChild(
  db: Db,
  id: string,
  patch: Pick<
    Updateable<DB['parent_child_relationships']>,
    'verification_status' | 'relationship_type' | 'confidence' | 'family_union_id'
  >,
): Promise<ParentChildRow | undefined> {
  return db
    .updateTable('parent_child_relationships')
    .set({ ...patch, updated_at: sql<Date>`now()` })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}

export function deleteParentChild(db: Db, id: string): Promise<ParentChildRow | undefined> {
  return db
    .deleteFrom('parent_child_relationships')
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}

/** All edges where the person appears as parent or child. */
export function listParentChildByPerson(db: Db, personId: string): Promise<ParentChildRow[]> {
  return db
    .selectFrom('parent_child_relationships')
    .selectAll()
    .where((eb) => eb.or([eb('parent_id', '=', personId), eb('child_id', '=', personId)]))
    .orderBy('created_at')
    .execute();
}

export function listParentChildByUnion(db: Db, unionId: string): Promise<ParentChildRow[]> {
  return db
    .selectFrom('parent_child_relationships')
    .selectAll()
    .where('family_union_id', '=', unionId)
    .orderBy('created_at')
    .execute();
}

export function insertFamilyUnion(
  db: Db,
  values?: Insertable<DB['family_unions']>,
): Promise<FamilyUnionRow> {
  const base = db.insertInto('family_unions');
  const query =
    values && Object.keys(values).length > 0 ? base.values(values) : base.defaultValues();
  return query.returningAll().executeTakeFirstOrThrow();
}

export function insertUnionPartner(
  db: Db,
  values: Insertable<DB['union_partners']>,
): Promise<UnionPartnerRow> {
  return db.insertInto('union_partners').values(values).returningAll().executeTakeFirstOrThrow();
}

export function listUnionsByPerson(
  db: Db,
  personId: string,
): Promise<(FamilyUnionRow & { partner_row_id: string })[]> {
  return db
    .selectFrom('family_unions')
    .innerJoin('union_partners', 'union_partners.union_id', 'family_unions.id')
    .selectAll('family_unions')
    .select('union_partners.id as partner_row_id')
    .where('union_partners.person_id', '=', personId)
    .orderBy('family_unions.created_at')
    .execute();
}

export function listUnionPartners(db: Db, unionId: string): Promise<UnionPartnerRow[]> {
  return db
    .selectFrom('union_partners')
    .selectAll()
    .where('union_id', '=', unionId)
    .orderBy('created_at')
    .execute();
}
