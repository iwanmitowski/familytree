import { sql, type Insertable, type Kysely, type Selectable, type Updateable } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;
export type PersonRow = Selectable<DB['people']>;
export type PersonNameRow = Selectable<DB['person_names']>;
export type PersonEventRow = Selectable<DB['person_events']>;
export type PersonMergeHistoryRow = Selectable<DB['person_merge_history']>;

export function insertPerson(db: Db, values?: Insertable<DB['people']>): Promise<PersonRow> {
  const base = db.insertInto('people');
  const query =
    values && Object.keys(values).length > 0 ? base.values(values) : base.defaultValues();
  return query.returningAll().executeTakeFirstOrThrow();
}

export function getPerson(db: Db, id: string): Promise<PersonRow | undefined> {
  return db.selectFrom('people').selectAll().where('id', '=', id).executeTakeFirst();
}

/** Only mutable person fields; updated_at is refreshed on every patch. */
export function patchPerson(
  db: Db,
  id: string,
  patch: Pick<Updateable<DB['people']>, 'privacy_level' | 'living_status' | 'notes'>,
): Promise<PersonRow | undefined> {
  return db
    .updateTable('people')
    .set({ ...patch, updated_at: sql<Date>`now()` })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}

export interface SearchPeopleOptions {
  limit?: number;
  offset?: number;
  includeMerged?: boolean;
}

/**
 * Basic substring search over normalized names. Variant-aware expansion
 * (Task 19) happens in the service layer; this repo matches literally.
 * Merged and deleted people are excluded unless explicitly requested.
 */
export function searchPeopleByNormalizedName(
  db: Db,
  normalizedQuery: string,
  { limit = 25, offset = 0, includeMerged = false }: SearchPeopleOptions = {},
): Promise<PersonRow[]> {
  let query = db
    .selectFrom('people')
    .selectAll('people')
    .distinct()
    .innerJoin('person_names', 'person_names.person_id', 'people.id')
    .where('person_names.normalized_name', 'like', `%${normalizedQuery}%`)
    .limit(limit)
    .offset(offset);
  if (!includeMerged) {
    query = query.where('people.merged_into_person_id', 'is', null).where(
      'people.deleted_at',
      'is',
      null,
    );
  }
  return query.execute();
}

export function insertPersonName(
  db: Db,
  values: Insertable<DB['person_names']>,
): Promise<PersonNameRow> {
  return db.insertInto('person_names').values(values).returningAll().executeTakeFirstOrThrow();
}

export function listPersonNames(db: Db, personId: string): Promise<PersonNameRow[]> {
  return db
    .selectFrom('person_names')
    .selectAll()
    .where('person_id', '=', personId)
    .orderBy('created_at')
    .execute();
}

export function insertPersonEvent(
  db: Db,
  values: Insertable<DB['person_events']>,
): Promise<PersonEventRow> {
  return db.insertInto('person_events').values(values).returningAll().executeTakeFirstOrThrow();
}

export function listPersonEvents(db: Db, personId: string): Promise<PersonEventRow[]> {
  return db
    .selectFrom('person_events')
    .selectAll()
    .where('person_id', '=', personId)
    .orderBy('created_at')
    .execute();
}

export function insertMergeHistory(
  db: Db,
  values: Insertable<DB['person_merge_history']>,
): Promise<PersonMergeHistoryRow> {
  return db
    .insertInto('person_merge_history')
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}
