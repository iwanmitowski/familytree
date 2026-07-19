import { createHash, randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { insertAuditEntry } from '../audit/repo';
import {
  consumeInviteByHash,
  getInviteByTokenHash,
  incrementInviteUsage,
  insertInvite,
  listInvites,
  revokeInvite,
  type InviteRow,
} from './repo';

type Db = Kysely<DB>;

/** Never store the plain token — only its SHA-256 hex (idea.md §8). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 32 bytes of entropy, base64url, prefixed for recognizability. */
export function generateToken(): string {
  return `inv_${randomBytes(32).toString('base64url')}`;
}

export type InviteValidationReason = 'expired' | 'revoked' | 'exhausted' | 'not_found';

export interface PublicInvite {
  id: string;
  recipientLabel: string;
  campaign: string | null;
  expiresAt: string | null;
  maxSubmissions: number;
  usedSubmissions: number;
  revokedAt: string | null;
  expired: boolean;
  createdAt: string;
}

/** Row → API shape. Never exposes token_hash. */
export function toPublicInvite(row: InviteRow): PublicInvite {
  const expired = row.expires_at != null && new Date(row.expires_at).getTime() <= Date.now();
  return {
    id: row.id,
    recipientLabel: row.recipient_label,
    campaign: row.campaign,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    maxSubmissions: row.max_submissions,
    usedSubmissions: row.used_submissions,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    expired,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export interface CreateInviteInput {
  recipientLabel: string;
  campaign?: string | null;
  expiresAt?: string | null;
  maxSubmissions?: number;
}

export interface CreatedInvite extends PublicInvite {
  /** The plain token — returned exactly once, never stored or logged. */
  token: string;
}

export async function createInvite(
  db: Db,
  input: CreateInviteInput,
  actorId: string,
): Promise<CreatedInvite> {
  const token = generateToken();
  const row = await insertInvite(db, {
    token_hash: hashToken(token),
    recipient_label: input.recipientLabel,
    campaign: input.campaign ?? null,
    expires_at: input.expiresAt ? new Date(input.expiresAt) : null,
    max_submissions: input.maxSubmissions ?? 1,
  });
  await insertAuditEntry(db, {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'invite.created',
    entity_type: 'invite',
    entity_id: row.id,
    metadata: JSON.stringify({ campaign: row.campaign, maxSubmissions: row.max_submissions }),
  });
  return { ...toPublicInvite(row), token };
}

export async function listPublicInvites(db: Db): Promise<PublicInvite[]> {
  const rows = await listInvites(db);
  return rows.map(toPublicInvite);
}

export async function revokeInviteById(
  db: Db,
  id: string,
  actorId: string,
): Promise<PublicInvite | undefined> {
  const row = await revokeInvite(db, id);
  if (!row) return undefined;
  await insertAuditEntry(db, {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'invite.revoked',
    entity_type: 'invite',
    entity_id: row.id,
  });
  return toPublicInvite(row);
}

export interface InviteValidation {
  valid: boolean;
  reason?: InviteValidationReason;
}

/**
 * Read-only validation used by the BFF before rendering the form. Does not
 * distinguish a bad token format from a genuinely missing one (both not_found).
 */
export async function validateToken(db: Db, token: string): Promise<InviteValidation> {
  if (!token) return { valid: false, reason: 'not_found' };
  const row = await getInviteByTokenHash(db, hashToken(token));
  const reason = inviteFailureReason(row);
  return reason ? { valid: false, reason } : { valid: true };
}

export type ConsumeResult =
  | { ok: true; invite: InviteRow }
  | { ok: false; reason: InviteValidationReason };

/**
 * Atomically consumes one usage slot inside the caller's transaction
 * (idea.md §6). Used by the submission pipeline (Task 16).
 */
export async function consumeInvite(trx: Db, token: string): Promise<ConsumeResult> {
  const tokenHash = hashToken(token);
  const consumed = await consumeInviteByHash(trx, tokenHash);
  if (consumed) return { ok: true, invite: consumed };
  // Guard failed — diagnose why for a precise error.
  const row = await getInviteByTokenHash(trx, tokenHash);
  return { ok: false, reason: inviteFailureReason(row) ?? 'not_found' };
}

/** null when the invite is currently usable, else the failure reason. */
function inviteFailureReason(row: InviteRow | undefined): InviteValidationReason | null {
  if (!row) return 'not_found';
  if (row.revoked_at) return 'revoked';
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return 'expired';
  if (row.used_submissions >= row.max_submissions) return 'exhausted';
  return null;
}

// Re-exported so Task 16 can consume within its transaction without importing repo.
export { incrementInviteUsage };
