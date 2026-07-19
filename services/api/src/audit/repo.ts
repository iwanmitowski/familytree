import type { Insertable, Kysely, Selectable } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;
export type AuditEntryRow = Selectable<DB['audit_log']>;

/**
 * Append-only audit trail. Callers must pass safe metadata only — never
 * secrets, raw tokens, or raw IPs (idea.md §8).
 */
export function insertAuditEntry(
  db: Db,
  values: Insertable<DB['audit_log']>,
): Promise<AuditEntryRow> {
  return db.insertInto('audit_log').values(values).returningAll().executeTakeFirstOrThrow();
}
