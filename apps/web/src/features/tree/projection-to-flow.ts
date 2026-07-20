import type { Edge, Node } from '@xyflow/react';
import type { PersonNodeData, TreeEdge, TreeProjection } from './types';

export const PERSON_W = 190;
export const PERSON_H = 68;
export const UNION_SIZE = 26;

export interface FlowGraph {
  nodes: Node<PersonNodeData>[];
  edges: Edge[];
}

/** Minimal ELK graph shape (avoids depending on elkjs types in the transform). */
export interface ElkGraph {
  id: string;
  layoutOptions?: Record<string, string>;
  children: {
    id: string;
    width: number;
    height: number;
    x?: number;
    y?: number;
    layoutOptions?: Record<string, string>;
  }[];
  edges: { id: string; sources: string[]; targets: string[] }[];
}

const ADOPTIVE_LABELS: Record<string, string> = {
  adoptive: 'осиновяване',
  step: 'доведено',
  foster: 'приемно',
  guardian: 'настойник',
};

function toFlowEdge(e: TreeEdge): Edge {
  const proposed = e.verificationStatus === 'proposed';
  const rel = e.type === 'child' ? (ADOPTIVE_LABELS[e.relationshipType ?? ''] ?? undefined) : undefined;
  const label = rel ?? (proposed ? 'предложена' : undefined);
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'default',
    label,
    data: { treeType: e.type, verificationStatus: e.verificationStatus, relationshipType: e.relationshipType },
    style: { strokeDasharray: proposed ? '6 4' : undefined, strokeWidth: 1.5 },
  };
}

/**
 * Pure transform: projection → React Flow nodes/edges (unpositioned). Person
 * nodes are already deduplicated by the API (pedigree collapse), so each id maps
 * to exactly one visual node. Layout is applied separately (see layout.ts).
 */
export function projectionToFlow(projection: TreeProjection): FlowGraph {
  const nodes: Node<PersonNodeData>[] = projection.nodes.map((n) => {
    const isUnion = n.type === 'union';
    return {
      id: n.id,
      type: isUnion ? 'union' : 'person',
      position: { x: 0, y: 0 },
      data: { node: n, isRoot: n.id === projection.rootPersonId },
      width: isUnion ? UNION_SIZE : PERSON_W,
      height: isUnion ? UNION_SIZE : PERSON_H,
    };
  });
  return { nodes, edges: projection.edges.map(toFlowEdge) };
}

/**
 * Builds an ELK `layered` graph, forcing one layer per generation via ELK
 * partitions (ancestors above the root, descendants below — idea.md §14).
 */
export function toElkGraph(graph: FlowGraph): ElkGraph {
  const gens = graph.nodes.map((n) => n.data.node.generation);
  const minGen = gens.length ? Math.min(...gens) : 0;
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      'elk.spacing.nodeNode': '44',
      'elk.partitioning.activate': 'true',
    },
    children: graph.nodes.map((n) => ({
      id: n.id,
      width: (n.width as number) ?? PERSON_W,
      height: (n.height as number) ?? PERSON_H,
      layoutOptions: { 'elk.partitioning.partition': String(n.data.node.generation - minGen) },
    })),
    edges: graph.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
}

/** Applies ELK-computed coordinates back onto the React Flow nodes. */
export function applyElkPositions(graph: FlowGraph, laid: ElkGraph): Node<PersonNodeData>[] {
  const pos = new Map(laid.children.map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
  return graph.nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }));
}
