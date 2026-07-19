import { z } from 'zod';
import { CONTACT_METHOD, LIVING_STATUS, MATERIALS_ANSWER, PARENT_RELATIONSHIP } from './labels';

/** Consent text version — bump when any consent wording changes (idea.md §9). */
export const CONSENT_VERSION = '2026-07-19';

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1800;

/** Plain-text field: trimmed, length-capped, and HTML-free (idea.md §6). */
function plainText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Максимум ${max} символа`)
    .refine((v) => !/[<>]/.test(v), 'Символите < и > не са разрешени');
}

const optionalText = (max: number) =>
  z
    .literal('')
    .transform(() => undefined)
    .or(plainText(max))
    .optional();

const nameField = () => optionalText(100);
const longText = () => optionalText(2000);

const yearField = () =>
  z
    .number()
    .int()
    .min(MIN_YEAR, `Годината трябва да е след ${MIN_YEAR}`)
    .max(CURRENT_YEAR, 'Годината не може да е в бъдещето')
    .optional();

/** A person described in the questionnaire. All fields optional (minimal path). */
export const personBlockSchema = z.object({
  firstName: nameField(),
  middleName: nameField(),
  surname: nameField(),
  birthSurname: nameField(),
  previousSurnames: nameField(),
  nickname: nameField(),
  birthYear: yearField(),
  birthYearApprox: z.boolean().default(false),
  deathYear: yearField(),
  deathYearApprox: z.boolean().default(false),
  birthplace: optionalText(200),
  residences: longText(),
  occupation: optionalText(200),
  livingStatus: z.enum(LIVING_STATUS).default('unknown'),
  relationshipType: z.enum(PARENT_RELATIONSHIP).optional(),
  familyStories: longText(),
  infoSource: optionalText(500),
});
export type PersonBlock = z.infer<typeof personBlockSchema>;

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v && typeof v === 'object' && Object.keys(v).length === 0 ? undefined : v), schema);

// --- Step 1: за участника (required) ---
export const step1Schema = z.object({
  participantName: plainText(200).min(1, 'Моля, въведете имената си'),
  fillingForOther: z.boolean().default(false),
  connectionToFamily: plainText(500).min(1, 'Моля, опишете връзката си с рода'),
  branchOrigin: optionalText(500),
  email: z
    .literal('')
    .transform(() => undefined)
    .or(z.string().trim().email('Невалиден имейл'))
    .optional(),
  preferredContact: z.enum(CONTACT_METHOD).default('none'),
  // The data_processing consent is legally required to submit.
  consentDataProcessing: z.literal(true, {
    message: 'Съгласието за обработване на данните е задължително',
  }),
});

// --- Step 2: информация за Вас (required core) ---
// Only a year (never an exact date) is collected, so living people never get a
// precise birth date (idea.md §9).
export const step2Schema = personBlockSchema
  .extend({
    firstName: plainText(100).min(1, 'Моля, въведете собственото си име'),
  })
  .refine(
    (p) => p.birthYear === undefined || p.deathYear === undefined || p.birthYear <= p.deathYear,
    { message: 'Годината на раждане не може да е след годината на смърт', path: ['deathYear'] },
  );

// --- Steps 3–6: optional (minimal path — validate when empty) ---
export const step3Schema = z.object({
  father: emptyToUndefined(personBlockSchema.optional()),
  mother: emptyToUndefined(personBlockSchema.optional()),
});

export const step4Schema = z.object({
  paternalGrandfather: emptyToUndefined(personBlockSchema.optional()),
  paternalGrandmother: emptyToUndefined(personBlockSchema.optional()),
  maternalGrandfather: emptyToUndefined(personBlockSchema.optional()),
  maternalGrandmother: emptyToUndefined(personBlockSchema.optional()),
});

const CAP = 10;
const capped = () => z.array(personBlockSchema).max(CAP, `Максимум ${CAP} записа`).default([]);

export const step5Schema = z.object({
  siblings: capped(),
  children: capped(),
  partners: capped(),
  unclesAunts: capped(),
  otherRelatives: capped(),
  contactPerson: emptyToUndefined(personBlockSchema.optional()),
});

export const step6Schema = z.object({
  oldestKnownSettlement: optionalText(200),
  surnameOrigin: longText(),
  spellingVariants: optionalText(500),
  familyNicknames: optionalText(500),
  migrations: longText(),
  relativesAbroad: longText(),
  familyStories: longText(),
  oldestLivingRelative: optionalText(200),
  // Materials question (Task 13 addition): maps who holds photos/documents.
  hasMaterials: z.enum(MATERIALS_ANSWER).default('unsure'),
  materialsDescription: longText(),
});

// --- Step 7: consents (data_processing required, rest optional) ---
export const step7Schema = z.object({
  consentDataProcessing: z.literal(true, {
    message: 'Съгласието за обработване на данните е задължително',
  }),
  consentContact: z.boolean().default(false),
  consentFamilyVisibility: z.boolean().default(false),
  consentPublicDisplay: z.boolean().default(false),
  consentMediaUsage: z.boolean().default(false),
});

// --- Anti-abuse fields (idea.md §6) ---
export const antiAbuseSchema = z.object({
  // Honeypot: must stay empty; a filled value marks a bot.
  website: z.literal('').or(z.undefined()),
  formStartedAt: z.number().int().positive(),
});

/** The full form value across all steps. */
export const questionnaireSchema = z
  .object({
    inviteToken: z.string().optional(),
  })
  .and(step1Schema)
  .and(z.object({ self: step2Schema }))
  .and(step3Schema)
  .and(step4Schema)
  .and(step5Schema)
  .and(step6Schema)
  .and(step7Schema)
  .and(antiAbuseSchema);

export type QuestionnaireValues = z.infer<typeof questionnaireSchema>;
