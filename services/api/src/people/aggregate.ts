import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { getPerson, listPersonEvents, listPersonNames, type PersonNameRow } from './repo';
import { listParentChildByPerson, listUnionsByPerson, listUnionPartners } from '../genealogy/repo';

type Db = Kysely<DB>;

export interface PersonAggregate {
  id: string;
  /** Preferred display name (idea.md §8) — convenience for admin browsers. */
  label: string;
  livingStatus: string;
  privacyLevel: string;
  notes: string | null;
  mergedIntoPersonId: string | null;
  deletedAt: string | null;
  names: unknown[];
  events: unknown[];
  /** Edges where this person is the child; counterpart is the parent. */
  parents: unknown[];
  /** Edges where this person is the parent; counterpart is the child. */
  children: unknown[];
  unions: unknown[];
  mergeHistory: unknown[];
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

  // Resolve every referenced counterpart id to a display label in one query so
  // admin browsers can render relationships without N+1 lookups.
  const parents = edges.filter((e) => e.child_id === id);
  const children = edges.filter((e) => e.parent_id === id);
  const referenced = new Set<string>();
  parents.forEach((e) => referenced.add(e.parent_id));
  children.forEach((e) => referenced.add(e.child_id));
  unions.forEach((u) => u.partnerIds.forEach((pid) => referenced.add(pid)));
  referenced.delete(id);
  const labels = await labelsFor(db, [...referenced]);
  const label = (pid: string) => labels.get(pid) ?? 'Без име';

  const [mergeHistory, sourceCount] = await Promise.all([
    listMergeHistory(db, id),
    distinctSourceCount(db, id),
  ]);

  return {
    ok: true,
    person: {
      id: person.id,
      label: preferredLabel(names) ?? 'Без име',
      livingStatus: person.living_status,
      privacyLevel: person.privacy_level,
      notes: person.notes,
      mergedIntoPersonId: null,
      deletedAt: null,
      names,
      events,
      parents: parents.map((e) => ({ ...e, counterpartId: e.parent_id, counterpartLabel: label(e.parent_id) })),
      children: children.map((e) => ({ ...e, counterpartId: e.child_id, counterpartLabel: label(e.child_id) })),
      unions: unions.map((u) => ({
        ...u,
        partners: u.partnerIds.filter((pid) => pid !== id).map((pid) => ({ id: pid, label: label(pid) })),
      })),
      mergeHistory,
      sourceCount,
    },
  };
}

type NameLike = Pick<PersonNameRow, 'first_name' | 'surname' | 'nickname' | 'name_type' | 'is_preferred'>;

/** Preferred display name from a person's name rows (idea.md §8). */
function preferredLabel(names: NameLike[]): string | null {
  const preferred =
    names.find((n) => n.name_type === 'primary' && n.is_preferred) ??
    names.find((n) => n.name_type === 'primary') ??
    names[0];
  if (!preferred) return null;
  const full = [preferred.first_name, preferred.surname].filter(Boolean).join(' ').trim();
  return full || preferred.nickname || null;
}

/** Preferred label per person id, in a single query. */
async function labelsFor(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectFrom('person_names')
    .select(['person_id', 'first_name', 'surname', 'nickname', 'name_type', 'is_preferred'])
    .where('person_id', 'in', ids)
    .execute();
  const byPerson = new Map<string, NameLike[]>();
  for (const r of rows) {
    const list = byPerson.get(r.person_id) ?? [];
    list.push(r);
    byPerson.set(r.person_id, list);
  }
  const out = new Map<string, string>();
  for (const pid of ids) out.set(pid, preferredLabel(byPerson.get(pid) ?? []) ?? 'Без име');
  return out;
}

/** Merges where this person absorbed another (target = this id). */
function listMergeHistory(db: Db, personId: string): Promise<unknown[]> {
  return db
    .selectFrom('person_merge_history')
    .select(['id', 'source_person_id', 'target_person_id', 'actor_id', 'reason', 'created_at'])
    .where('target_person_id', '=', personId)
    .orderBy('created_at', 'desc')
    .execute();
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
