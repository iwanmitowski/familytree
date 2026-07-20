import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReactFlowProvider, type Node, type NodeProps } from '@xyflow/react';
import { projectionToFlow, toElkGraph } from './projection-to-flow';
import { PersonNode } from './nodes/PersonNode';
import type { PersonNodeData, TreeNode, TreeProjection } from './types';

const PROJECTION: TreeProjection = {
  rootPersonId: 'self',
  truncated: false,
  nodes: [
    { id: 'gf', type: 'person', label: 'Дядо', birthYear: 1900, deathYear: 1970, living: false, generation: -1, sourceCount: 2 },
    { id: 'gm', type: 'person', label: 'Баба', birthYear: 1905, deathYear: 1980, living: false, generation: -1 },
    { id: 'u1', type: 'union', unionType: 'marriage', generation: -1 },
    { id: 'self', type: 'person', label: 'Аз', birthYear: 1950, living: true, generation: 0 },
  ],
  edges: [
    { id: 'e1', source: 'gf', target: 'u1', type: 'partner' },
    { id: 'e2', source: 'gm', target: 'u1', type: 'partner' },
    { id: 'e3', source: 'u1', target: 'self', type: 'child', verificationStatus: 'proposed' },
  ],
};

afterEach(cleanup);

describe('projectionToFlow', () => {
  it('maps person and union nodes with the root flagged', () => {
    const { nodes, edges } = projectionToFlow(PROJECTION);
    expect(nodes).toHaveLength(4);
    expect(nodes.find((n) => n.id === 'u1')!.type).toBe('union');
    expect(nodes.find((n) => n.id === 'self')!.type).toBe('person');
    expect(nodes.find((n) => n.id === 'self')!.data.isRoot).toBe(true);
    expect(nodes.find((n) => n.id === 'gf')!.data.isRoot).toBe(false);
    expect(edges).toHaveLength(3);
  });

  it('dashes proposed child edges and labels them предложена', () => {
    const { edges } = projectionToFlow(PROJECTION);
    const proposed = edges.find((e) => e.id === 'e3')!;
    expect(proposed.label).toBe('предложена');
    expect((proposed.style as { strokeDasharray?: string }).strokeDasharray).toBe('6 4');
  });
});

describe('toElkGraph', () => {
  it('assigns one ELK partition per generation and wires union edges', () => {
    const graph = toElkGraph(projectionToFlow(PROJECTION));
    // minGeneration is -1, so ancestors land in partition 0 and the root in 1.
    const gf = graph.children.find((c) => c.id === 'gf')!;
    const self = graph.children.find((c) => c.id === 'self')!;
    expect(gf.layoutOptions!['elk.partitioning.partition']).toBe('0');
    expect(self.layoutOptions!['elk.partitioning.partition']).toBe('1');
    expect(graph.edges.find((e) => e.id === 'e3')).toMatchObject({ sources: ['u1'], targets: ['self'] });
  });
});

function renderPersonNode(node: TreeNode, isRoot = false) {
  const props = {
    id: node.id,
    type: 'person',
    data: { node, isRoot } satisfies PersonNodeData,
    selected: false,
    dragging: false,
    isConnectable: false,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    width: 190,
    height: 68,
  } as unknown as NodeProps<Node<PersonNodeData>>;
  return render(
    <ReactFlowProvider>
      <PersonNode {...props} />
    </ReactFlowProvider>,
  );
}

describe('PersonNode', () => {
  it('renders a full deceased person with years and a source chip', () => {
    renderPersonNode({ id: 'gf', type: 'person', label: 'Дядо', birthYear: 1900, deathYear: 1970, living: false, generation: -1, sourceCount: 2 });
    expect(screen.getByText('Дядо')).toBeInTheDocument();
    expect(screen.getByText('1900 – 1970')).toBeInTheDocument();
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it('renders a masked living member without a year', () => {
    renderPersonNode({ id: 'x', type: 'person', label: 'Жив член на семейството', birthYear: null, deathYear: null, living: true, generation: 0 });
    expect(screen.getByText('Жив член на семейството')).toBeInTheDocument();
    expect(screen.queryByText(/\d{4}/)).not.toBeInTheDocument();
  });
});
