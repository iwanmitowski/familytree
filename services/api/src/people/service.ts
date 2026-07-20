import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { normalize, transliterate } from '../names';
import { insertAuditEntry } from '../audit/repo';
import { getSourceBySubmission, insertEvidence, insertSource } from '../sources/repo';
import { getOrCreatePlace } from './places-repo';
import {
  getPerson,
  insertPerson,
  insertPersonEvent,
  insertPersonName,
  patchPerson,
  searchPeopleByNormalizedName,
  type PersonRow,
} from './repo';
import { getPersonAggregate, type PersonAggregateResult } from './aggregate';

type Db = Kysely<DB>;

export interface CreatePersonInput {
  firstName: string;
  middleName?: string | null;
  surname?: string | null;
  birthSurname?: string | null;
  nickname?: string | null;
  livingStatus?: 'living' | 'deceased' | 'unknown';
  privacyLevel?: 'private' | 'family' | 'public';
}

function fullName(parts: { firstName?: string | null; middleName?: string | null; surname?: string | null }): string {
  return [parts.firstName, parts.middleName, parts.surname].filter(Boolean).join(' ');
}

/** Manual admin creation of a canonical person with a preferred primary name. */
export async function createPersonManual(
  db: Db,
  input: CreatePersonInput,
  actorId: string,
): Promise<PersonAggregateResult> {
  const id = await db.transaction().execute(async (trx) => {
    const person = await insertPerson(trx, {
      living_status: input.livingStatus ?? 'unknown',
      privacy_level: input.privacyLevel ?? 'private',
    });
    const name = fullName(input);
    await insertPersonName(trx, {
      person_id: person.id,
      first_name: input.firstName,
      middle_name: input.middleName ?? null,
      surname: input.surname ?? null,
      birth_surname: input.birthSurname ?? null,
      nickname: input.nickname ?? null,
      normalized_name: normalize(name),
      transliterated_name: transliterate(name),
      name_type: 'primary',
      is_preferred: true,
    });
    await insertAuditEntry(trx, {
      actor_type: 'admin',
      actor_id: actorId,
      action: 'person.created',
      entity_type: 'person',
      entity_id: person.id,
    });
    return person.id;
  });
  return getPersonAggregate(db, id);
}

export async function patchPersonById(
  db: Db,
  id: string,
  patch: { privacyLevel?: 'private' | 'family' | 'public'; livingStatus?: 'living' | 'deceased' | 'unknown'; notes?: string | null },
  actorId: string,
): Promise<PersonAggregateResult> {
  const updated = await patchPerson(db, id, {
    privacy_level: patch.privacyLevel,
    living_status: patch.livingStatus,
    notes: patch.notes,
  });
  if (!updated) return { ok: false, kind: 'not_found' };
  await insertAuditEntry(db, {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'person.updated',
    entity_type: 'person',
    entity_id: id,
  });
  return getPersonAggregate(db, id);
}

export interface PersonSummary {
  id: string;
  label: string;
  livingStatus: string;
  privacyLevel: string;
  merged: boolean;
}

export async function searchPeople(
  db: Db,
  q: string,
  opts: { limit?: number; offset?: number; includeMerged?: boolean } = {},
): Promise<{ items: PersonSummary[] }> {
  const rows = await searchPeopleByNormalizedName(db, normalize(q), opts);
  const items = await Promise.all(rows.map((r) => toSummary(db, r)));
  return { items };
}

async function toSummary(db: Db, person: PersonRow): Promise<PersonSummary> {
  const name = await db
    .selectFrom('person_names')
    .select(['first_name', 'surname'])
    .where('person_id', '=', person.id)
    .where('is_preferred', '=', true)
    .executeTakeFirst();
  return {
    id: person.id,
    label: name ? [name.first_name, name.surname].filter(Boolean).join(' ') : '',
    livingStatus: person.living_status,
    privacyLevel: person.privacy_level,
    merged: person.merged_into_person_id != null,
  };
}

/** Find-or-create a place from free text (idea.md §8). */
export async function upsertPlaceByText(db: Db, rawText: string): Promise<string | null> {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  const place = await getOrCreatePlace(db, {
    name: trimmed,
    normalized_name: normalize(trimmed),
    place_type: 'settlement',
  });
  return place.id;
}

