import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/generated/db';

type Db = Kysely<DB>;

export interface AncestorRow {
  id: string;
  depth: number;
}

/**
 * Ancestors of a person over CONFIRMED parent-child edges, excluding
 * merged/deleted people (idea.md §11). Depth 1 = parent, 2 = grandparent, ...
 */
export async function ancestors(db: Db, personId: string, maxDepth = 6): Promise<AncestorRow[]> {
  const result = await sql<AncestorRow>`
    WITH RECURSIVE anc(id, depth) AS (
      SELECT pcr.parent_id, 1
        FROM parent_child_relationships pcr
        JOIN people p ON p.id = pcr.parent_id
        WHERE pcr.child_id = ${personId}
          AND pcr.verification_status = 'confirmed'
          AND p.merged_into_person_id IS NULL AND p.deleted_at IS NULL
      UNION
      SELECT pcr.parent_id, a.depth + 1
        FROM parent_child_relationships pcr
        JOIN anc a ON pcr.child_id = a.id
        JOIN people p ON p.id = pcr.parent_id
        WHERE pcr.verification_status = 'confirmed'
          AND p.merged_into_person_id IS NULL AND p.deleted_at IS NULL
          AND a.depth < ${maxDepth}
    )
    SELECT id, min(depth) AS depth FROM anc GROUP BY id
  `.execute(db);
  return result.rows.map((r) => ({ id: r.id, depth: Number(r.depth) }));
}

export interface DescendantRow {
  id: string;
  depth: number;
}

export async function descendants(db: Db, personId: string, maxDepth = 6): Promise<DescendantRow[]> {
  const result = await sql<DescendantRow>`
    WITH RECURSIVE des(id, depth) AS (
      SELECT pcr.child_id, 1
        FROM parent_child_relationships pcr
        JOIN people p ON p.id = pcr.child_id
        WHERE pcr.parent_id = ${personId}
          AND pcr.verification_status = 'confirmed'
          AND p.merged_into_person_id IS NULL AND p.deleted_at IS NULL
      UNION
      SELECT pcr.child_id, d.depth + 1
        FROM parent_child_relationships pcr
        JOIN des d ON pcr.parent_id = d.id
        JOIN people p ON p.id = pcr.child_id
        WHERE pcr.verification_status = 'confirmed'
          AND p.merged_into_person_id IS NULL AND p.deleted_at IS NULL
          AND d.depth < ${maxDepth}
    )
    SELECT id, min(depth) AS depth FROM des GROUP BY id
  `.execute(db);
  return result.rows.map((r) => ({ id: r.id, depth: Number(r.depth) }));
}

export interface CommonAncestorRow {
  ancestorId: string;
  depthA: number;
  depthB: number;
}

/**
 * Common ancestors of A and B (each with A's and B's depth to it), plus A and B
 * themselves at depth 0 so a direct-line relationship (A is B's ancestor) is
 * detected. Ordered by combined depth (closest first).
 */
export async function commonAncestors(
  db: Db,
  a: string,
  b: string,
  maxDepth = 6,
): Promise<CommonAncestorRow[]> {
  const [ancA, ancB] = await Promise.all([ancestors(db, a, maxDepth), ancestors(db, b, maxDepth)]);
  const depthA = new Map<string, number>([[a, 0], ...ancA.map((r) => [r.id, r.depth] as const)]);
  const depthB = new Map<string, number>([[b, 0], ...ancB.map((r) => [r.id, r.depth] as const)]);

  const rows: CommonAncestorRow[] = [];
  for (const [id, dA] of depthA) {
    const dB = depthB.get(id);
    if (dB !== undefined) rows.push({ ancestorId: id, depthA: dA, depthB: dB });
  }
  return rows.sort((x, y) => x.depthA + x.depthB - (y.depthA + y.depthB));
}
