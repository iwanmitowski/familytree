// Bulgarian labels + honest date rendering for the admin people browser
// (idea.md §8: never fabricate a precise date).

export const LIVING_STATUS_LABELS: Record<string, string> = {
  living: 'Жив/а',
  deceased: 'Починал/а',
  unknown: 'Неизвестно',
};

export const PRIVACY_LABELS: Record<string, string> = {
  private: 'Частно',
  family: 'Семейно',
  public: 'Публично',
};

export const NAME_TYPE_LABELS: Record<string, string> = {
  primary: 'Основно',
  birth: 'По рождение',
  married: 'По брак',
  alias: 'Псевдоним',
  nickname: 'Прякор',
  transliterated: 'Транслитерация',
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  birth: 'Раждане',
  death: 'Смърт',
  residence: 'Местоживеене',
  migration: 'Миграция',
  occupation: 'Занятие',
  education: 'Образование',
};

export const RELATIONSHIP_TYPE_LABELS: Record<string, string> = {
  biological: 'Биологична',
  adoptive: 'Осиновяване',
  step: 'Доведена',
  foster: 'Приемна',
  guardian: 'Настойник',
  unknown: 'Неизвестна',
};

export const VERIFICATION_LABELS: Record<string, string> = {
  proposed: 'Предложена',
  confirmed: 'Потвърдена',
  disputed: 'Оспорена',
  rejected: 'Отхвърлена',
};

export const UNION_TYPE_LABELS: Record<string, string> = {
  marriage: 'Брак',
  partnership: 'Партньорство',
  unknown: 'Неизвестно',
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  questionnaire: 'Въпросник',
  interview: 'Интервю',
  birth_certificate: 'Акт за раждане',
  marriage_certificate: 'Акт за брак',
  death_certificate: 'Акт за смърт',
  church_register: 'Църковен регистър',
  family_document: 'Семеен документ',
  photograph: 'Снимка',
  grave_marker: 'Надгробен камък',
  other: 'Друго',
};

export const STANCE_LABELS: Record<string, string> = {
  supports: 'Подкрепя',
  disputes: 'Оспорва',
};

export function label(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '—';
  return map[key] ?? key;
}

/** Compact lifespan for list rows, e.g. "1932 – 1990", "* 1932", "—". */
export function renderLifespan(birthYear: number | null, deathYear: number | null): string {
  if (birthYear == null && deathYear == null) return '—';
  if (birthYear != null && deathYear != null) return `${birthYear} – ${deathYear}`;
  if (birthYear != null) return `* ${birthYear}`;
  return `† ${deathYear}`;
}

/**
 * Honest date rendering — reflects the stored precision and never invents a
 * more exact date than we have (idea.md §8).
 */
export function renderEventDate(e: {
  year_from: number | null;
  year_to: number | null;
  date_precision: string;
}): string {
  const { year_from: from, year_to: to, date_precision: p } = e;
  if (p === 'unknown' || (from == null && to == null)) return 'неизвестна';
  if (p === 'range' && from != null && to != null && from !== to) return `${from}–${to}`;
  if (p === 'approximate') return `ок. ${from ?? to}`;
  return String(from ?? to);
}