/** Honest year precision — never a fabricated exact date (idea.md §8). */
function yearEvent(
  from: number | null,
  to: number | null,
): { year_from: number; year_to: number; date_precision: 'year' | 'range' | 'approximate' } | null {
  if (from == null && to == null) return null;
  if (from != null && to != null) {
    if (from === to) return { year_from: from, year_to: from, date_precision: 'year' };
    return { year_from: from, year_to: to, date_precision: 'range' };
  }
  const y = (from ?? to)!;
  return { year_from: y, year_to: y, date_precision: 'approximate' };
}

async function ensureQuestionnaireSource(db: Db, submissionId: string): Promise<string> {
  const existing = await getSourceBySubmission(db, submissionId);
  if (existing) return existing.id;
  const source = await insertSource(db, {
    source_type: 'questionnaire',
    title: 'Въпросник',
    submission_id: submissionId,
  });
  return source.id;
}

export type PromotionResult =
  | PersonAggregateResult
  | { ok: false; kind: 'guard'; message: string };

/**
 * Promotes a submitted person to a NEW canonical person in one transaction
 * (idea.md §7): person (private by default), names, honest-precision events,
 * questionnaire source + supporting evidence. Marks the staging person created.
 */
export async function createPersonFromSubmission(
  db: Db,
  submissionPersonId: string,
  actorId: string,
): Promise<PromotionResult> {
  const personId = await db.transaction().execute(async (trx) => {
    const sp = await trx
      .selectFrom('submission_people')
      .selectAll()
      .where('id', '=', submissionPersonId)
      .executeTakeFirst();
    if (!sp) throw new GuardError('Submission person not found');

    const submission = await trx
      .selectFrom('submissions')
      .select(['id', 'status'])
      .where('id', '=', sp.submission_id)
      .executeTakeFirstOrThrow();
    if (submission.status !== 'in_review') throw new GuardError('Заявката не е в преглед');
    if (!['pending', 'deferred'].includes(sp.resolution_status)) {
      throw new GuardError('Този човек вече е обработен');
    }

    const person = await insertPerson(trx, {
      living_status: sp.living_status,
      privacy_level: 'private', // idea.md §15 default
    });

    const name = [sp.first_name, sp.middle_name, sp.surname].filter(Boolean).join(' ');
    const primaryName = await insertPersonName(trx, {
      person_id: person.id,
      first_name: sp.first_name,
      middle_name: sp.middle_name,
      surname: sp.surname,
      birth_surname: sp.birth_surname,
      nickname: sp.nickname,
      normalized_name: normalize(name),
      transliterated_name: transliterate(name),
      name_type: 'primary',
      is_preferred: true,
    });
    if (sp.birth_surname && sp.birth_surname !== sp.surname) {
      await insertPersonName(trx, {
        person_id: person.id,
        birth_surname: sp.birth_surname,
        normalized_name: normalize(sp.birth_surname),
        transliterated_name: transliterate(sp.birth_surname),
        name_type: 'birth',
        is_preferred: true,
      });
    }
    if (sp.nickname) {
      await insertPersonName(trx, {
        person_id: person.id,
        nickname: sp.nickname,
        normalized_name: normalize(sp.nickname),
        name_type: 'nickname',
        is_preferred: false,
      });
    }

    const source = await ensureQuestionnaireSource(trx, sp.submission_id);

    const birth = yearEvent(sp.birth_year_from, sp.birth_year_to);
    let birthEventId: string | undefined;
    if (birth) {
      const placeId = sp.birthplace_text ? await upsertPlaceByText(trx, sp.birthplace_text) : null;
      const ev = await insertPersonEvent(trx, {
        person_id: person.id,
        event_type: 'birth',
        place_id: placeId,
        ...birth,
      });
      birthEventId = ev.id;
    }
    if (sp.living_status === 'deceased') {
      const death = yearEvent(sp.death_year_from, sp.death_year_to);
      if (death) {
        await insertPersonEvent(trx, { person_id: person.id, event_type: 'death', ...death });
      }
    }
    if (sp.residence_text) {
      const placeId = await upsertPlaceByText(trx, sp.residence_text);
      await insertPersonEvent(trx, {
        person_id: person.id,
        event_type: 'residence',
        place_id: placeId,
        date_precision: 'unknown',
      });
    }

    // Evidence: the questionnaire supports the name and birth assertions.
    await insertEvidence(trx, {
      source_id: source,
      subject_type: 'person_name',
      subject_id: primaryName.id,
      assertion: 'name',
      stance: 'supports',
    });
    if (birthEventId) {
      await insertEvidence(trx, {
        source_id: source,
        subject_type: 'person_event',
        subject_id: birthEventId,
        assertion: 'birth',
        stance: 'supports',
      });
    }

    await trx
      .updateTable('submission_people')
      .set({ matched_person_id: person.id, resolution_status: 'created' })
      .where('id', '=', submissionPersonId)
      .execute();

    await insertAuditEntry(trx, {
      actor_type: 'admin',
      actor_id: actorId,
      action: 'person.created_from_submission',
      entity_type: 'person',
      entity_id: person.id,
      metadata: JSON.stringify({ submissionPersonId }),
    });

    return person.id;
  }).catch((err: unknown) => {
    if (err instanceof GuardError) return { guard: err.message } as const;
    throw err;
  });

  if (typeof personId === 'object' && 'guard' in personId) {
    return { ok: false, kind: 'guard', message: personId.guard };
  }
  return getPersonAggregate(db, personId);
}

