/**
 * Local keys identify each person described within a single submission
 * (idea.md §8). Fixed roles have literal keys; repeatable sections use indexed
 * factories (1-based).
 */
export const FIXED_LOCAL_KEYS = [
  'SELF',
  'FATHER',
  'MOTHER',
  'PATERNAL_GRANDFATHER',
  'PATERNAL_GRANDMOTHER',
  'MATERNAL_GRANDFATHER',
  'MATERNAL_GRANDMOTHER',
] as const;

export type FixedLocalKey = (typeof FIXED_LOCAL_KEYS)[number];

export const REPEATABLE_PREFIXES = ['SIBLING', 'CHILD', 'PARTNER', 'RELATIVE'] as const;
export type RepeatablePrefix = (typeof REPEATABLE_PREFIXES)[number];

export type LocalKey = FixedLocalKey | `${RepeatablePrefix}_${number}`;

export const siblingKey = (n: number): LocalKey => `SIBLING_${n}`;
export const childKey = (n: number): LocalKey => `CHILD_${n}`;
export const partnerKey = (n: number): LocalKey => `PARTNER_${n}`;
export const relativeKey = (n: number): LocalKey => `RELATIVE_${n}`;

const REPEATABLE_RE = new RegExp(`^(${REPEATABLE_PREFIXES.join('|')})_([1-9]\\d*)$`);

export function isFixedLocalKey(value: string): value is FixedLocalKey {
  return (FIXED_LOCAL_KEYS as readonly string[]).includes(value);
}

export function isLocalKey(value: string): value is LocalKey {
  return isFixedLocalKey(value) || REPEATABLE_RE.test(value);
}

/** Parses a repeatable key into its prefix + 1-based index, or null. */
export function parseRepeatableKey(
  value: string,
): { prefix: RepeatablePrefix; index: number } | null {
  const m = REPEATABLE_RE.exec(value);
  if (!m) return null;
  return { prefix: m[1] as RepeatablePrefix, index: Number(m[2]) };
}
