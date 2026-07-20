'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { PersonNodeData, TreeNode, TreeProjection } from './types';
import type { Highlight } from './highlight';
import { projectionToFlow } from './projection-to-flow';
import { layoutFlow } from './layout';
import { PersonNode } from './nodes/PersonNode';
import { UnionNode } from './nodes/UnionNode';
import { Button } from '@/components/ui/button';

const nodeTypes = { person: PersonNode, union: UnionNode };

export interface TreeCanvasProps {
  projection: TreeProjection;
  highlight?: Highlight | null;
  collapsedIds: ReadonlySet<string>;
  collapsibleIds: ReadonlySet<string>;
  boundaryIds: ReadonlySet<string>;
  onSelect: (node: TreeNode) => void;
  onReRoot: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onLoadMore: (id: string) => void;
}

export function TreeCanvas(props: TreeCanvasProps) {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function TreeCanvasInner({
  projection, highlight, collapsedIds, collapsibleIds, boundaryIds,
  onSelect, onReRoot, onToggleCollapse, onLoadMore,
}: TreeCanvasProps) {
  const { fitView } = useReactFlow();
  const base = useMemo(() => projectionToFlow(projection), [projection]);
  const [laid, setLaid] = useState<{ base: typeof base; nodes: Node<PersonNodeData>[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    layoutFlow(base)
      .then((nodes) => !cancelled && setLaid({ base, nodes }))
      .catch(() => !cancelled && setLaid({ base, nodes: base.nodes }));
    return () => {
      cancelled = true;
    };
  }, [base]);

  const laidNodes = laid?.base === base ? laid.nodes : null;

  const nodes = useMemo<Node<PersonNodeData>[]>(() => {
    if (!laidNodes) return [];
    return laidNodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        dimmed: !!highlight && !highlight.nodeIds.has(n.id),
        collapsible: collapsibleIds.has(n.id),
        collapsed: collapsedIds.has(n.id),
        onToggleCollapse,
        onLoadMore: boundaryIds.has(n.id) ? onLoadMore : undefined,
      },
    }));
  }, [laidNodes, highlight, collapsedIds, collapsibleIds, boundaryIds, onToggleCollapse, onLoadMore]);

  const edges = useMemo<Edge[]>(
    () =>
      base.edges.map((e) => {
        const on = highlight ? highlight.edgeIds.has(e.id) : true;
        return {
          ...e,
          style: {
            ...e.style,
            opacity: on ? 1 : 0.12,
            stroke: highlight && on ? 'var(--color-primary, #2563eb)' : undefined,
            strokeWidth: highlight && on ? 2.5 : (e.style?.strokeWidth ?? 1.5),
          },
        };
      }),
    [base.edges, highlight],
  );

  return (
    <div className="relative h-full w-full">
      {laidNodes === null && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
          <p className="text-sm text-muted-foreground">Подреждане на дървото…</p>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_e, node) => onSelect((node.data as PersonNodeData).node)}
        onNodeDoubleClick={(_e, node) => {
          if ((node.data as PersonNodeData).node.type === 'person') onReRoot(node.id);
        }}
      >
        <Background />
        <Controls showInteractive={false} />
        <Panel position="top-right" className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => fitView({ duration: 400 })}>Побери</Button>
          <Button size="sm" variant="outline" onClick={() => fitView({ duration: 400, nodes: [{ id: projection.rootPersonId }] })}>
            Центрирай
          </Button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
