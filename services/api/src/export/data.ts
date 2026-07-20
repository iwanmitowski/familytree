import type { Kysely, Selectable } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;

export interface ExportData {
  people: Selectable<DB['people']>[];
  names: Selectable<DB['person_names']>[];
  events: Selectable<DB['person_events']>[];
  places: Selectable<DB['places']>[];
  parentChild: Selectable<DB['parent_child_relationships']>[];
  unions: Selectable<DB['family_unions']>[];
  unionPartners: Selectable<DB['union_partners']>[];
  sources: Selectable<DB['sources']>[];
}

/**
 * Loads the canonical graph for export, excluding merged/deleted people, in a
 * stable order (by id) so exports are deterministic. When `publicOnly`, living
 * people are dropped entirely and their rows filtered out.
 */
export async function fetchExportData(db: Db, publicOnly: boolean): Promise<ExportData> {
  let people = await db
    .selectFrom('people')
    .selectAll()
    .where('merged_into_person_id', 'is', null)
    .where('deleted_at', 'is', null)
    .orderBy('id')
    .execute();
  if (publicOnly) people = people.filter((p) => p.living_status !== 'living');
  const personIds = new Set(people.map((p) => p.id));

  const [names, events, places, parentChild, unions, unionPartners, sources] = await Promise.all([
    db.selectFrom('person_names').selectAll().orderBy('id').execute(),
    db.selectFrom('person_events').selectAll().orderBy('id').execute(),
    db.selectFrom('places').selectAll().orderBy('id').execute(),
    db.selectFrom('parent_child_relationships').selectAll().where('verification_status', 'in', ['confirmed', 'proposed']).orderBy('id').execute(),
    db.selectFrom('family_unions').selectAll().orderBy('id').execute(),
    db.selectFrom('union_partners').selectAll().orderBy('id').execute(),
    db.selectFrom('sources').selectAll().orderBy('id').execute(),
  ]);

  return {
    people,
    names: names.filter((n) => personIds.has(n.person_id)),
    events: events.filter((e) => personIds.has(e.person_id)),
    places,
    parentChild: parentChild.filter((e) => personIds.has(e.parent_id) && personIds.has(e.child_id)),
    unions,
    unionPartners: unionPartners.filter((p) => personIds.has(p.person_id)),
    sources,
  };
}
