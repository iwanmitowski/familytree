/**
 * Single source of Bulgarian labels for questionnaire enums, shared between the
 * Zod schemas and the UI (idea.md §9, §10). Values are the machine codes stored
 * in the payload; labels are what the participant sees.
 */

export const LIVING_STATUS = ['living', 'deceased', 'unknown'] as const;
export type LivingStatus = (typeof LIVING_STATUS)[number];
export const LIVING_STATUS_LABELS: Record<LivingStatus, string> = {
  living: 'Жив/жива',
  deceased: 'Починал/починала',
  unknown: 'Не знам',
};

export const PARENT_RELATIONSHIP = ['biological', 'adoptive', 'step', 'unknown'] as const;
export type ParentRelationship = (typeof PARENT_RELATIONSHIP)[number];
export const PARENT_RELATIONSHIP_LABELS: Record<ParentRelationship, string> = {
  biological: 'Биологичен родител',
  adoptive: 'Осиновител',
  step: 'Доведен родител',
  unknown: 'Не знам',
};

export const CONTACT_METHOD = ['email', 'phone', 'none'] as const;
export type ContactMethod = (typeof CONTACT_METHOD)[number];
export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  email: 'Имейл',
  phone: 'Телефон',
  none: 'Не желая да ме търсите',
};

export const MATERIALS_ANSWER = ['yes', 'no', 'unsure'] as const;
export type MaterialsAnswer = (typeof MATERIALS_ANSWER)[number];
export const MATERIALS_ANSWER_LABELS: Record<MaterialsAnswer, string> = {
  yes: 'Да',
  no: 'Не',
  unsure: 'Не съм сигурен/сигурна',
};

export const CONSENT_TYPES = [
  'data_processing',
  'contact',
  'family_visibility',
  'public_display',
  'media_usage',
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];
export const CONSENT_LABELS: Record<ConsentType, string> = {
  data_processing: 'Съгласен/съгласна съм изпратената информация да бъде обработена за проекта.',
  contact: 'Съгласен/съгласна съм да се свържете с мен за уточнения.',
  family_visibility:
    'Съгласен/съгласна съм информацията да се вижда от потвърдени членове на рода.',
  public_display: 'Съгласен/съгласна съм подходяща информация да се показва публично.',
  media_usage: 'Съгласен/съгласна съм споделените снимки и документи да се използват в проекта.',
};

/** Step titles (idea.md §9). */
export const STEP_TITLES = [
  'За участника',
  'Информация за Вас',
  'Родители',
  'Баби и дядовци',
  'Други роднини',
  'Произход',
  'Преглед и съгласие',
] as const;
