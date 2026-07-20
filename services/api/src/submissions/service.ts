import type { Insertable, Kysely } from 'kysely';
import { sql } from 'kysely';
import type { DB } from '../db/generated/db';
import { insertAuditEntry } from '../audit/repo';
import { consumeInvite } from '../invites/service';
import { normalize } from '../names';
import {
  insertConsent,
  insertSubmission,
  insertSubmissionPerson,
  insertSubmissionRelationship,
} from './repo';

type Db = Kysely<DB>;

const RECENT_SUBMISSIONS_WINDOW = "24 hours";
const MAX_SUBMISSIONS_PER_FINGERPRINT = 3;

const RELATIONSHIP_TYPES = new Set(['parent', 'partner', 'sibling', 'child', 'other']);
const LIVING_STATUSES = new Set(['living', 'deceased', 'unknown']);

export interface CreateSubmissionInput {
  payload: SubmissionPayload;
  clientFingerprint?: string;
  inviteToken?: string;
  /** honeypot | too_fast — stored as spam without tipping off the client. */
  spamSignal?: 'honeypot' | 'too_fast';
}

interface SubmissionPayload {
  payloadVersion?: number;
  people?: PayloadPerson[];
  relationships?: PayloadRelationship[];
  consents?: PayloadConsent[];
  [key: string]: unknown;
}
interface PayloadPerson {
  localKey: string;
  firstName?: string;
  middleName?: string;
  surname?: string;
  birthSurname?: string;
  nickname?: string;
  birthYear?: number;
  birthYearApprox?: boolean;
  deathYear?: number;
  deathYearApprox?: boolean;
  birthplace?: string;
  residences?: string;
  livingStatus?: string;
}
interface PayloadRelationship {
  fromLocalKey: string;
  toLocalKey: string;
  type: string;
  notes?: string;
}
interface PayloadConsent {
  consentType: string;
  consentVersion: string;
  accepted: boolean;
}

export type CreateSubmissionResult =
  | { ok: true; submissionId: string }
  | { ok: false; kind: 'rate_limited' }
  | { ok: false; kind: 'invite_invalid'; reason: string };

/** Exact year → from=to; approximate → ±3 window (never a fabricated date). */
function yearRange(year: number | undefined, approx: boolean | undefined): [number | null, number | null] {
  if (year === undefined) return [null, null];
  return approx ? [year - 3, year + 3] : [year, year];
}

async function countRecentSubmissions(db: Db, fingerprint: string): Promise<number> {
  const row = await db
    .selectFrom('submissions')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('client_fingerprint', '=', fingerprint)
    .where('status', 'in', ['pending', 'in_review', 'processed'])
    .where('submitted_at', '>', sql<Date>`now() - ${sql.lit(RECENT_SUBMISSIONS_WINDOW)}::interval`)
    .executeTakeFirst();
  return row ? Number(row.count) : 0;
}

/**
 * Stores an immutable submission with its staging people/relationships/consents
 * in one transaction (idea.md §7). Never writes canonical tables. Rate-limited
 * per fingerprint, or governed by invite consumption when a token is provided.
 */
export async function createSubmission(
  db: Db,
  input: CreateSubmissionInput,
  requestId: string,
): Promise<CreateSubmissionResult> {
  return db.transaction().execute(async (trx) => {
    let inviteId: string | null = null;

    if (input.inviteToken) {
      const consumed = await consumeInvite(trx, input.inviteToken);
      if (!consumed.ok) return { ok: false, kind: 'invite_invalid', reason: consumed.reason };
      inviteId = consumed.invite.id;
    } else if (input.clientFingerprint) {
      const recent = await countRecentSubmissions(trx, input.clientFingerprint);
      if (recent >= MAX_SUBMISSIONS_PER_FINGERPRINT) return { ok: false, kind: 'rate_limited' };
    }

    const status = input.spamSignal ? 'spam' : 'pending';
    const submission = await insertSubmission(trx, {
      invite_id: inviteId,
      status,
      original_payload: JSON.stringify(input.payload),
      client_fingerprint: input.clientFingerprint ?? null,
      spam_reason: input.spamSignal ?? null,
      submitted_at: new Date(),
    });

    for (const person of input.payload.people ?? []) {
      const [birthFrom, birthTo] = yearRange(person.birthYear, person.birthYearApprox);
      const [deathFrom, deathTo] = yearRange(person.deathYear, person.deathYearApprox);
      const row: Insertable<DB['submission_people']> = {
        submission_id: submission.id,
        local_key: person.localKey,
        first_name: person.firstName ?? null,
        middle_name: person.middleName ?? null,
        surname: person.surname ?? null,
        birth_surname: person.birthSurname ?? null,
        nickname: person.nickname ?? null,
        birth_year_from: birthFrom,
        birth_year_to: birthTo,
        death_year_from: deathFrom,
        death_year_to: deathTo,
        birthplace_text: person.birthplace ?? null,
        residence_text: person.residences ?? null,
        living_status: LIVING_STATUSES.has(person.livingStatus ?? '')
          ? (person.livingStatus as 'living' | 'deceased' | 'unknown')
          : 'unknown',
        normalized_name: normalize(
          [person.firstName, person.middleName, person.surname].filter(Boolean).join(' '),
        ),
      };
      await insertSubmissionPerson(trx, row);
    }

    for (const rel of input.payload.relationships ?? []) {
      if (!RELATIONSHIP_TYPES.has(rel.type)) continue;
      await insertSubmissionRelationship(trx, {
        submission_id: submission.id,
        from_local_key: rel.fromLocalKey,
        to_local_key: rel.toLocalKey,
        relationship_type: rel.type as 'parent' | 'partner' | 'sibling' | 'child' | 'other',
        notes: rel.notes ?? null,
      });
    }

    for (const consent of input.payload.consents ?? []) {
      await insertConsent(trx, {
        submission_id: submission.id,
        consent_type: consent.consentType as 'data_processing',
        consent_version: consent.consentVersion,
        accepted: consent.accepted,
        accepted_at: consent.accepted ? new Date() : null,
      });
    }

    await insertAuditEntry(trx, {
      actor_type: 'public',
      actor_id: 'public',
      action: 'submission.created',
      entity_type: 'submission',
      entity_id: submission.id,
      request_id: requestId,
      metadata: JSON.stringify({ status, people: (input.payload.people ?? []).length }),
    });

    return { ok: true, submissionId: submission.id };
  });
}
