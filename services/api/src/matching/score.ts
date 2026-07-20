/**
 * Explainable person matching (idea.md §10). Pure scoring: given a submitted
 * person and a canonical candidate, return a 0–100 score with Bulgarian
 * reasons. Never links automatically — this only informs the admin.
 */

export interface PersonMatchContext {
  normalizedName: string;
  birthSurname?: string | null;
  nickname?: string | null;
  birthYearFrom?: number | null;
  birthYearTo?: number | null;
  birthplaceNormalized?: string | null;
  parentNames?: string[];
  partnerNames?: string[];
  childrenNames?: string[];
}

export interface MatchReason {
  field: string;
  score: number;
  description: string;
}

export interface MatchResult {
  score: number;
  reasons: MatchReason[];
}

/** Documented default weights (idea.md §10). */
export const WEIGHTS = {
  nameFull: 35,
  birthSurname: 10,
  birthYearExact: 15,
  birthYearOne: 10,
  birthYearThree: 5,
  birthplace: 10,
  parents: 15,
  partner: 5,
  children: 5,
  nickname: 5,
} as const;

const tokens = (s: string): Set<string> => new Set(s.split(' ').filter(Boolean));

function midYear(from?: number | null, to?: number | null): number | undefined {
  if (from != null && to != null) return (from + to) / 2;
  if (from != null) return from;
  if (to != null) return to;
  return undefined;
}

function nameOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / Math.max(a.size, b.size);
}

function normalizedSetOverlap(a: string[] = [], b: string[] = []): number {
  const sa = new Set(a.filter(Boolean));
  const sb = new Set(b.filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const x of sa) if (sb.has(x)) shared += 1;
  return shared / Math.max(sa.size, sb.size);
}

export function score(sp: PersonMatchContext, cp: PersonMatchContext): MatchResult {
  const reasons: MatchReason[] = [];
  const add = (field: string, points: number, description: string) => {
    if (points > 0) reasons.push({ field, score: points, description });
  };

  // Name.
  if (sp.normalizedName && sp.normalizedName === cp.normalizedName) {
    add('normalizedName', WEIGHTS.nameFull, 'Пълно съвпадение на името');
  } else {
    const overlap = nameOverlap(tokens(sp.normalizedName), tokens(cp.normalizedName));
    const points = Math.round(overlap * WEIGHTS.nameFull);
    if (points > 0) add('normalizedName', points, 'Частично съвпадение на името');
  }

  // Birth surname.
  if (sp.birthSurname && cp.birthSurname && sp.birthSurname === cp.birthSurname) {
    add('birthSurname', WEIGHTS.birthSurname, 'Съвпадение на фамилията по рождение');
  }

  // Birth year.
  const spYear = midYear(sp.birthYearFrom, sp.birthYearTo);
  const cpYear = midYear(cp.birthYearFrom, cp.birthYearTo);
  if (spYear !== undefined && cpYear !== undefined) {
    const diff = Math.abs(spYear - cpYear);
    if (diff === 0) add('birthYear', WEIGHTS.birthYearExact, 'Съвпадение на годината на раждане');
    else if (diff <= 1) add('birthYear', WEIGHTS.birthYearOne, 'Разлика от една година');
    else if (diff <= 3) add('birthYear', WEIGHTS.birthYearThree, 'Близки години на раждане');
  }

  // Birthplace.
  if (
    sp.birthplaceNormalized &&
    cp.birthplaceNormalized &&
    sp.birthplaceNormalized === cp.birthplaceNormalized
  ) {
    add('birthplace', WEIGHTS.birthplace, 'Съвпадение на мястото на раждане');
  }

  // Parents / partners / children.
  const parents = normalizedSetOverlap(sp.parentNames, cp.parentNames);
  if (parents > 0) add('parents', Math.round(parents * WEIGHTS.parents), 'Съвпадение на родители');

  const partners = normalizedSetOverlap(sp.partnerNames, cp.partnerNames);
  if (partners > 0) add('partner', Math.round(partners * WEIGHTS.partner), 'Съвпадение на партньор');

  const children = normalizedSetOverlap(sp.childrenNames, cp.childrenNames);
  if (children > 0) add('children', Math.round(children * WEIGHTS.children), 'Съвпадение на деца');

  // Nickname.
  if (sp.nickname && cp.nickname && sp.nickname === cp.nickname) {
    add('nickname', WEIGHTS.nickname, 'Съвпадение на прякор');
  }

  const total = Math.min(
    100,
    reasons.reduce((sum, r) => sum + r.score, 0),
  );
  return { score: total, reasons };
}
