// Mirrors the API tree projection (services/api/src/genealogy/projection.ts).

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

/** Data carried on a React Flow person/union node. */
export interface PersonNodeData extends Record<string, unknown> {
  node: TreeNode;
  isRoot: boolean;
}
