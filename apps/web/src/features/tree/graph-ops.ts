import type { TreeEdge, TreeNode, TreeProjection } from './types';

/**
 * Merges a newly fetched projection into the current one, de-duplicating nodes
 * and edges by id (idea.md §14 — "load more" anchored at a boundary node). The
 * original root is kept; newer node data wins on id collisions.
 */
export function mergeProjections(current: TreeProjection, incoming: TreeProjection): TreeProjection {
  const nodes = new Map<string, TreeNode>();
  for (const n of current.nodes) nodes.set(n.id, n);
  for (const n of incoming.nodes) nodes.set(n.id, n);

  const edges = new Map<string, TreeEdge>();
  for (const e of current.edges) edges.set(e.id, e);
  for (const e of incoming.edges) edges.set(e.id, e);

  return {
    rootPersonId: current.rootPersonId,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    truncated: current.truncated || incoming.truncated,
  };
}

/** Direct children of a person: via direct child edges and via their unions. */
export function childrenOf(projection: TreeProjection, personId: string): string[] {
  const kids: string[] = [];
  const unions = new Set<string>();
  for (const e of projection.edges) {
    if (e.type === 'child' && e.source === personId) kids.push(e.target);
    if (e.type === 'partner' && e.source === personId) unions.add(e.target);
  }
  for (const e of projection.edges) {
    if (e.type === 'child' && unions.has(e.source)) kids.push(e.target);
  }
  return [...new Set(kids)];
}

/**
 * Node ids hidden when the given nodes are collapsed: the whole descendant
 * subtree of each collapsed node (unions treated as pass-through), plus any
 * union node left with no visible person neighbour.
 */
export function computeHidden(projection: TreeProjection, collapsed: ReadonlySet<string>): Set<string> {
  const hidden = new Set<string>();
  const frontier: string[] = [];
  for (const id of collapsed) frontier.push(...childrenOf(projection, id));

  while (frontier.length) {
    const id = frontier.pop()!;
    if (hidden.has(id)) continue;
    hidden.add(id);
    frontier.push(...childrenOf(projection, id));
  }

  // Drop union nodes whose every neighbour is hidden.
  const unionNeighbours = new Map<string, string[]>();
  for (const e of projection.edges) {
    for (const u of [e.source, e.target]) {
      const node = projection.nodes.find((n) => n.id === u);
      if (node?.type === 'union') {
        const other = u === e.source ? e.target : e.source;
        unionNeighbours.set(u, [...(unionNeighbours.get(u) ?? []), other]);
      }
    }
  }
  for (const [union, neighbours] of unionNeighbours) {
    if (neighbours.every((n) => hidden.has(n))) hidden.add(union);
  }
  return hidden;
}

/** Projection with the hidden nodes (and their incident edges) removed. */
export function visibleProjection(projection: TreeProjection, hidden: ReadonlySet<string>): TreeProjection {
  if (hidden.size === 0) return projection;
  return {
    ...projection,
    nodes: projection.nodes.filter((n) => !hidden.has(n.id)),
    edges: projection.edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)),
  };
}

/** Direct parents of a person: via direct child edges and via unions. */
export function parentsOf(projection: TreeProjection, personId: string): string[] {
  const unions = new Set<string>();
  const parents: string[] = [];
  for (const e of projection.edges) {
    if (e.type === 'child' && e.target === personId) unions.add(e.source);
  }
  for (const u of unions) {
    const node = projection.nodes.find((n) => n.id === u);
    if (node?.type === 'union') {
      for (const e of projection.edges) {
        if (e.type === 'partner' && e.target === u) parents.push(e.source);
      }
    } else {
      parents.push(u); // direct parent→child edge (no union)
    }
  }
  return [...new Set(parents)];
}

/** Person nodes that have at least one visible descendant (collapse targets). */
export function collapsibleIds(projection: TreeProjection): Set<string> {
  const ids = new Set<string>();
  for (const n of projection.nodes) {
    if (n.type === 'person' && childrenOf(projection, n.id).length > 0) ids.add(n.id);
  }
  return ids;
}
