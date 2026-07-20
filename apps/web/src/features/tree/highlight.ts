import type { TreeProjection } from './types';

export interface RelationshipResult {
  connected: boolean;
  relationshipLabelBg: string | null;
  confidence: number | null;
  commonAncestors?: string[];
  path?: { personId: string; relation: 'parent' | 'child' | 'partner' }[];
}

export interface Highlight {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/**
 * Highlight set for a relationship path: the path's person nodes, the union
 * nodes that sit between two path persons, and the edges among them. Everything
 * else is dimmed by the canvas (idea.md §11/§14).
 */
export function computeHighlight(projection: TreeProjection, pathPersonIds: string[]): Highlight {
  const persons = new Set(pathPersonIds);
  const isUnion = new Map(projection.nodes.map((n) => [n.id, n.type === 'union']));

  // Count highlighted-person neighbours per union.
  const unionHits = new Map<string, number>();
  for (const e of projection.edges) {
    for (const [node, other] of [
      [e.source, e.target],
      [e.target, e.source],
    ] as const) {
      if (isUnion.get(node) && persons.has(other)) unionHits.set(node, (unionHits.get(node) ?? 0) + 1);
    }
  }
  const nodeIds = new Set(persons);
  for (const [union, hits] of unionHits) if (hits >= 2) nodeIds.add(union);

  const edgeIds = new Set<string>();
  for (const e of projection.edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) edgeIds.add(e.id);
  }
  return { nodeIds, edgeIds };
}

// --- Relationship-path mode reducer ---

export interface PathState {
  active: boolean;
  a: string | null;
  b: string | null;
  result: RelationshipResult | null;
}

export type PathAction =
  | { type: 'start' }
  | { type: 'pick'; id: string }
  | { type: 'result'; result: RelationshipResult }
  | { type: 'clear' };

export const initialPathState: PathState = { active: false, a: null, b: null, result: null };

export function pathReducer(state: PathState, action: PathAction): PathState {
  switch (action.type) {
    case 'start':
      return { active: true, a: null, b: null, result: null };
    case 'pick':
      if (!state.active) return state;
      if (!state.a) return { ...state, a: action.id };
      if (!state.b && action.id !== state.a) return { ...state, b: action.id };
      return state;
    case 'result':
      return { ...state, result: action.result };
    case 'clear':
      return initialPathState;
    default:
      return state;
  }
}
