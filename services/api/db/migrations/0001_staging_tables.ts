import { sql, type Kysely } from 'kysely';

/**
 * Staging layer (idea.md §8, docs/data-model.md): invites, submissions,
 * submission_people, submission_relationships, consents, audit_log, plus the
 * HMAC support tables service_request_nonces and idempotency_keys.
 *
 * Conventions: UUID PKs via gen_random_uuid(), TIMESTAMPTZ everywhere,
 * enums enforced with CHECK constraints, updated_at is app-managed.
 * submission_people.matched_person_id gets its FK to people in Task 06.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE invites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token_hash TEXT NOT NULL UNIQUE,
      recipient_label TEXT NOT NULL,
      campaign TEXT,
      expires_at TIMESTAMPTZ,
      max_submissions INTEGER NOT NULL DEFAULT 1,
      used_submissions INTEGER NOT NULL DEFAULT 0,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT invites_max_positive CHECK (max_submissions > 0),
      CONSTRAINT invites_usage_within_max
        CHECK (used_submissions >= 0 AND used_submissions <= max_submissions)
    )
  `.execute(db);

  await sql`
    CREATE TABLE submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invite_id UUID REFERENCES invites(id),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('draft', 'pending', 'in_review', 'processed', 'rejected', 'spam')),
      original_payload JSONB NOT NULL,
      client_fingerprint TEXT,
      spam_reason TEXT,
      submitted_at TIMESTAMPTZ,
      processing_started_at TIMESTAMPTZ,
      processed_at TIMESTAMPTZ,
      rejected_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX submissions_status_submitted_idx ON submissions (status, submitted_at DESC)`.execute(
    db,
  );
  await sql`CREATE INDEX submissions_fingerprint_idx ON submissions (client_fingerprint, submitted_at)`.execute(
    db,
  );
  await sql`CREATE INDEX submissions_invite_idx ON submissions (invite_id)`.execute(db);

  await sql`
    CREATE TABLE submission_people (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      local_key TEXT NOT NULL,
      first_name TEXT,
      middle_name TEXT,
      surname TEXT,
      birth_surname TEXT,
      nickname TEXT,
      birth_year_from INTEGER,
      birth_year_to INTEGER,
      death_year_from INTEGER,
      death_year_to INTEGER,
      birthplace_text TEXT,
      residence_text TEXT,
      living_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (living_status IN ('living', 'deceased', 'unknown')),
      normalized_name TEXT,
      matched_person_id UUID,
      resolution_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (resolution_status IN ('pending', 'created', 'linked', 'deferred', 'ignored')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT submission_people_local_key_unique UNIQUE (submission_id, local_key),
      CONSTRAINT submission_people_birth_years
        CHECK (birth_year_from IS NULL OR birth_year_to IS NULL OR birth_year_from <= birth_year_to),
      CONSTRAINT submission_people_death_years
        CHECK (death_year_from IS NULL OR death_year_to IS NULL OR death_year_from <= death_year_to)
    )
  `.execute(db);
  await sql`CREATE INDEX submission_people_submission_idx ON submission_people (submission_id)`.execute(
    db,
  );
  await sql`CREATE INDEX submission_people_normalized_name_idx ON submission_people (normalized_name)`.execute(
    db,
  );
  await sql`CREATE INDEX submission_people_matched_person_idx ON submission_people (matched_person_id)`.execute(
    db,
  );

  await sql`
    CREATE TABLE submission_relationships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      from_local_key TEXT NOT NULL,
      to_local_key TEXT NOT NULL,
      relationship_type TEXT NOT NULL
        CHECK (relationship_type IN ('parent', 'partner', 'sibling', 'child', 'other')),
      notes TEXT,
      CONSTRAINT submission_relationships_unique
        UNIQUE (submission_id, from_local_key, to_local_key, relationship_type)
    )
  `.execute(db);
  await sql`CREATE INDEX submission_relationships_submission_idx ON submission_relationships (submission_id)`.execute(
    db,
  );

  await sql`
    CREATE TABLE consents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      consent_type TEXT NOT NULL
        CHECK (consent_type IN ('data_processing', 'contact', 'family_visibility', 'public_display', 'media_usage')),
      consent_version TEXT NOT NULL,
      accepted BOOLEAN NOT NULL,
      accepted_at TIMESTAMPTZ,
      withdrawn_at TIMESTAMPTZ
    )
  `.execute(db);
  await sql`CREATE INDEX consents_submission_idx ON consents (submission_id)`.execute(db);

  await sql`
    CREATE TABLE audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'service', 'system', 'public')),
      actor_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id UUID,
      request_id TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id)`.execute(db);
  await sql`CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC)`.execute(db);

  await sql`
    CREATE TABLE service_request_nonces (
      nonce TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX service_request_nonces_expires_idx ON service_request_nonces (expires_at)`.execute(
    db,
  );

  await sql`
    CREATE TABLE idempotency_keys (
      key TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_status INTEGER,
      response_body JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `.execute(db);
  await sql`CREATE INDEX idempotency_keys_expires_idx ON idempotency_keys (expires_at)`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS idempotency_keys`.execute(db);
  await sql`DROP TABLE IF EXISTS service_request_nonces`.execute(db);
  await sql`DROP TABLE IF EXISTS audit_log`.execute(db);
  await sql`DROP TABLE IF EXISTS consents`.execute(db);
  await sql`DROP TABLE IF EXISTS submission_relationships`.execute(db);
  await sql`DROP TABLE IF EXISTS submission_people`.execute(db);
  await sql`DROP TABLE IF EXISTS submissions`.execute(db);
  await sql`DROP TABLE IF EXISTS invites`.execute(db);
}
