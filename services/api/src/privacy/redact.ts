import type { TreeNode } from '../genealogy/projection';

export type View = 'admin' | 'public';

/**
 * Field names that must NEVER appear in public output (idea.md §15). Used by the
 * deep-scan test to guarantee no leak.
 */
export const FORBIDDEN_PUBLIC_FIELDS = [
  'email',
  'phone',
  'телефон',
  'address',
  'адрес',
  'notes',
  'dateFrom',
  'dateTo',
  'date_from',
  'date_to',
  'clientFingerprint',
  'client_fingerprint',
] as const;

/** "1980-те" from a birth year, or null. */
export function birthDecade(year: number | null | undefined): string | null {
  if (year == null) return null;
  return `${Math.floor(year / 10) * 10}-те`;
}

/**
 * Central redaction for tree person nodes (idea.md §15). Living people are never
 * publicly identifiable (even if flagged public — policy decision, documented in
 * docs/security.md); private deceased people are masked; family/public deceased
 * people keep name, years, settlement, and source count. Union nodes carry no
 * PII and pass through.
 */
export function redactTreeNode(node: TreeNode, view: View): TreeNode {
  if (view === 'admin' || node.type === 'union') return node;

  const base: TreeNode = { id: node.id, type: 'person', generation: node.generation, privacyLevel: node.privacyLevel };

  // Living people: never identifiable publicly.
  if (node.living) {
    return { ...base, label: 'Жив член на семейството', birthYear: null, deathYear: null, living: true };
  }
  // Private deceased: masked.
  if (node.privacyLevel === 'private') {
    return { ...base, label: 'Член на семейството', birthYear: null, deathYear: null, living: false };
  }
  // Deceased + family/public: name, years, settlement-level place, source count.
  return {
    ...base,
    label: node.label ?? null,
    birthYear: node.birthYear ?? null,
    deathYear: node.deathYear ?? null,
    living: false,
    sourceCount: node.sourceCount ?? null,
    verificationState: node.verificationState,
  };
}

export interface PublicMaskedPerson {
  id: string;
  label: string;
  birthDecade: string | null;
}

/** Public label for a living person outside the tree context. */
export function publicMaskedPerson(id: string, birthYear: number | null): PublicMaskedPerson {
  return { id, label: 'Жив член на семейството', birthDecade: birthDecade(birthYear) };
}
