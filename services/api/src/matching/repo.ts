import { sql, type Kysely, type Selectable } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;
export type MatchCandidateRow = Selectable<DB['match_candidates']>;

export interface UpsertMatchCandidate {
  submission_person_id: string;
  canonical_person_id: string;
  score: number;
  reasons: unknown;
}

/**
 * Re-running the matcher refreshes score/reasons for an existing pair but
 * never touches status, reviewed_by, or reviewed_at (idea.md §10 — the admin
 * decision is preserved).
 */
export function upsertMatchCandidate(
  db: Db,
  values: UpsertMatchCandidate,
): Promise<MatchCandidateRow> {
  return db
    .insertInto('match_candidates')
    .values({ ...values, reasons: JSON.stringify(values.reasons) })
    .onConflict((oc) =>
      oc.columns(['submission_person_id', 'canonical_person_id']).doUpdateSet({
        score: values.score,
        reasons: JSON.stringify(values.reasons),
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function listMatchCandidates(
  db: Db,
  submissionPersonId: string,
): Promise<MatchCandidateRow[]> {
  return db
    .selectFrom('match_candidates')
    .selectAll()
    .where('submission_person_id', '=', submissionPersonId)
    .orderBy('score', 'desc')
    .execute();
}

export function setMatchCandidateStatus(
  db: Db,
  id: string,
  status: MatchCandidateRow['status'],
  reviewedBy: string,
): Promise<MatchCandidateRow | undefined> {
  return db
    .updateTable('match_candidates')
    .set({ status, reviewed_by: reviewedBy, reviewed_at: sql<Date>`now()` })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}
