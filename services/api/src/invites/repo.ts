import { sql, type Insertable, type Kysely, type Selectable } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;
export type InviteRow = Selectable<DB['invites']>;

export function insertInvite(db: Db, values: Insertable<DB['invites']>): Promise<InviteRow> {
  return db.insertInto('invites').values(values).returningAll().executeTakeFirstOrThrow();
}

export function getInviteById(db: Db, id: string): Promise<InviteRow | undefined> {
  return db.selectFrom('invites').selectAll().where('id', '=', id).executeTakeFirst();
}

export function getInviteByTokenHash(db: Db, tokenHash: string): Promise<InviteRow | undefined> {
  return db.selectFrom('invites').selectAll().where('token_hash', '=', tokenHash).executeTakeFirst();
}

export function listInvites(db: Db): Promise<InviteRow[]> {
  return db.selectFrom('invites').selectAll().orderBy('created_at', 'desc').execute();
}

/**
 * Atomically consumes one usage slot. Returns the updated row, or undefined
 * when the invite is revoked, expired, exhausted, or missing — the guard lives
 * in the WHERE clause so concurrent submits can never exceed max_submissions.
 */
export function incrementInviteUsage(db: Db, id: string): Promise<InviteRow | undefined> {
  return db
    .updateTable('invites')
    .set((eb) => ({ used_submissions: eb('used_submissions', '+', 1) }))
    .where('id', '=', id)
    .where('revoked_at', 'is', null)
    .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', sql<Date>`now()`)]))
    .whereRef('used_submissions', '<', 'max_submissions')
    .returningAll()
    .executeTakeFirst();
}

/**
 * Atomically consumes one usage slot by token hash. The guard lives in the
 * WHERE clause so concurrent submits can never exceed max_submissions or use a
 * revoked/expired invite. Returns undefined when no eligible row matched.
 */
export function consumeInviteByHash(db: Db, tokenHash: string): Promise<InviteRow | undefined> {
  return db
    .updateTable('invites')
    .set((eb) => ({ used_submissions: eb('used_submissions', '+', 1) }))
    .where('token_hash', '=', tokenHash)
    .where('revoked_at', 'is', null)
    .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', sql<Date>`now()`)]))
    .whereRef('used_submissions', '<', 'max_submissions')
    .returningAll()
    .executeTakeFirst();
}

/** Idempotent: an already revoked invite keeps its original revoked_at. */
export function revokeInvite(db: Db, id: string): Promise<InviteRow | undefined> {
  return db
    .updateTable('invites')
    .set({ revoked_at: sql<Date>`coalesce(revoked_at, now())` })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}
