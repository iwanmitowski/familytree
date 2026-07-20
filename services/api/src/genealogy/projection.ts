import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { getPerson } from '../people/repo';
import { ancestors, descendants } from './queries';
import { redactTreeNode, type View } from '../privacy/redact';

type Db = Kysely<DB>;

const MAX_NODES = 400;

export interface TreeNode {
  id: string;
  type: 'person' | 'union';
  label?: string | null;
  birthYear?: number | null;
  deathYear?: number | null;
  living?: boolean | null;
  generation: number;
  privacyLevel?: string;
  unionType?: string;
  verificationState?: string;
  sourceCount?: number | null;
}

export interface TreeEdge {
  id: string;
  source: string;
  target: string;
  type: 'partner' | 'child';
  relationshipType?: string;
  verificationStatus?: string;
}

export interface TreeProjection {
  rootPersonId: string;
  nodes: TreeNode[];
  edges: TreeEdge[];
  truncated: boolean;
}

export interface ProjectionOptions {
  ancestors?: number;
  descendants?: number;
  includePartners?: boolean;
  includeSiblings?: boolean;
  /** 'public' redacts person nodes through PersonRedactionService (idea.md §15). */
  view?: View;
}

/**
 * Flat nodes + edges projection of the canonical graph (idea.md §13). Person
 * nodes are deduplicated (pedigree collapse yields one node with many edges),
 * partnerships become synthetic union nodes, and generations follow the §14
 * convention (root 0, parents -1, children +1). Capped at MAX_NODES with a
 * `truncated` flag. A merged root projects the target's tree.
 */
