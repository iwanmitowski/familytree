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
import { projectionToFlow } from './projection-to-flow';
import { layoutFlow } from './layout';
import { personYears, unionTypeLabel } from './labels';
import { PersonNode } from './nodes/PersonNode';
import { UnionNode } from './nodes/UnionNode';
import { Button } from '@/components/ui/button';

const nodeTypes = { person: PersonNode, union: UnionNode };

export function TreeCanvas({ projection }: { projection: TreeProjection }) {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner projection={projection} />
    </ReactFlowProvider>
  );
}

function TreeCanvasInner({ projection }: { projection: TreeProjection }) {
  const { fitView } = useReactFlow();
  const base = useMemo(() => projectionToFlow(projection), [projection]);
  // Keyed by the base graph it was computed for, so a stale result never renders
  // against a newer projection (and we avoid resetting state synchronously).
  const [laid, setLaid] = useState<{ base: typeof base; nodes: Node<PersonNodeData>[] } | null>(null);
  const [selected, setSelected] = useState<TreeNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    layoutFlow(base)
      .then((nodes) => {
        if (!cancelled) setLaid({ base, nodes });
      })
      .catch(() => {
        // Last-resort: render unpositioned so the canvas is never blank.
        if (!cancelled) setLaid({ base, nodes: base.nodes });
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  const nodes = laid?.base === base ? laid.nodes : null;
  const edges: Edge[] = base.edges;

  return (
    <div className="relative h-full w-full">
      {nodes === null && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
          <p className="text-sm text-muted-foreground">Подреждане на дървото…</p>
        </div>
      )}
      <ReactFlow
        nodes={nodes ?? []}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_e, node) => setSelected((node.data as PersonNodeData).node)}
        onPaneClick={() => setSelected(null)}
      >
        <Background />
        <Controls showInteractive={false} />
        <Panel position="top-right" className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => fitView({ duration: 400 })}>
            Побери
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fitView({ duration: 400, nodes: [{ id: projection.rootPersonId }] })}
          >
            Центрирай
          </Button>
        </Panel>
        {selected && (
          <Panel position="bottom-left" className="max-w-xs rounded-lg border bg-card p-3 shadow-md">
            <NodeInfo node={selected} />
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

function NodeInfo({ node }: { node: TreeNode }) {
  if (node.type === 'union') {
    return <p className="text-sm font-medium">{unionTypeLabel(node.unionType)}</p>;
  }
  const years = personYears(node);
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{node.label || 'Без име'}</p>
      {years && <p className="text-xs text-muted-foreground">{years}</p>}
      {node.sourceCount != null && node.sourceCount > 0 && (
        <p className="text-xs text-muted-foreground">Източници: {node.sourceCount}</p>
      )}
    </div>
  );
}
