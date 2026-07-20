import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { getSubmission } from './repo';

type Db = Kysely<DB>;

export type SuggestionStatus = 'ready' | 'missing_person' | 'already_exists';

interface Endpoint {
  localKey: string;
  personId: string | null;
  label: string;
}

export interface SuggestedRelationship {
  kind: 'parent_child' | 'union' | 'sibling_hint';
  viaLocalKeys: [string, string];
  /** parent_child: a = parent, b = child. union: the two partners. sibling_hint: SELF + sibling. */
  a: Endpoint;
  b: Endpoint;
  relationshipType?: string;
  status: SuggestionStatus;
  missingLocalKeys: string[];
}

/**
 * Turns a submission's stored relationships into canonical edge suggestions
 * using each person's resolved `matched_person_id` (idea.md §7, §11).
 *
 * - `parent`  (from=child, to=parent)  → parent_child edge parent→child
 * - `child`   (from=parent, to=child)  → parent_child edge parent→child
 * - `partner`                          → union suggestion
 * - `sibling`                          → shared-parent HINT (never a stored edge)
 * - `other`                            → skipped (no canonical meaning)
 */
export async function suggestedRelationships(
  db: Db,
  submissionId: string,
): Promise<{ items: SuggestedRelationship[] } | null> {
  const submission = await getSubmission(db, submissionId);
  if (!submission) return null;

  const people = await db
    .selectFrom('submission_people')
    .select(['local_key', 'first_name', 'surname', 'nickname', 'matched_person_id'])
    .where('submission_id', '=', submissionId)
    .execute();
  const byKey = new Map(people.map((p) => [p.local_key, p]));
  const endpoint = (localKey: string): Endpoint => {
    const p = byKey.get(localKey);
    const label = p
      ? [p.first_name, p.surname].filter(Boolean).join(' ') || p.nickname || localKey
      : localKey;
    return { localKey, personId: p?.matched_person_id ?? null, label };
  };

  const rels = await db
    .selectFrom('submission_relationships')
    .select(['from_local_key', 'to_local_key', 'relationship_type'])
    .where('submission_id', '=', submissionId)
    .execute();

  const items: SuggestedRelationship[] = [];
  for (const rel of rels) {
    const from = endpoint(rel.from_local_key);
    const to = endpoint(rel.to_local_key);
    const via: [string, string] = [rel.from_local_key, rel.to_local_key];

    if (rel.relationship_type === 'parent' || rel.relationship_type === 'child') {
      // Orient so `a` is the parent and `b` is the child.
      const parent = rel.relationship_type === 'parent' ? to : from;
      const child = rel.relationship_type === 'parent' ? from : to;
      const missing = missingKeys([parent, child]);
      let status: SuggestionStatus = missing.length ? 'missing_person' : 'ready';
      if (status === 'ready' && (await edgeExists(db, parent.personId!, child.personId!))) {
        status = 'already_exists';
      }
      items.push({ kind: 'parent_child', viaLocalKeys: via, a: parent, b: child, relationshipType: 'biological', status, missingLocalKeys: missing });
    } else if (rel.relationship_type === 'partner') {
      const missing = missingKeys([from, to]);
      let status: SuggestionStatus = missing.length ? 'missing_person' : 'ready';
      if (status === 'ready' && (await shareUnion(db, from.personId!, to.personId!))) {
        status = 'already_exists';
      }
      items.push({ kind: 'union', viaLocalKeys: via, a: from, b: to, status, missingLocalKeys: missing });
    } else if (rel.relationship_type === 'sibling') {
      // Siblings derive from shared parents — surfaced as a hint, never an edge.
      items.push({ kind: 'sibling_hint', viaLocalKeys: via, a: from, b: to, status: 'ready', missingLocalKeys: [] });
    }
    // 'other' has no canonical edge meaning — skipped.
  }

  return { items };
}

function missingKeys(endpoints: Endpoint[]): string[] {
  return endpoints.filter((e) => !e.personId).map((e) => e.localKey);
}

async function edgeExists(db: Db, parentId: string, childId: string): Promise<boolean> {
  const row = await db
    .selectFrom('parent_child_relationships')
    .select('id')
    .where('parent_id', '=', parentId)
    .where('child_id', '=', childId)
    .limit(1)
    .executeTakeFirst();
  return !!row;
}

/** True if both people are already partners in the same family union. */
async function shareUnion(db: Db, aId: string, bId: string): Promise<boolean> {
  const row = await db
    .selectFrom('union_partners as ua')
    .innerJoin('union_partners as ub', 'ub.union_id', 'ua.union_id')
    .select('ua.union_id')
    .where('ua.person_id', '=', aId)
    .where('ub.person_id', '=', bId)
    .limit(1)
    .executeTakeFirst();
  return !!row;
}
