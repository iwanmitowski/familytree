import { sql, type Insertable, type Kysely, type Selectable } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;
export type FileRow = Selectable<DB['files']>;

export function insertFile(db: Db, values: Insertable<DB['files']>): Promise<FileRow> {
  return db.insertInto('files').values(values).returningAll().executeTakeFirstOrThrow();
}

/** Active (not soft-deleted) file by id. */
export function getFile(db: Db, id: string): Promise<FileRow | undefined> {
  return db.selectFrom('files').selectAll().where('id', '=', id).where('deleted_at', 'is', null).executeTakeFirst();
}

export function listFilesByPerson(db: Db, personId: string): Promise<FileRow[]> {
  return db
    .selectFrom('files')
    .selectAll()
    .where('person_id', '=', personId)
    .where('deleted_at', 'is', null)
    .orderBy('created_at', 'desc')
    .execute();
}

export function listFilesBySource(db: Db, sourceId: string): Promise<FileRow[]> {
  return db
    .selectFrom('files')
    .selectAll()
    .where('source_id', '=', sourceId)
    .where('deleted_at', 'is', null)
    .orderBy('created_at', 'desc')
    .execute();
}

export async function softDeleteFile(db: Db, id: string): Promise<FileRow | undefined> {
  return db
    .updateTable('files')
    .set({ deleted_at: sql<Date>`now()` })
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirst();
}
