import type { Insertable, Kysely, Selectable } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;
export type SubmissionRow = Selectable<DB['submissions']>;
export type SubmissionPersonRow = Selectable<DB['submission_people']>;
export type SubmissionRelationshipRow = Selectable<DB['submission_relationships']>;
export type ConsentRow = Selectable<DB['consents']>;

export function insertSubmission(
  db: Db,
  values: Insertable<DB['submissions']>,
): Promise<SubmissionRow> {
  return db.insertInto('submissions').values(values).returningAll().executeTakeFirstOrThrow();
}

export function getSubmission(db: Db, id: string): Promise<SubmissionRow | undefined> {
  return db.selectFrom('submissions').selectAll().where('id', '=', id).executeTakeFirst();
}

export interface ListSubmissionsOptions {
  status?: SubmissionRow['status'];
  limit?: number;
  offset?: number;
}

export function listSubmissions(
  db: Db,
  { status, limit = 25, offset = 0 }: ListSubmissionsOptions = {},
): Promise<SubmissionRow[]> {
  let query = db
    .selectFrom('submissions')
    .selectAll()
    .orderBy('submitted_at', 'desc')
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset);
  if (status !== undefined) {
    query = query.where('status', '=', status);
  }
  return query.execute();
}

export function insertSubmissionPerson(
  db: Db,
  values: Insertable<DB['submission_people']>,
): Promise<SubmissionPersonRow> {
  return db.insertInto('submission_people').values(values).returningAll().executeTakeFirstOrThrow();
}

export function listSubmissionPeople(db: Db, submissionId: string): Promise<SubmissionPersonRow[]> {
  return db
    .selectFrom('submission_people')
    .selectAll()
    .where('submission_id', '=', submissionId)
    .orderBy('local_key')
    .execute();
}

export function insertSubmissionRelationship(
  db: Db,
  values: Insertable<DB['submission_relationships']>,
): Promise<SubmissionRelationshipRow> {
  return db
    .insertInto('submission_relationships')
    .values(values)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function insertConsent(db: Db, values: Insertable<DB['consents']>): Promise<ConsentRow> {
  return db.insertInto('consents').values(values).returningAll().executeTakeFirstOrThrow();
}
