import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import {
  getSubmission,
  listSubmissionPeople,
  listSubmissions,
  type SubmissionRow,
  type ListSubmissionsOptions,
} from './repo';

type Db = Kysely<DB>;

interface PayloadShape {
  participant?: { name?: string };
  people?: unknown[];
  origin?: { hasMaterials?: string };
  relationships?: { fromLocalKey: string; toLocalKey: string; relationshipType?: string; type?: string; notes?: string }[];
  consents?: { consentType: string; consentVersion: string; accepted: boolean }[];
}

function payloadOf(row: SubmissionRow): PayloadShape {
  const p = row.original_payload;
  return (p && typeof p === 'object' ? p : {}) as PayloadShape;
}

export interface SubmissionListItem {
  id: string;
  status: SubmissionRow['status'];
  participantName: string | null;
  campaign: string | null;
  peopleCount: number;
  hasMaterials: boolean;
  submittedAt: string | null;
}

export async function listSubmissionsForAdmin(
  db: Db,
  opts: ListSubmissionsOptions,
): Promise<{ items: SubmissionListItem[] }> {
  const rows = await listSubmissions(db, opts);
  const campaigns = await campaignByInvite(db, rows);
  const items = rows.map((row) => {
    const payload = payloadOf(row);
    return {
      id: row.id,
      status: row.status,
      participantName: payload.participant?.name ?? null,
      campaign: row.invite_id ? (campaigns.get(row.invite_id) ?? null) : null,
      peopleCount: Array.isArray(payload.people) ? payload.people.length : 0,
      hasMaterials: payload.origin?.hasMaterials === 'yes',
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
    };
  });
  return { items };
}

async function campaignByInvite(db: Db, rows: SubmissionRow[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(rows.map((r) => r.invite_id).filter((x): x is string => !!x))];
  if (ids.length === 0) return new Map();
  const invites = await db
    .selectFrom('invites')
    .select(['id', 'campaign'])
    .where('id', 'in', ids)
    .execute();
  return new Map(invites.map((i) => [i.id, i.campaign]));
}

export interface SubmissionDetail extends SubmissionListItem {
  originalPayload: unknown;
  clientFingerprintPrefix: string | null;
  spamReason: string | null;
  processingStartedAt: string | null;
  processedAt: string | null;
  rejectedAt: string | null;
  people: unknown[];
  relationships: unknown[];
  consents: unknown[];
}

export async function getSubmissionDetail(
  db: Db,
  id: string,
): Promise<SubmissionDetail | undefined> {
  const row = await getSubmission(db, id);
  if (!row) return undefined;
  const payload = payloadOf(row);
  const people = await listSubmissionPeople(db, id);
  const relationships = await db
    .selectFrom('submission_relationships')
    .selectAll()
    .where('submission_id', '=', id)
    .execute();
  const consents = await db
    .selectFrom('consents')
    .selectAll()
    .where('submission_id', '=', id)
    .execute();

  return {
    id: row.id,
    status: row.status,
    participantName: payload.participant?.name ?? null,
    campaign: null,
    peopleCount: people.length,
    hasMaterials: payload.origin?.hasMaterials === 'yes',
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
    originalPayload: row.original_payload,
    // Never expose the full fingerprint — only a short prefix (idea.md §6).
    clientFingerprintPrefix: row.client_fingerprint ? row.client_fingerprint.slice(0, 12) : null,
    spamReason: row.spam_reason,
    processingStartedAt: row.processing_started_at
      ? new Date(row.processing_started_at).toISOString()
      : null,
    processedAt: row.processed_at ? new Date(row.processed_at).toISOString() : null,
    rejectedAt: row.rejected_at ? new Date(row.rejected_at).toISOString() : null,
    people,
    relationships,
    consents,
  };
}
