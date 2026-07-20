import type { TreeNode } from './types';

const UNION_TYPE_LABELS: Record<string, string> = {
  marriage: 'Брак',
  partnership: 'Партньорство',
  unknown: 'Съюз',
};

export function unionTypeLabel(t: string | undefined): string {
  return t ? (UNION_TYPE_LABELS[t] ?? 'Съюз') : 'Съюз';
}

const VERIFICATION_LABELS: Record<string, string> = {
  proposed: 'Предложена',
  confirmed: 'Потвърдена',
  disputed: 'Оспорена',
  rejected: 'Отхвърлена',
};

export function verificationLabel(v: string | undefined): string | null {
  return v ? (VERIFICATION_LABELS[v] ?? null) : null;
}

/**
 * Years for a person node. The API already redacts the public view (living
 * people have null years), so this only formats whatever survived redaction.
 */
export function personYears(node: TreeNode): string {
  const { birthYear: b, deathYear: d, living } = node;
  if (b == null && d == null) {
    return living ? '' : '';
  }
  if (b != null && d != null) return `${b} – ${d}`;
  if (b != null) return living ? `р. ${b}` : `* ${b}`;
  return `† ${d}`;
}
