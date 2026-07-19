import { sql, type Kysely, type Selectable } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;
export type IdempotencyKeyRow = Selectable<DB['idempotency_keys']>;

/**
 * Replay protection (idea.md §4): returns false when the nonce was already
 * used — the caller must reject the request.
 */
export async function insertNonce(
  db: Db,
  nonce: string,
  serviceId: string,
  expiresAt: Date,
): Promise<boolean> {
  const row = await db
    .insertInto('service_request_nonces')
    .values({ nonce, service_id: serviceId, expires_at: expiresAt })
    .onConflict((oc) => oc.column('nonce').doNothing())
    .returningAll()
    .executeTakeFirst();
  return row !== undefined;
}

export async function deleteExpiredNonces(db: Db): Promise<number> {
  const result = await db
    .deleteFrom('service_request_nonces')
    .where('expires_at', '<', sql<Date>`now()`)
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

/** Returns the stored record for a non-expired idempotency key. */
export function getIdempotencyKey(db: Db, key: string): Promise<IdempotencyKeyRow | undefined> {
  return db
    .selectFrom('idempotency_keys')
    .selectAll()
    .where('key', '=', key)
    .where('expires_at', '>', sql<Date>`now()`)
    .executeTakeFirst();
}

/** Claims an idempotency key; returns false when it already exists. */
export async function insertIdempotencyKey(
  db: Db,
  values: { key: string; service_id: string; request_hash: string; expires_at: Date },
): Promise<boolean> {
  const row = await db
    .insertInto('idempotency_keys')
    .values(values)
    .onConflict((oc) => oc.column('key').doNothing())
    .returningAll()
    .executeTakeFirst();
  return row !== undefined;
}

/** Stores the response to replay for retries with the same key + body. */
export async function setIdempotencyResponse(
  db: Db,
  key: string,
  responseStatus: number,
  responseBody: unknown,
): Promise<void> {
  await db
    .updateTable('idempotency_keys')
    .set({
      response_status: responseStatus,
      response_body: responseBody === undefined ? null : JSON.stringify(responseBody),
    })
    .where('key', '=', key)
    .execute();
}

export async function deleteExpiredIdempotencyKeys(db: Db): Promise<number> {
  const result = await db
    .deleteFrom('idempotency_keys')
    .where('expires_at', '<', sql<Date>`now()`)
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}
