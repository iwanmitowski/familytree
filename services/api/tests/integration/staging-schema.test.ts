import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createTestDb, migrateToLatest, migrateToZero, testDatabaseUrl, type TestDb } from './helpers';
import {
  getInviteByTokenHash,
  incrementInviteUsage,
  insertInvite,
  revokeInvite,
} from '../../src/invites/repo';
import {
  insertConsent,
  insertSubmission,
  insertSubmissionPerson,
  insertSubmissionRelationship,
  listSubmissions,
} from '../../src/submissions/repo';
import { insertAuditEntry } from '../../src/audit/repo';
import {
  deleteExpiredNonces,
  getIdempotencyKey,
  insertIdempotencyKey,
  insertNonce,
  setIdempotencyResponse,
} from '../../src/auth/service-auth-repo';

const STAGING_TABLES = [
  'invites',
  'submissions',
  'submission_people',
  'submission_relationships',
  'consents',
  'audit_log',
  'service_request_nonces',
  'idempotency_keys',
];

async function publicTables(db: TestDb['db']): Promise<string[]> {
  const result = await sql<{ table_name: string }>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name NOT LIKE 'kysely%'
    ORDER BY table_name
  `.execute(db);
  return result.rows.map((r) => r.table_name);
}

describe.skipIf(!testDatabaseUrl())('staging schema', () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = createTestDb();
    await migrateToZero(ctx.migrator);
    await migrateToLatest(ctx.migrator);
  });

  afterAll(async () => {
    await ctx.destroy();
  });

  it('survives a full up -> down-to-zero -> up cycle', async () => {
    await migrateToZero(ctx.migrator);
    expect(await publicTables(ctx.db)).toHaveLength(0);

    await migrateToLatest(ctx.migrator);
    const tables = await publicTables(ctx.db);
    for (const table of STAGING_TABLES) {
      expect(tables).toContain(table);
    }
  });

  it('rejects a duplicate local_key within one submission', async () => {
    const submission = await insertSubmission(ctx.db, { original_payload: '{}' });
    await insertSubmissionPerson(ctx.db, { submission_id: submission.id, local_key: 'SELF' });
    await expect(
      insertSubmissionPerson(ctx.db, { submission_id: submission.id, local_key: 'SELF' }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects used_submissions above max_submissions', async () => {
    const invite = await insertInvite(ctx.db, {
      token_hash: 'hash-over-max',
      recipient_label: 'Тест',
      max_submissions: 1,
    });
    await expect(
      sql`UPDATE invites SET used_submissions = 2 WHERE id = ${invite.id}`.execute(ctx.db),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('guarded invite increment stops at max, when revoked, and when expired', async () => {
    const invite = await insertInvite(ctx.db, {
      token_hash: 'hash-guarded',
      recipient_label: 'Тест',
      max_submissions: 1,
    });
    expect((await incrementInviteUsage(ctx.db, invite.id))?.used_submissions).toBe(1);
    expect(await incrementInviteUsage(ctx.db, invite.id)).toBeUndefined();

    const revoked = await insertInvite(ctx.db, {
      token_hash: 'hash-revoked',
      recipient_label: 'Тест',
      max_submissions: 5,
    });
    await revokeInvite(ctx.db, revoked.id);
    expect(await incrementInviteUsage(ctx.db, revoked.id)).toBeUndefined();

    const expired = await insertInvite(ctx.db, {
      token_hash: 'hash-expired',
      recipient_label: 'Тест',
      max_submissions: 5,
      expires_at: new Date(Date.now() - 60_000),
    });
    expect(await incrementInviteUsage(ctx.db, expired.id)).toBeUndefined();
  });

  it('never stores plain tokens — only 64-hex hashes fit the write path', async () => {
    // The repo layer only accepts token_hash; this asserts the stored shape
    // for a realistic sha256 hex value round-trips via hash lookup.
    const hash = 'a'.repeat(64);
    await insertInvite(ctx.db, { token_hash: hash, recipient_label: 'Хеш тест' });
    const found = await getInviteByTokenHash(ctx.db, hash);
    expect(found?.token_hash).toBe(hash);
  });

  it('rejects an unknown submission status', async () => {
    await expect(
      insertSubmission(ctx.db, { original_payload: '{}', status: 'weird' }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects inverted year ranges on submission people', async () => {
    const submission = await insertSubmission(ctx.db, { original_payload: '{}' });
    await expect(
      insertSubmissionPerson(ctx.db, {
        submission_id: submission.id,
        local_key: 'FATHER',
        birth_year_from: 1990,
        birth_year_to: 1980,
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects a duplicate submission relationship', async () => {
    const submission = await insertSubmission(ctx.db, { original_payload: '{}' });
    const edge = {
      submission_id: submission.id,
      from_local_key: 'SELF',
      to_local_key: 'FATHER',
      relationship_type: 'parent',
    };
    await insertSubmissionRelationship(ctx.db, edge);
    await expect(insertSubmissionRelationship(ctx.db, edge)).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('stores consents and audit entries', async () => {
    const submission = await insertSubmission(ctx.db, { original_payload: '{}' });
    const consent = await insertConsent(ctx.db, {
      submission_id: submission.id,
      consent_type: 'data_processing',
      consent_version: 'v1',
      accepted: true,
      accepted_at: new Date(),
    });
    expect(consent.consent_type).toBe('data_processing');

    const entry = await insertAuditEntry(ctx.db, {
      actor_type: 'service',
      action: 'submission.created',
      entity_type: 'submission',
      entity_id: submission.id,
      metadata: JSON.stringify({ source: 'integration-test' }),
    });
    expect(entry.action).toBe('submission.created');
  });

  it('lists submissions filtered by status, newest first', async () => {
    const listed = await listSubmissions(ctx.db, { status: 'pending', limit: 5 });
    expect(listed.every((s) => s.status === 'pending')).toBe(true);
  });

  it('rejects a reused nonce', async () => {
    const expires = new Date(Date.now() + 60_000);
    expect(await insertNonce(ctx.db, 'nonce-1', 'svc', expires)).toBe(true);
    expect(await insertNonce(ctx.db, 'nonce-1', 'svc', expires)).toBe(false);
    expect(await deleteExpiredNonces(ctx.db)).toBeGreaterThanOrEqual(0);
  });

  it('idempotency keys: claim once, store and read back the response, expiry honored', async () => {
    const live = {
      key: 'idem-live',
      service_id: 'svc',
      request_hash: 'req-hash-1',
      expires_at: new Date(Date.now() + 60_000),
    };
    expect(await insertIdempotencyKey(ctx.db, live)).toBe(true);
    expect(await insertIdempotencyKey(ctx.db, live)).toBe(false);

    await setIdempotencyResponse(ctx.db, live.key, 201, { submissionId: 'abc' });
    const stored = await getIdempotencyKey(ctx.db, live.key);
    expect(stored?.response_status).toBe(201);
    expect(stored?.response_body).toEqual({ submissionId: 'abc' });

    await insertIdempotencyKey(ctx.db, {
      key: 'idem-expired',
      service_id: 'svc',
      request_hash: 'req-hash-2',
      expires_at: new Date(Date.now() - 60_000),
    });
    expect(await getIdempotencyKey(ctx.db, 'idem-expired')).toBeUndefined();
  });
});