/** Links a submitted person to an EXISTING canonical person (idea.md §7). */
export async function linkPersonFromSubmission(
  db: Db,
  submissionPersonId: string,
  targetPersonId: string,
  actorId: string,
): Promise<PromotionResult> {
  const result = await db.transaction().execute(async (trx) => {
    const sp = await trx
      .selectFrom('submission_people')
      .selectAll()
      .where('id', '=', submissionPersonId)
      .executeTakeFirst();
    if (!sp) throw new GuardError('Submission person not found');

    const target = await getPerson(trx, targetPersonId);
    if (!target || target.deleted_at || target.merged_into_person_id) {
      throw new GuardError('Целевият човек не съществува или е слят');
    }

    const source = await ensureQuestionnaireSource(trx, sp.submission_id);

    // If the staging name is new, keep it as a non-preferred alias.
    const stagingName = normalize([sp.first_name, sp.middle_name, sp.surname].filter(Boolean).join(' '));
    if (stagingName) {
      const existing = await trx
        .selectFrom('person_names')
        .select('id')
        .where('person_id', '=', targetPersonId)
        .where('normalized_name', '=', stagingName)
        .executeTakeFirst();
      if (!existing) {
        await insertPersonName(trx, {
          person_id: targetPersonId,
          first_name: sp.first_name,
          middle_name: sp.middle_name,
          surname: sp.surname,
          normalized_name: stagingName,
          transliterated_name: transliterate(stagingName),
          name_type: 'alias',
          is_preferred: false,
          source_id: source,
        });
      }
    }

    await insertEvidence(trx, {
      source_id: source,
      subject_type: 'person',
      subject_id: targetPersonId,
      assertion: 'identity',
      stance: 'supports',
    });

    await trx
      .updateTable('submission_people')
      .set({ matched_person_id: targetPersonId, resolution_status: 'linked' })
      .where('id', '=', submissionPersonId)
      .execute();

    // Accept the corresponding match candidate, if any.
    await trx
      .updateTable('match_candidates')
      .set({ status: 'accepted', reviewed_by: actorId, reviewed_at: new Date() })
      .where('submission_person_id', '=', submissionPersonId)
      .where('canonical_person_id', '=', targetPersonId)
      .execute();

    await insertAuditEntry(trx, {
      actor_type: 'admin',
      actor_id: actorId,
      action: 'person.linked_from_submission',
      entity_type: 'person',
      entity_id: targetPersonId,
      metadata: JSON.stringify({ submissionPersonId }),
    });

    return targetPersonId;
  }).catch((err: unknown) => {
    if (err instanceof GuardError) return { guard: err.message } as const;
    throw err;
  });

  if (typeof result === 'object' && 'guard' in result) {
    return { ok: false, kind: 'guard', message: result.guard };
  }
  return getPersonAggregate(db, result);
}

class GuardError extends Error {}
