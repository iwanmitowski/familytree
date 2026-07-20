import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { getPerson, listPersonEvents, listPersonNames } from './repo';
import { listParentChildByPerson, listUnionsByPerson, listUnionPartners } from '../genealogy/repo';

type Db = Kysely<DB>;

export interface PersonAggregate {
  id: string;
  livingStatus: string;
  privacyLevel: string;
  notes: string | null;
  mergedIntoPersonId: string | null;
  deletedAt: string | null;
  names: unknown[];
  events: unknown[];
  parents: unknown[];
  children: unknown[];
  unions: unknown[];
  sourceCount: number;
}

export type PersonAggregateResult =
  | { ok: true; person: PersonAggregate }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'merged'; mergedIntoPersonId: string };

/**
 * Full person aggregate. A merged person yields a redirect envelope (the caller
 * returns 409) rather than pretending to be an active node (idea.md §8).
 */
export async function getPersonAggregate(db: Db, id: string): Promise<PersonAggregateResult> {
  const person = await getPerson(db, id);
  if (!person || person.deleted_at) return { ok: false, kind: 'not_found' };
  if (person.merged_into_person_id) {
    return { ok: false, kind: 'merged', mergedIntoPersonId: person.merged_into_person_id };
  }

  const [names, events, edges] = await Promise.all([
    listPersonNames(db, id),
    eventsWithPlaces(db, id),
    listParentChildByPerson(db, id),
  ]);

  const unionsRaw = await listUnionsByPerson(db, id);
  const unions = await Promise.all(
    unionsRaw.map(async (u) => ({
      id: u.id,
      unionType: u.union_type,
      partnerIds: (await listUnionPartners(db, u.id)).map((p) => p.person_id),
    })),
  );

  const sourceCount = await distinctSourceCount(db, id);

  return {
    ok: true,
    person: {
      id: person.id,
      livingStatus: person.living_status,
      privacyLevel: person.privacy_level,
      notes: person.notes,
      mergedIntoPersonId: null,
      deletedAt: null,
      names,
      events,
      parents: edges.filter((e) => e.child_id === id),
      children: edges.filter((e) => e.parent_id === id),
      unions,
      sourceCount,
    },
  };
}

async function eventsWithPlaces(db: Db, personId: string): Promise<unknown[]> {
  const events = await listPersonEvents(db, personId);
  const placeIds = [...new Set(events.map((e) => e.place_id).filter((x): x is string => !!x))];
  const places =
    placeIds.length > 0
      ? await db.selectFrom('places').select(['id', 'name']).where('id', 'in', placeIds).execute()
      : [];
  const placeName = new Map(places.map((p) => [p.id, p.name]));
  return events.map((e) => ({ ...e, place_label: e.place_id ? (placeName.get(e.place_id) ?? null) : null }));
}

/** Distinct sources across the person and its names/events (idea.md §14). */
async function distinctSourceCount(db: Db, personId: string): Promise<number> {
  const nameIds = (await db.selectFrom('person_names').select('id').where('person_id', '=', personId).execute()).map((r) => r.id);
  const eventIds = (await db.selectFrom('person_events').select('id').where('person_id', '=', personId).execute()).map((r) => r.id);
  const rows = await db
    .selectFrom('evidence')
    .select('source_id')
    .distinct()
    .where((eb) =>
      eb.or([
        eb.and([eb('subject_type', '=', 'person'), eb('subject_id', '=', personId)]),
        ...(nameIds.length ? [eb.and([eb('subject_type', '=', 'person_name'), eb('subject_id', 'in', nameIds)])] : []),
        ...(eventIds.length ? [eb.and([eb('subject_type', '=', 'person_event'), eb('subject_id', 'in', eventIds)])] : []),
      ]),
    )
    .execute();
  return rows.length;
}
