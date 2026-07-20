import { describe, expect, it } from 'vitest';
import { mergeProjections, computeHidden, visibleProjection, childrenOf, collapsibleIds } from './graph-ops';
import { viewModeParams } from './view-mode';
import { computeHighlight, pathReducer, initialPathState } from './highlight';
import type { TreeProjection } from './types';

// gf ─┐
//     u1 → dad → self → kid
// gm ─┘
const P: TreeProjection = {
  rootPersonId: 'self',
  truncated: false,
  nodes: [
    { id: 'gf', type: 'person', generation: -2 },
    { id: 'gm', type: 'person', generation: -2 },
    { id: 'u1', type: 'union', generation: -2 },
    { id: 'dad', type: 'person', generation: -1 },
    { id: 'self', type: 'person', generation: 0 },
    { id: 'kid', type: 'person', generation: 1 },
  ],
  edges: [
    { id: 'e1', source: 'gf', target: 'u1', type: 'partner' },
    { id: 'e2', source: 'gm', target: 'u1', type: 'partner' },
    { id: 'e3', source: 'u1', target: 'dad', type: 'child' },
    { id: 'e4', source: 'dad', target: 'self', type: 'child' },
    { id: 'e5', source: 'self', target: 'kid', type: 'child' },
  ],
};

describe('mergeProjections', () => {
  it('dedupes nodes and edges by id and keeps the original root', () => {
    const extra: TreeProjection = {
      rootPersonId: 'dad',
      truncated: true,
      nodes: [
        { id: 'dad', type: 'person', generation: 0, label: 'Татко' },
        { id: 'ggf', type: 'person', generation: -1 },
      ],
      edges: [
        { id: 'e3', source: 'u1', target: 'dad', type: 'child' },
        { id: 'e6', source: 'ggf', target: 'gf', type: 'child' },
      ],
    };
    const merged = mergeProjections(P, extra);
    expect(merged.rootPersonId).toBe('self');
    expect(merged.nodes).toHaveLength(7); // +ggf only
    expect(merged.nodes.find((n) => n.id === 'dad')!.label).toBe('Татко'); // newer wins
    expect(merged.edges).toHaveLength(6); // +e6 only
    expect(merged.truncated).toBe(true);
  });
});

describe('collapse', () => {
  it('childrenOf follows unions as pass-through', () => {
    expect(childrenOf(P, 'gf').sort()).toEqual(['dad']);
    expect(childrenOf(P, 'self')).toEqual(['kid']);
  });

  it('hides the descendant subtree and orphaned unions', () => {
    const hidden = computeHidden(P, new Set(['dad']));
    expect(hidden.has('self')).toBe(true);
    expect(hidden.has('kid')).toBe(true);
    expect(hidden.has('gf')).toBe(false);
    const visible = visibleProjection(P, hidden);
    expect(visible.nodes.map((n) => n.id).sort()).toEqual(['dad', 'gf', 'gm', 'u1']);
    expect(visible.edges.some((e) => e.source === 'self' || e.target === 'self')).toBe(false);
  });

  it('collapsibleIds are persons with visible children', () => {
    const ids = collapsibleIds(P);
    expect(ids.has('dad')).toBe(true);
    expect(ids.has('self')).toBe(true);
    expect(ids.has('kid')).toBe(false);
  });
});

describe('viewModeParams', () => {
  it('maps modes to ancestor/descendant depth', () => {
    expect(viewModeParams('ancestors', 4)).toEqual({ ancestors: 4, descendants: 0 });
    expect(viewModeParams('descendants', 4)).toEqual({ ancestors: 0, descendants: 4 });
    expect(viewModeParams('combined', 4)).toEqual({ ancestors: 4, descendants: 3 });
  });
});

describe('computeHighlight', () => {
  it('highlights path persons, the between-union, and connecting edges', () => {
    const { nodeIds, edgeIds } = computeHighlight(P, ['gf', 'dad']);
    expect(nodeIds.has('gf')).toBe(true);
    expect(nodeIds.has('dad')).toBe(true);
    expect(nodeIds.has('u1')).toBe(true); // union between two highlighted persons
    expect(nodeIds.has('self')).toBe(false);
    expect(edgeIds.has('e1')).toBe(true); // gf→u1
    expect(edgeIds.has('e3')).toBe(true); // u1→dad
    expect(edgeIds.has('e4')).toBe(false); // dad→self not highlighted
  });
});

describe('pathReducer', () => {
  it('walks start → pick A → pick B → result → clear', () => {
    let s = pathReducer(initialPathState, { type: 'start' });
    expect(s.active).toBe(true);
    s = pathReducer(s, { type: 'pick', id: 'a' });
    expect(s.a).toBe('a');
    s = pathReducer(s, { type: 'pick', id: 'a' }); // same id ignored for B
    expect(s.b).toBeNull();
    s = pathReducer(s, { type: 'pick', id: 'b' });
    expect(s.b).toBe('b');
    s = pathReducer(s, { type: 'result', result: { connected: true, relationshipLabelBg: 'братовчеди', confidence: 100 } });
    expect(s.result?.relationshipLabelBg).toBe('братовчеди');
    expect(pathReducer(s, { type: 'clear' })).toEqual(initialPathState);
  });

  it('ignores picks when inactive', () => {
    expect(pathReducer(initialPathState, { type: 'pick', id: 'x' })).toEqual(initialPathState);
  });
});
