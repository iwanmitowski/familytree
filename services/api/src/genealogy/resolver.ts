import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { getPerson } from '../people/repo';
import { commonAncestors } from './queries';
import { classifyKinship } from './kinship-labels';

type Db = Kysely<DB>;

export interface PathStep {
  personId: string;
  relation: 'parent' | 'child' | 'partner';
}

export interface RelationshipPath {
  connected: boolean;
  relationshipLabelBg: string | null;
  commonAncestors: string[];
  path: PathStep[];
  confidence: number | null;
}

export type ResolveResult =
  | { ok: true; result: RelationshipPath }
  | { ok: false; kind: 'unknown_person' };

interface Graph {
  parents: Map<string, string[]>; // child -> parents
  children: Map<string, string[]>; // parent -> children
  partners: Map<string, string[]>; // person -> partners
}

async function buildGraph(db: Db): Promise<Graph> {
  const edges = await db
    .selectFrom('parent_child_relationships as pcr')
    .innerJoin('people as pp', 'pp.id', 'pcr.parent_id')
    .innerJoin('people as cp', 'cp.id', 'pcr.child_id')
    .select(['pcr.parent_id', 'pcr.child_id'])
    .where('pcr.verification_status', '=', 'confirmed')
    .where('pp.merged_into_person_id', 'is', null)
    .where('pp.deleted_at', 'is', null)
    .where('cp.merged_into_person_id', 'is', null)
    .where('cp.deleted_at', 'is', null)
    .execute();

  const partnerRows = await db
    .selectFrom('union_partners as up1')
    .innerJoin('union_partners as up2', 'up2.union_id', 'up1.union_id')
    .select(['up1.person_id as a', 'up2.person_id as b'])
    .execute()
    .then((rows) => rows.filter((r) => r.a !== r.b));

  const graph: Graph = { parents: new Map(), children: new Map(), partners: new Map() };
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };
  for (const e of edges) {
    push(graph.parents, e.child_id, e.parent_id);
    push(graph.children, e.parent_id, e.child_id);
  }
  for (const p of partnerRows) push(graph.partners, p.a, p.b);
  return graph;
}

/** Shortest path A→B over parent/child/partner edges (BFS). */
function bfs(graph: Graph, a: string, b: string, maxNodes = 5000): PathStep[] | null {
  if (a === b) return [];
  const prev = new Map<string, { from: string; relation: PathStep['relation'] }>();
  const queue = [a];
  const seen = new Set([a]);
  let visited = 0;

  while (queue.length && visited < maxNodes) {
    const cur = queue.shift()!;
    visited += 1;
    const neighbors: [string, PathStep['relation']][] = [
      ...(graph.parents.get(cur) ?? []).map((p) => [p, 'parent'] as [string, PathStep['relation']]),
      ...(graph.children.get(cur) ?? []).map((ch) => [ch, 'child'] as [string, PathStep['relation']]),
      ...(graph.partners.get(cur) ?? []).map((pt) => [pt, 'partner'] as [string, PathStep['relation']]),
    ];
    for (const [next, relation] of neighbors) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { from: cur, relation });
      if (next === b) {
        const steps: PathStep[] = [];
        let node = b;
        while (node !== a) {
          const p = prev.get(node)!;
          steps.unshift({ personId: node, relation: p.relation });
          node = p.from;
        }
        return steps;
      }
      queue.push(next);
    }
  }
  return null;
}

/**
 * Resolves the kinship between two people (idea.md §11): a blood relation is
 * labeled from the closest common ancestor; otherwise a connection through a
 * partner edge is reported as a through-marriage relation. Biological
 * relationships are kept distinct from those through marriage.
 */
export async function resolveRelationship(
  db: Db,
  aId: string,
  bId: string,
  maxDepth = 6,
): Promise<ResolveResult> {
  const [a, b] = await Promise.all([getPerson(db, aId), getPerson(db, bId)]);
  if (!a || a.deleted_at || a.merged_into_person_id) return { ok: false, kind: 'unknown_person' };
  if (!b || b.deleted_at || b.merged_into_person_id) return { ok: false, kind: 'unknown_person' };

  if (aId === bId) {
    return { ok: true, result: { connected: true, relationshipLabelBg: 'същият човек', commonAncestors: [], path: [], confidence: 100 } };
  }

  const graph = await buildGraph(db);
  const path = bfs(graph, aId, bId);
  if (!path) {
    return { ok: true, result: { connected: false, relationshipLabelBg: null, commonAncestors: [], path: [], confidence: null } };
  }

  const common = await commonAncestors(db, aId, bId, maxDepth);
  const partnerHops = path.filter((s) => s.relation === 'partner').length;

  if (common.length > 0 && partnerHops === 0) {
    const closest = common[0]!;
    const label = classifyKinship(closest.depthA, closest.depthB);
    return {
      ok: true,
      result: {
        connected: true,
        relationshipLabelBg: label,
        commonAncestors: common.filter((c) => c.depthA + c.depthB === closest.depthA + closest.depthB).map((c) => c.ancestorId),
        path,
        confidence: 100, // path uses only confirmed biological edges
      },
    };
  }

  // Connection through marriage (a partner hop on the path).
  return {
    ok: true,
    result: {
      connected: true,
      relationshipLabelBg: 'роднина по сватовство',
      commonAncestors: [],
      path,
      confidence: Math.max(30, 90 - (partnerHops - 1) * 10),
    },
  };
}
