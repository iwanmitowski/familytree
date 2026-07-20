/**
 * Deterministic Bulgarian name normalization, transliteration, surname-variant
 * awareness, and search tokens (idea.md §10). Pure functions, no DB. Variants
 * are matching aids only — never proof that two people are the same.
 */

/** Cyrillic → Latin per the 2009 streamlined Bulgarian transliteration system. */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht',
  ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
};

/**
 * Normalize: NFC, lowercase (Unicode-aware), trim, collapse whitespace, strip
 * punctuation except the hyphen, and fold `ѝ` → `и`. Idempotent — the original
 * value is always stored separately.
 */
export function normalize(input: string): string {
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(/ѝ/g, 'и') // ѝ → и
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function transliterateWord(word: string): string {
  // The ending "ия" transliterates to "ia" (София→sofia, Юлия→yulia).
  const stem = word.endsWith('ия') ? `${word.slice(0, -2)}ia` : word;
  let out = '';
  for (const ch of stem) {
    out += TRANSLIT[ch] ?? ch;
  }
  return out;
}

/** Cyrillic → Latin transliteration; already-Latin input passes through. */
export function transliterate(input: string): string {
  return normalize(input)
    .split(' ')
    .map(transliterateWord)
    .join(' ')
    .trim();
}

function cyrillicGenderForms(s: string): string[] {
  if (s.endsWith('ски')) return [s, `${s.slice(0, -3)}ска`];
  if (s.endsWith('ска')) return [s, `${s.slice(0, -3)}ски`];
  if (s.endsWith('ова')) return [s, s.slice(0, -1)];
  if (s.endsWith('ева')) return [s, s.slice(0, -1)];
  if (s.endsWith('ов')) return [s, `${s}а`];
  if (s.endsWith('ев')) return [s, `${s}а`];
  return [s];
}

function latinGenderForms(s: string): string[] {
  if (s.endsWith('ski')) return [s, `${s.slice(0, -3)}ska`];
  if (s.endsWith('ska')) return [s, `${s.slice(0, -3)}ski`];
  if (s.endsWith('ova')) return [s, s.slice(0, -1)];
  if (s.endsWith('eva')) return [s, s.slice(0, -1)];
  if (s.endsWith('ov')) return [s, `${s}a`];
  if (s.endsWith('ev')) return [s, `${s}a`];
  return [s];
}

/**
 * Related surname forms: gender pairs (—ски↔—ска, —ов↔—ова, —ев↔—ева) plus
 * their transliterations. Latin input is folded (sky→ski) so `Mitovsky` shares
 * a variant with `Митовски`. These forms are matching aids only.
 */
export function surnameVariants(surname: string): string[] {
  const norm = normalize(surname);
  const out = new Set<string>();

  if (/[а-я]/.test(norm)) {
    for (const form of cyrillicGenderForms(norm)) {
      out.add(form);
      out.add(transliterate(form));
    }
  } else {
    // Latin: normalize spelling (sky/skiy → ski, trailing y → i).
    const latin = norm.replace(/sk[iy]y?$/, 'ski').replace(/y$/, 'i');
    for (const form of latinGenderForms(latin)) out.add(form);
  }

  return [...out].sort();
}

/** Normalized + transliterated tokens for search, deduplicated and sorted. */
export function searchTokens(fullName: string): string[] {
  const tokens = new Set<string>();
  const norm = normalize(fullName);
  for (const t of norm.split(' ').filter(Boolean)) {
    tokens.add(t);
    tokens.add(transliterateWord(t));
  }
  return [...tokens].sort();
}

export interface PersonNameParts {
  firstName?: string | null;
  middleName?: string | null;
  surname?: string | null;
}

export interface NormalizedNameRow {
  normalizedName: string;
  transliteratedName: string;
}

/** Builds the normalized + transliterated name fields for person_names (Task 21). */
export function buildPersonNameRow(parts: PersonNameParts): NormalizedNameRow {
  const full = [parts.firstName, parts.middleName, parts.surname].filter(Boolean).join(' ');
  return { normalizedName: normalize(full), transliteratedName: transliterate(full) };
}
