import type { Insertable, Kysely, Selectable } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;
export type SourceRow = Selectable<DB['sources']>;
export type EvidenceRow = Selectable<DB['evidence']>;

export function insertSource(db: Db, values: Insertable<DB['sources']>): Promise<SourceRow> {
  return db.insertInto('sources').values(values).returningAll().executeTakeFirstOrThrow();
}

export function getSource(db: Db, id: string): Promise<SourceRow | undefined> {
  return db.selectFrom('sources').selectAll().where('id', '=', id).executeTakeFirst();
}

export function getSourceBySubmission(
  db: Db,
  submissionId: string,
): Promise<SourceRow | undefined> {
  return db
    .selectFrom('sources')
    .selectAll()
    .where('submission_id', '=', submissionId)
    .where('source_type', '=', 'questionnaire')
    .executeTakeFirst();
}

/**
 * Evidence rows link sources to assertions about subject rows. They never
 * mutate the subject — conflicting information is recorded, not applied
 * (idea.md §8).
 */
export function insertEvidence(db: Db, values: Insertable<DB['evidence']>): Promise<EvidenceRow> {
  return db.insertInto('evidence').values(values).returningAll().executeTakeFirstOrThrow();
}

export function listEvidenceBySubject(
  db: Db,
  subjectType: EvidenceRow['subject_type'],
  subjectId: string,
): Promise<EvidenceRow[]> {
  return db
    .selectFrom('evidence')
    .selectAll()
    .where('subject_type', '=', subjectType)
    .where('subject_id', '=', subjectId)
    .orderBy('created_at')
    .execute();
}