export async function buildTreeProjection(
  db: Db,
  rootIdInput: string,
  opts: ProjectionOptions = {},
): Promise<TreeProjection | undefined> {
  const rootPerson = await getPerson(db, rootIdInput);
  if (!rootPerson || rootPerson.deleted_at) return undefined;
  const rootId = rootPerson.merged_into_person_id ?? rootIdInput;

  const aDepth = Math.max(0, Math.min(opts.ancestors ?? 4, 6));
  const dDepth = Math.max(0, Math.min(opts.descendants ?? 2, 6));
  const includePartners = opts.includePartners ?? true;
  const includeSiblings = opts.includeSiblings ?? false;

  // generation: root 0, ancestors negative, descendants positive.
  const generation = new Map<string, number>([[rootId, 0]]);
  for (const a of await ancestors(db, rootId, aDepth)) setGen(generation, a.id, -a.depth);
  for (const d of await descendants(db, rootId, dDepth)) setGen(generation, d.id, d.depth);

  // Siblings: other confirmed children of the root's parents, at generation 0.
  if (includeSiblings) {
    const parents = await db
      .selectFrom('parent_child_relationships')
      .select('parent_id')
      .where('child_id', '=', rootId)
      .where('verification_status', '=', 'confirmed')
      .execute();
    for (const p of parents) {
      const sibs = await db
        .selectFrom('parent_child_relationships')
        .select('child_id')
        .where('parent_id', '=', p.parent_id)
        .where('verification_status', '=', 'confirmed')
        .execute();
      for (const s of sibs) setGen(generation, s.child_id, 0);
    }
  }

  // Partners of included people share their generation.
  const unions = new Map<string, { unionType: string; generation: number }>();
  if (includePartners) {
    const includedIds = [...generation.keys()];
    const partnerRows = await db
      .selectFrom('union_partners as up')
      .innerJoin('family_unions as u', 'u.id', 'up.union_id')
      .innerJoin('union_partners as up2', 'up2.union_id', 'up.union_id')
      .select(['up.union_id', 'u.union_type', 'up.person_id', 'up2.person_id as partner_id'])
      .where('up.person_id', 'in', includedIds)
      .execute();
    for (const row of partnerRows) {
      const gen = generation.get(row.person_id) ?? 0;
      if (!generation.has(row.partner_id)) setGen(generation, row.partner_id, gen);
      const existing = unions.get(row.union_id);
      const unionGen = Math.min(existing?.generation ?? gen, gen);
      unions.set(row.union_id, { unionType: row.union_type, generation: unionGen });
    }
  }

  // Truncate people to the node cap (union nodes are added on top).
  let truncated = false;
  let personIds = [...generation.keys()];
  if (personIds.length > MAX_NODES) {
    truncated = true;
    personIds = personIds
      .sort((x, y) => Math.abs(generation.get(x)!) - Math.abs(generation.get(y)!))
      .slice(0, MAX_NODES);
  }
  const included = new Set(personIds);

  // Person nodes.
  const nodes: TreeNode[] = [];
  for (const id of personIds) {
    nodes.push(await personNode(db, id, generation.get(id)!));
  }

  // Union nodes (only unions with a partner in the included set).
  const includedUnions = new Set<string>();
  for (const [unionId, u] of unions) {
    const partners = await db.selectFrom('union_partners').select('person_id').where('union_id', '=', unionId).execute();
    if (!partners.some((p) => included.has(p.person_id))) continue;
    includedUnions.add(unionId);
    nodes.push({ id: unionId, type: 'union', unionType: u.unionType, generation: u.generation });
  }

  // Edges.
  const edges: TreeEdge[] = [];
  // Partner edges: person -> union.
  for (const unionId of includedUnions) {
    const partners = await db.selectFrom('union_partners').selectAll().where('union_id', '=', unionId).execute();
    for (const p of partners) {
      if (included.has(p.person_id)) {
        edges.push({ id: `pe-${p.id}`, source: p.person_id, target: unionId, type: 'partner' });
      }
    }
  }
  // Child edges (confirmed + proposed), among included people.
  const childEdges = await db
    .selectFrom('parent_child_relationships')
    .selectAll()
    .where('verification_status', 'in', ['confirmed', 'proposed'])
    .where('parent_id', 'in', personIds)
    .where('child_id', 'in', personIds)
    .execute();
  for (const e of childEdges) {
    if (e.family_union_id && includedUnions.has(e.family_union_id)) {
      edges.push({ id: `ce-${e.id}`, source: e.family_union_id, target: e.child_id, type: 'child', relationshipType: e.relationship_type, verificationStatus: e.verification_status });
    } else {
      edges.push({ id: `ce-${e.id}`, source: e.parent_id, target: e.child_id, type: 'child', relationshipType: e.relationship_type, verificationStatus: e.verification_status });
    }
  }

  const view: View = opts.view ?? 'admin';
  const redactedNodes = view === 'public' ? nodes.map((n) => redactTreeNode(n, view)) : nodes;

  return { rootPersonId: rootId, nodes: redactedNodes, edges, truncated };
}

function setGen(map: Map<string, number>, id: string, gen: number): void {
  const existing = map.get(id);
  // Keep the generation closest to the root (smallest absolute value).
  if (existing === undefined || Math.abs(gen) < Math.abs(existing)) map.set(id, gen);
}

async function personNode(db: Db, id: string, generation: number): Promise<TreeNode> {
  const person = await getPerson(db, id);
  const name = await db
    .selectFrom('person_names')
    .select(['first_name', 'surname'])
    .where('person_id', '=', id)
    .where('is_preferred', '=', true)
    .orderBy('name_type')
    .executeTakeFirst();
  const birth = await yearOf(db, id, 'birth');
  const death = await yearOf(db, id, 'death');
  const sourceCount = (
    await db.selectFrom('evidence').select('source_id').distinct().where('subject_type', '=', 'person').where('subject_id', '=', id).execute()
  ).length;
  return {
    id,
    type: 'person',
    label: name ? [name.first_name, name.surname].filter(Boolean).join(' ') : null,
    birthYear: birth,
    deathYear: death,
    living: person?.living_status === 'living',
    generation,
    privacyLevel: person?.privacy_level,
    sourceCount,
  };
}

async function yearOf(db: Db, personId: string, type: 'birth' | 'death'): Promise<number | null> {
  const ev = await db
    .selectFrom('person_events')
    .select(['year_from'])
    .where('person_id', '=', personId)
    .where('event_type', '=', type)
    .executeTakeFirst();
  return ev?.year_from ?? null;
}
