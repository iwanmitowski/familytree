import type { Kysely, Transaction } from 'kysely';
import type { DB } from '../db/generated/db';
import { insertAuditEntry } from '../audit/repo';
import { getPerson, insertMergeHistory } from './repo';
import { wouldCreateCycle, lockPersonPair } from '../genealogy/cycle';
import { getPersonAggregate, type PersonAggregate } from './aggregate';

type Db = Kysely<DB>;
type Trx = Transaction<DB>;

export type MergeResult =
  | { ok: true; person: PersonAggregate }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'invalid'; message: string }
  | { ok: false; kind: 'conflict'; message: string };

class MergeAbort extends Error {
  constructor(readonly kind: 'invalid' | 'conflict', message: string) {
    super(message);
  }
}

/** Follows at most one merged_into hop (merging into a merged target is forbidden). */
export async function resolvePersonId(db: Db, id: string): Promise<string> {
  const person = await getPerson(db, id);
  return person?.merged_into_person_id ?? id;
}

async function fullSnapshot(trx: Trx, id: string): Promise<unknown> {
  const [person, names, events, edges, partners, evidence] = await Promise.all([
    trx.selectFrom('people').selectAll().where('id', '=', id).executeTakeFirst(),
    trx.selectFrom('person_names').selectAll().where('person_id', '=', id).execute(),
    trx.selectFrom('person_events').selectAll().where('person_id', '=', id).execute(),
    trx.selectFrom('parent_child_relationships').selectAll().where((eb) => eb.or([eb('parent_id', '=', id), eb('child_id', '=', id)])).execute(),
    trx.selectFrom('union_partners').selectAll().where('person_id', '=', id).execute(),
    trx.selectFrom('evidence').selectAll().where('subject_type', '=', 'person').where('subject_id', '=', id).execute(),
  ]);
  return { person, names, events, edges, partners, evidence };
}

async function mergeNames(trx: Trx, source: string, target: string): Promise<void> {
  const targetNames = await trx.selectFrom('person_names').selectAll().where('person_id', '=', target).execute();
  const targetHasPreferredPrimary = targetNames.some((n) => n.name_type === 'primary' && n.is_preferred);
  const sourceNames = await trx.selectFrom('person_names').selectAll().where('person_id', '=', source).execute();

  for (const name of sourceNames) {
    const dup = targetNames.find((t) => t.normalized_name === name.normalized_name && t.name_type === name.name_type);
    if (dup) {
      // Re-point the dropped name's evidence to the kept one, then drop it.
      await trx.updateTable('evidence').set({ subject_id: dup.id }).where('subject_type', '=', 'person_name').where('subject_id', '=', name.id).execute();
      await trx.deleteFrom('person_names').where('id', '=', name.id).execute();
      continue;
    }
    // A source preferred primary becomes a non-preferred alias when the target
    // already owns a preferred primary.
    if (name.name_type === 'primary' && name.is_preferred && targetHasPreferredPrimary) {
      await trx.updateTable('person_names').set({ person_id: target, name_type: 'alias', is_preferred: false }).where('id', '=', name.id).execute();
    } else {
      await trx.updateTable('person_names').set({ person_id: target }).where('id', '=', name.id).execute();
    }
  }
}

async function mergeEvents(trx: Trx, source: string, target: string): Promise<void> {
  const targetEvents = await trx.selectFrom('person_events').selectAll().where('person_id', '=', target).execute();
  const sourceEvents = await trx.selectFrom('person_events').selectAll().where('person_id', '=', source).execute();
  const key = (e: (typeof sourceEvents)[number]) =>
    `${e.event_type}|${e.year_from}|${e.year_to}|${e.date_precision}|${e.place_id ?? ''}`;
  const targetKeys = new Set(targetEvents.map(key));
  for (const ev of sourceEvents) {
    if (targetKeys.has(key(ev))) {
      // Drop the duplicate event and any evidence attached only to it.
      await trx.deleteFrom('evidence').where('subject_type', '=', 'person_event').where('subject_id', '=', ev.id).execute();
      await trx.deleteFrom('person_events').where('id', '=', ev.id).execute();
    } else {
      await trx.updateTable('person_events').set({ person_id: target }).where('id', '=', ev.id).execute();
    }
  }
}

async function mergeEdges(trx: Trx, source: string, target: string): Promise<void> {
  const edges = await trx
    .selectFrom('parent_child_relationships')
    .selectAll()
    .where((eb) => eb.or([eb('parent_id', '=', source), eb('child_id', '=', source)]))
    .execute();
  for (const edge of edges) {
    const parent = edge.parent_id === source ? target : edge.parent_id;
    const child = edge.child_id === source ? target : edge.child_id;
    if (parent === child) throw new MergeAbort('invalid', 'Сливането би създало връзка към самия себе си');
    const existing = await trx
      .selectFrom('parent_child_relationships')
      .select('id')
      .where('parent_id', '=', parent)
      .where('child_id', '=', child)
      .where('relationship_type', '=', edge.relationship_type)
      .where('id', '<>', edge.id)
      .executeTakeFirst();
    if (existing) {
      await trx.deleteFrom('parent_child_relationships').where('id', '=', edge.id).execute();
    } else {
      await trx.updateTable('parent_child_relationships').set({ parent_id: parent, child_id: child }).where('id', '=', edge.id).execute();
    }
  }
}

