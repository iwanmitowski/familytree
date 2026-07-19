import { CONSENT_TYPES } from './labels';
import { CONSENT_VERSION } from './schema';
import type { PersonBlock, QuestionnaireValues } from './schema';
import {
  childKey,
  partnerKey,
  relativeKey,
  siblingKey,
  type LocalKey,
} from './local-keys';

export const PAYLOAD_VERSION = 1;

export type RelationshipType = 'parent' | 'partner' | 'sibling' | 'child' | 'other';

export interface PayloadPerson {
  localKey: LocalKey;
  firstName?: string;
  middleName?: string;
  surname?: string;
  birthSurname?: string;
  previousSurnames?: string;
  nickname?: string;
  birthYear?: number;
  birthYearApprox?: boolean;
  deathYear?: number;
  deathYearApprox?: boolean;
  birthplace?: string;
  residences?: string;
  occupation?: string;
  livingStatus: PersonBlock['livingStatus'];
  relationshipType?: PersonBlock['relationshipType'];
  familyStories?: string;
  infoSource?: string;
}

export interface PayloadRelationship {
  fromLocalKey: LocalKey;
  toLocalKey: LocalKey;
  type: RelationshipType;
  notes?: string;
}

export interface SubmissionPayload {
  payloadVersion: number;
  participant: {
    name: string;
    fillingForOther: boolean;
    connectionToFamily: string;
    branchOrigin?: string;
    email?: string;
    preferredContact: string;
  };
  people: PayloadPerson[];
  relationships: PayloadRelationship[];
  origin: {
    oldestKnownSettlement?: string;
    surnameOrigin?: string;
    spellingVariants?: string;
    familyNicknames?: string;
    migrations?: string;
    relativesAbroad?: string;
    familyStories?: string;
    oldestLivingRelative?: string;
    hasMaterials: string;
    materialsDescription?: string;
  };
  consents: { consentType: string; consentVersion: string; accepted: boolean }[];
  meta: { startedAt: number; durationMs: number; fillingForOther: boolean };
}

/** A block carries content if any identifying field is filled. */
export function hasContent(block: PersonBlock | undefined): block is PersonBlock {
  if (!block) return false;
  return Boolean(
    block.firstName ||
      block.middleName ||
      block.surname ||
      block.birthSurname ||
      block.nickname ||
      block.birthYear ||
      block.deathYear ||
      block.birthplace ||
      block.occupation ||
      block.familyStories,
  );
}

function toPerson(localKey: LocalKey, block: PersonBlock): PayloadPerson {
  return {
    localKey,
    firstName: block.firstName,
    middleName: block.middleName,
    surname: block.surname,
    birthSurname: block.birthSurname,
    previousSurnames: block.previousSurnames,
    nickname: block.nickname,
    birthYear: block.birthYear,
    birthYearApprox: block.birthYearApprox,
    deathYear: block.deathYear,
    deathYearApprox: block.deathYearApprox,
    birthplace: block.birthplace,
    residences: block.residences,
    occupation: block.occupation,
    livingStatus: block.livingStatus,
    relationshipType: block.relationshipType,
    familyStories: block.familyStories,
    infoSource: block.infoSource,
  };
}

/**
 * Deterministic mapping from form values to the versioned submission payload.
 * Only blocks with content become people; relationships are derived from the
 * standard local-key semantics (idea.md §8, §11). Ordering is stable.
 */
export function toSubmissionPayload(
  values: QuestionnaireValues,
  now = Date.now(),
): SubmissionPayload {
  const people: PayloadPerson[] = [];
  const relationships: PayloadRelationship[] = [];
  const present = new Set<LocalKey>();

  const add = (localKey: LocalKey, block: PersonBlock | undefined): boolean => {
    if (!hasContent(block)) return false;
    people.push(toPerson(localKey, block));
    present.add(localKey);
    return true;
  };
  const relate = (
    from: LocalKey,
    to: LocalKey,
    type: RelationshipType,
    notes?: string,
  ) => {
    if (present.has(from) && present.has(to)) relationships.push({ fromLocalKey: from, toLocalKey: to, type, notes });
  };

  // SELF is always present (step 2 requires a first name).
  add('SELF', values.self);

  add('FATHER', values.father);
  add('MOTHER', values.mother);
  relate('SELF', 'FATHER', 'parent');
  relate('SELF', 'MOTHER', 'parent');

  add('PATERNAL_GRANDFATHER', values.paternalGrandfather);
  add('PATERNAL_GRANDMOTHER', values.paternalGrandmother);
  add('MATERNAL_GRANDFATHER', values.maternalGrandfather);
  add('MATERNAL_GRANDMOTHER', values.maternalGrandmother);
  relate('FATHER', 'PATERNAL_GRANDFATHER', 'parent');
  relate('FATHER', 'PATERNAL_GRANDMOTHER', 'parent');
  relate('MOTHER', 'MATERNAL_GRANDFATHER', 'parent');
  relate('MOTHER', 'MATERNAL_GRANDMOTHER', 'parent');

  values.siblings.forEach((b, i) => {
    if (add(siblingKey(i + 1), b)) relate('SELF', siblingKey(i + 1), 'sibling');
  });
  values.children.forEach((b, i) => {
    if (add(childKey(i + 1), b)) relate('SELF', childKey(i + 1), 'child');
  });
  values.partners.forEach((b, i) => {
    if (add(partnerKey(i + 1), b)) relate('SELF', partnerKey(i + 1), 'partner');
  });

  // Uncles/aunts, other relatives, and the contact person all map to RELATIVE_n.
  let relativeIndex = 0;
  const addRelative = (b: PersonBlock | undefined, notes: string) => {
    if (!hasContent(b)) return;
    relativeIndex += 1;
    if (add(relativeKey(relativeIndex), b)) relate('SELF', relativeKey(relativeIndex), 'other', notes);
  };
  values.unclesAunts.forEach((b) => addRelative(b, 'чичо/леля'));
  values.otherRelatives.forEach((b) => addRelative(b, 'роднина'));
  addRelative(values.contactPerson, 'може да даде повече информация');

  const consents = CONSENT_TYPES.map((consentType) => ({
    consentType,
    consentVersion: CONSENT_VERSION,
    accepted:
      consentType === 'data_processing'
        ? values.consentDataProcessing
        : consentType === 'contact'
          ? values.consentContact
          : consentType === 'family_visibility'
            ? values.consentFamilyVisibility
            : consentType === 'public_display'
              ? values.consentPublicDisplay
              : values.consentMediaUsage,
  }));

  return {
    payloadVersion: PAYLOAD_VERSION,
    participant: {
      name: values.participantName,
      fillingForOther: values.fillingForOther,
      connectionToFamily: values.connectionToFamily,
      branchOrigin: values.branchOrigin,
      email: values.email,
      preferredContact: values.preferredContact,
    },
    people,
    relationships,
    origin: {
      oldestKnownSettlement: values.oldestKnownSettlement,
      surnameOrigin: values.surnameOrigin,
      spellingVariants: values.spellingVariants,
      familyNicknames: values.familyNicknames,
      migrations: values.migrations,
      relativesAbroad: values.relativesAbroad,
      familyStories: values.familyStories,
      oldestLivingRelative: values.oldestLivingRelative,
      hasMaterials: values.hasMaterials,
      materialsDescription: values.materialsDescription,
    },
    consents,
    meta: {
      startedAt: values.formStartedAt,
      durationMs: Math.max(0, now - values.formStartedAt),
      fillingForOther: values.fillingForOther,
    },
  };
}
