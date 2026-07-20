import { sql, type Kysely } from 'kysely';

/**
 * Private uploaded files (idea.md §24 Phase 6, §15): photos and documents
 * attached to a person and/or a source. `storage_key` is server-generated and
 * NEVER user-controlled. Files are excluded from every public view; access is
 * admin-only and streamed through the API. Soft-deleted via `deleted_at`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      person_id UUID REFERENCES people(id) ON DELETE SET NULL,
      source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
      original_filename TEXT NOT NULL,
      content_type TEXT NOT NULL
        CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
      size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
      sha256 TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      uploaded_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ,
      CONSTRAINT files_subject_present CHECK (person_id IS NOT NULL OR source_id IS NOT NULL)
    )
  `.execute(db);
  await sql`CREATE INDEX files_person_idx ON files (person_id) WHERE deleted_at IS NULL`.execute(db);
  await sql`CREATE INDEX files_source_idx ON files (source_id) WHERE deleted_at IS NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS files`.execute(db);
}