async function mergePartners(trx: Trx, source: string, target: string): Promise<void> {
  const partners = await trx.selectFrom('union_partners').selectAll().where('person_id', '=', source).execute();
  for (const p of partners) {
    const targetInUnion = await trx
      .selectFrom('union_partners')
      .select('id')
      .where('union_id', '=', p.union_id)
      .where('person_id', '=', target)
      .executeTakeFirst();
    if (targetInUnion) {
      await trx.deleteFrom('union_partners').where('id', '=', p.id).execute();
    } else {
      await trx.updateTable('union_partners').set({ person_id: target }).where('id', '=', p.id).execute();
    }
  }
}

async function mergeReferences(trx: Trx, source: string, target: string): Promise<void> {
  // Evidence about the person itself.
  await trx.updateTable('evidence').set({ subject_id: target }).where('subject_type', '=', 'person').where('subject_id', '=', source).execute();
  // submission_people.matched_person_id.
  await trx.updateTable('submission_people').set({ matched_person_id: target }).where('matched_person_id', '=', source).execute();
  // match_candidates: re-point, keeping the higher score on a unique conflict.
  const cands = await trx.selectFrom('match_candidates').selectAll().where('canonical_person_id', '=', source).execute();
  for (const cand of cands) {
    const existing = await trx
      .selectFrom('match_candidates')
      .selectAll()
      .where('submission_person_id', '=', cand.submission_person_id)
      .where('canonical_person_id', '=', target)
      .executeTakeFirst();
    if (existing) {
      if (cand.score > existing.score) {
        await trx.updateTable('match_candidates').set({ score: cand.score, reasons: cand.reasons }).where('id', '=', existing.id).execute();
      }
      await trx.deleteFrom('match_candidates').where('id', '=', cand.id).execute();
    } else {
      await trx.updateTable('match_candidates').set({ canonical_person_id: target }).where('id', '=', cand.id).execute();
    }
  }
}

/**
 * Merges the duplicate `sourceId` into `targetId` in one transaction
 * (idea.md §8). Snapshots the source, re-points every referencing table with
 * de-duplication, aborts on a self-edge or a resulting ancestry cycle, then
 * flags the source merged + deleted and writes merge history.
 */
export async function mergePerson(
  db: Db,
  sourceId: string,
  targetId: string,
  reason: string,
  actorId: string,
): Promise<MergeResult> {
  if (sourceId === targetId) return { ok: false, kind: 'invalid', message: 'Не може да слеете човек със самия себе си' };

  try {
    await db.transaction().execute(async (trx) => {
      await lockPersonPair(trx, sourceId, targetId);

      const source = await getPerson(trx, sourceId);
      const target = await getPerson(trx, targetId);
      if (!source || !target) throw new MergeAbort('invalid', 'not_found');
      if (source.deleted_at || source.merged_into_person_id) throw new MergeAbort('conflict', 'Изходният човек вече е слят');
      if (target.deleted_at || target.merged_into_person_id) throw new MergeAbort('conflict', 'Целевият човек е слят или изтрит');

      const snapshot = await fullSnapshot(trx, sourceId);

      await mergeNames(trx, sourceId, targetId);
      await mergeEvents(trx, sourceId, targetId);
      await mergeEdges(trx, sourceId, targetId);
      await mergePartners(trx, sourceId, targetId);
      await mergeReferences(trx, sourceId, targetId);

      // Post-check: no ancestry cycle among the target's rewritten edges.
      const targetEdges = await trx
        .selectFrom('parent_child_relationships')
        .selectAll()
        .where((eb) => eb.or([eb('parent_id', '=', targetId), eb('child_id', '=', targetId)]))
        .execute();
      for (const edge of targetEdges) {
        if (await wouldCreateCycle(trx, edge.parent_id, edge.child_id)) {
          throw new MergeAbort('conflict', 'Сливането създава цикъл в родословието');
        }
      }

      await trx
        .updateTable('people')
        .set({ merged_into_person_id: targetId, deleted_at: new Date(), updated_at: new Date() })
        .where('id', '=', sourceId)
        .execute();

      await insertMergeHistory(trx, {
        source_person_id: sourceId,
        target_person_id: targetId,
        actor_id: actorId,
        reason,
        snapshot: JSON.stringify(snapshot),
      });
      await insertAuditEntry(trx, {
        actor_type: 'admin',
        actor_id: actorId,
        action: 'person.merged',
        entity_type: 'person',
        entity_id: targetId,
        metadata: JSON.stringify({ sourceId }),
      });
    });
  } catch (err) {
    if (err instanceof MergeAbort) {
      if (err.message === 'not_found') return { ok: false, kind: 'not_found' };
      return err.kind === 'invalid'
        ? { ok: false, kind: 'invalid', message: err.message }
        : { ok: false, kind: 'conflict', message: err.message };
    }
    throw err;
  }

  const agg = await getPersonAggregate(db, targetId);
  if (!agg.ok) return { ok: false, kind: 'not_found' };
  return { ok: true, person: agg.person };
}
