import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;

/**
 * Would adding an edge parent → child create an ancestry cycle (idea.md §12)?
 * True when `parentId` is already a descendant of `childId` (i.e. `childId`
 * appears among the ancestors of `parentId`), or when parent === child.
 *
 * The ancestor walk follows proposed + confirmed edges (pending edges also
 * block cycles for safety); disputed/rejected edges are ignored. Must run
 * inside the same transaction as the insert/confirm.
 */
export async function wouldCreateCycle(
  db: Db,
  parentId: string,
  childId: string,
): Promise<boolean> {
  if (parentId === childId) return true;

  const result = await sql<{ id: string }>`
    WITH RECURSIVE ancestors(id) AS (
      SELECT parent_id FROM parent_child_relationships
        WHERE child_id = ${parentId}
          AND verification_status IN ('proposed', 'confirmed')
      UNION
      SELECT pcr.parent_id FROM parent_child_relationships pcr
        JOIN ancestors a ON pcr.child_id = a.id
        WHERE pcr.verification_status IN ('proposed', 'confirmed')
    )
    SELECT id FROM ancestors WHERE id = ${childId} LIMIT 1
  `.execute(db);

  return result.rows.length > 0;
}

/**
 * Serializes concurrent edge writes for a pair of people using a transaction
 * advisory lock keyed on the sorted id pair, so two racing inserts of A→B and
 * B→A cannot both pass the cycle check.
 */
export async function lockPersonPair(db: Db, a: string, b: string): Promise<void> {
  // Two int4 keys (hashtext returns int4) → the two-argument advisory-lock
  // overload. Sorting the pair makes A/B and B/A take the same lock.
  const [lo, hi] = a < b ? [a, b] : [b, a];
  await sql`SELECT pg_advisory_xact_lock(hashtext(${lo}), hashtext(${hi}))`.execute(db);
}
