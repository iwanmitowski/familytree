/**
 * Bulgarian kinship classification from common-ancestor depths (idea.md §11).
 * dA = generations from A up to the closest common ancestor; dB likewise from
 * B. Gender is usually unknown, so slash forms are used.
 */

const ORDINALS = ['', 'първи', 'втори', 'трети', 'четвърти', 'пети', 'шести', 'седми', 'осми'];

function ordinal(n: number): string {
  return ORDINALS[n] ?? `${n}-и`;
}

function removalSuffix(r: number): string {
  if (r === 0) return '';
  if (r === 1) return ' (веднъж отместени)';
  if (r === 2) return ' (двукратно отместени)';
  return ` (${r} пъти отместени)`;
}

/** Prefix "пра" (repeated k times) onto each side of a slash label. */
function pra(k: number, slashLabel: string): string {
  const prefix = 'пра'.repeat(Math.max(0, k));
  if (k <= 0) return slashLabel;
  return slashLabel
    .split('/')
    .map((part) => prefix + part)
    .join('/');
}

/**
 * Returns the Bulgarian label describing how A relates to B, given the depths
 * to their closest common ancestor. Returns null when not a blood relation
 * within the searched depth.
 */
export function classifyKinship(dA: number, dB: number): string | null {
  if (dA < 0 || dB < 0) return null;
  if (dA === 0 && dB === 0) return 'същият човек';

  // A is a direct ancestor of B (common ancestor is A itself).
  if (dA === 0) {
    if (dB === 1) return 'родител';
    if (dB === 2) return 'баба/дядо';
    return pra(dB - 2, "баба/дядо");
  }
  // A is a direct descendant of B.
  if (dB === 0) {
    if (dA === 1) return 'дете';
    if (dA === 2) return 'внук/внучка';
    return pra(dA - 2, "внук/внучка");
  }

  // Siblings.
  if (dA === 1 && dB === 1) return 'брат/сестра';

  // A is an uncle/aunt of B (A is a sibling of B's ancestor).
  if (dA === 1) {
    if (dB === 2) return 'чичо/леля';
    return pra(dB - 2, "чичо/леля");
  }
  // A is a nephew/niece of B.
  if (dB === 1) {
    if (dA === 2) return 'племенник/племенница';
    return pra(dA - 2, "племенник/племенница");
  }

  // Cousins.
  const degree = Math.min(dA, dB) - 1;
  const removal = Math.abs(dA - dB);
  return `${ordinal(degree)} братовчеди${removalSuffix(removal)}`;
}
