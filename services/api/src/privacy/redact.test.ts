import { describe, expect, it } from 'vitest';
import { birthDecade, redactTreeNode } from './redact';
import type { TreeNode } from '../genealogy/projection';

const deceasedPublic: TreeNode = {
  id: 'p1', type: 'person', label: 'Иван Митовски', birthYear: 1950, deathYear: 2010,
  living: false, generation: 0, privacyLevel: 'public', sourceCount: 2,
};

describe('birthDecade', () => {
  it('formats the decade', () => {
    expect(birthDecade(1985)).toBe('1980-те');
    expect(birthDecade(2003)).toBe('2000-те');
    expect(birthDecade(null)).toBeNull();
  });
});

describe('redactTreeNode', () => {
  it('admin view is unchanged', () => {
    expect(redactTreeNode(deceasedPublic, 'admin')).toBe(deceasedPublic);
  });

  it('a living person is never identifiable publicly (even if flagged public)', () => {
    const living: TreeNode = { ...deceasedPublic, living: true, privacyLevel: 'public' };
    const r = redactTreeNode(living, 'public');
    expect(r.label).toBe('Жив член на семейството');
    expect(r.birthYear).toBeNull();
    expect(r.deathYear).toBeNull();
  });

  it('a private deceased person is masked', () => {
    const r = redactTreeNode({ ...deceasedPublic, privacyLevel: 'private' }, 'public');
    expect(r.label).toBe('Член на семейството');
    expect(r.birthYear).toBeNull();
  });

  it('a deceased family/public person keeps name, years, and source count', () => {
    const r = redactTreeNode(deceasedPublic, 'public');
    expect(r.label).toBe('Иван Митовски');
    expect(r.birthYear).toBe(1950);
    expect(r.sourceCount).toBe(2);
  });

  it('union nodes pass through', () => {
    const union: TreeNode = { id: 'u1', type: 'union', unionType: 'marriage', generation: -1 };
    expect(redactTreeNode(union, 'public')).toBe(union);
  });
});
