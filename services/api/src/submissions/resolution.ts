import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { insertAuditEntry } from '../audit/repo';

type Db = Kysely<DB>;

export type ResolutionResult =
  | { ok: true }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'guard'; message: string };

/**
 * Sets a submitted person's resolution_status to `deferred` or `ignored`
 * (idea.md §7). Only valid while the submission is in review.
 */
async function setResolution(
  db: Db,
  submissionPersonId: string,
  status: 'deferred' | 'ignored',
  reason: string | undefined,
  actorId: string,
): Promise<ResolutionResult> {
  return db.transaction().execute(async (trx): Promise<ResolutionResult> => {
    const sp = await trx
      .selectFrom('submission_people')
      .select(['id', 'submission_id'])
      .where('id', '=', submissionPersonId)
      .executeTakeFirst();
    if (!sp) return { ok: false, kind: 'not_found' };

    const submission = await trx
      .selectFrom('submissions')
      .select('status')
      .where('id', '=', sp.submission_id)
      .executeTakeFirstOrThrow();
    if (submission.status !== 'in_review') {
      return { ok: false, kind: 'guard', message: 'Заявката не е в преглед' };
    }

    await trx
      .updateTable('submission_people')
      .set({ resolution_status: status })
      .where('id', '=', submissionPersonId)
      .execute();
    await insertAuditEntry(trx, {
      actor_type: 'admin',
      actor_id: actorId,
      action: status === 'deferred' ? 'submission_person.deferred' : 'submission_person.ignored',
      entity_type: 'submission_person',
      entity_id: submissionPersonId,
      metadata: reason ? JSON.stringify({ reason }) : null,
    });
    return { ok: true };
  });
}

export function deferPerson(db: Db, id: string, reason: string | undefined, actorId: string): Promise<ResolutionResult> {
  return setResolution(db, id, 'deferred', reason, actorId);
}

export function ignorePerson(db: Db, id: string, reason: string | undefined, actorId: string): Promise<ResolutionResult> {
  return setResolution(db, id, 'ignored', reason, actorId);
}
