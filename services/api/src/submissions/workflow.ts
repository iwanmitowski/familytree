import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { insertAuditEntry } from '../audit/repo';
import { getSubmission, type SubmissionRow } from './repo';

type Db = Kysely<DB>;
type Status = SubmissionRow['status'];

/** Allowed status transitions (idea.md §8). */
const TRANSITIONS: Record<string, Status[]> = {
  start_review: ['pending'],
  reject: ['pending', 'in_review'],
  mark_spam: ['pending', 'in_review'],
};

export type TransitionResult =
  | { ok: true; status: Status }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'invalid_transition'; from: Status };

async function transition(
  db: Db,
  id: string,
  action: keyof typeof TRANSITIONS,
  next: Status,
  actorId: string,
  patch: Partial<Record<string, unknown>>,
  auditAction: string,
  metadata?: Record<string, unknown>,
): Promise<TransitionResult> {
  return db.transaction().execute(async (trx) => {
    const row = await getSubmission(trx, id);
    if (!row) return { ok: false, kind: 'not_found' };
    if (!TRANSITIONS[action]!.includes(row.status)) {
      return { ok: false, kind: 'invalid_transition', from: row.status };
    }
    await trx
      .updateTable('submissions')
      .set({ status: next, updated_at: new Date(), ...patch })
      .where('id', '=', id)
      .execute();
    await insertAuditEntry(trx, {
      actor_type: 'admin',
      actor_id: actorId,
      action: auditAction,
      entity_type: 'submission',
      entity_id: id,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
    return { ok: true, status: next };
  });
}

export function startReview(db: Db, id: string, actorId: string): Promise<TransitionResult> {
  return transition(
    db,
    id,
    'start_review',
    'in_review',
    actorId,
    { processing_started_at: new Date() },
    'submission.start_review',
  );
}

export function rejectSubmission(
  db: Db,
  id: string,
  reason: string,
  actorId: string,
): Promise<TransitionResult> {
  return transition(
    db,
    id,
    'reject',
    'rejected',
    actorId,
    { rejected_at: new Date() },
    'submission.rejected',
    { reason },
  );
}

export function markSpam(
  db: Db,
  id: string,
  reason: string,
  actorId: string,
): Promise<TransitionResult> {
  return transition(
    db,
    id,
    'mark_spam',
    'spam',
    actorId,
    { spam_reason: reason },
    'submission.marked_spam',
    { reason },
  );
}
