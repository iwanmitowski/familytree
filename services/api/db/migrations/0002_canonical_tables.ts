import { sql, type Kysely } from 'kysely';

/**
 * Canonical genealogy graph (idea.md §8, docs/data-model.md): people,
 * person_names, places, person_events, parent_child_relationships,
 * family_unions, union_partners, sources, evidence, match_candidates,
 * person_merge_history — plus the deferred FK from
 * submission_people.matched_person_id to people.
 *
 * Notes:
 * - CHECK (parent_id <> child_id) blocks self-parenting at the DB level;
 *   full ancestry-cycle prevention is transactional logic (Task 22).
 * - One preferred name per (person_id, name_type) via a partial unique index.
 * - places dedupe uses a UNIQUE NULLS NOT DISTINCT index so two root-level
 *   places with the same normalized name cannot coexist (PG15+).
 * - evidence.source_id is ON DELETE RESTRICT: a source with evidence cannot
 *   be deleted; disputes never mutate subject rows (idea.md §8).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE people (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      living_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (living_status IN ('living', 'deceased', 'unknown')),
      privacy_level TEXT NOT NULL DEFAULT 'private'
        CHECK (privacy_level IN ('private', 'family', 'public')),
      notes TEXT,
      merged_into_person_id UUID REFERENCES people(id),
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT people_no_self_merge CHECK (merged_into_person_id <> id)
    )
  `.execute(db);
  await sql`CREATE INDEX people_merged_into_idx ON people (merged_into_person_id)`.execute(db);

  await sql`
    CREATE TABLE family_unions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      union_type TEXT NOT NULL DEFAULT 'unknown'
        CHECK (union_type IN ('marriage', 'partnership', 'unknown')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE union_partners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      union_id UUID NOT NULL REFERENCES family_unions(id) ON DELETE CASCADE,
      person_id UUID NOT NULL REFERENCES people(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT union_partners_unique UNIQUE (union_id, person_id)
    )
  `.execute(db);
  await sql`CREATE INDEX union_partners_person_idx ON union_partners (person_id)`.execute(db);

  await sql`
    CREATE TABLE sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_type TEXT NOT NULL CHECK (source_type IN (
        'questionnaire', 'interview', 'birth_certificate', 'marriage_certificate',
        'death_certificate', 'church_register', 'family_document', 'photograph',
        'grave_marker', 'other'
      )),
      title TEXT NOT NULL,
      description TEXT,
      submission_id UUID REFERENCES submissions(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX sources_submission_idx ON sources (submission_id)`.execute(db);

  await sql`
    CREATE TABLE person_names (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      first_name TEXT,
      middle_name TEXT,
      surname TEXT,
      birth_surname TEXT,
      nickname TEXT,
      normalized_name TEXT,
      transliterated_name TEXT,
      name_type TEXT NOT NULL DEFAULT 'primary'
        CHECK (name_type IN ('primary', 'birth', 'married', 'alias', 'nickname', 'transliterated')),
      is_preferred BOOLEAN NOT NULL DEFAULT false,
      source_id UUID REFERENCES sources(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX person_names_person_idx ON person_names (person_id)`.execute(db);
  await sql`CREATE INDEX person_names_normalized_idx ON person_names (normalized_name)`.execute(db);
  await sql`
    CREATE UNIQUE INDEX person_names_one_preferred_per_type
      ON person_names (person_id, name_type) WHERE is_preferred
  `.execute(db);

  await sql`
    CREATE TABLE places (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      place_type TEXT NOT NULL DEFAULT 'settlement'
        CHECK (place_type IN ('country', 'region', 'municipality', 'settlement')),
      parent_place_id UUID REFERENCES places(id),
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      country_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX places_dedupe_idx
      ON places (normalized_name, place_type, parent_place_id) NULLS NOT DISTINCT
  `.execute(db);

  await sql`
    CREATE TABLE person_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (event_type IN (
        'birth', 'death', 'residence', 'migration', 'occupation', 'education'
      )),
      place_id UUID REFERENCES places(id),
      value TEXT,
      date_from DATE,
      date_to DATE,
      year_from INTEGER,
      year_to INTEGER,
      date_precision TEXT NOT NULL DEFAULT 'unknown'
        CHECK (date_precision IN ('exact', 'month', 'year', 'approximate', 'range', 'unknown')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT person_events_years
        CHECK (year_from IS NULL OR year_to IS NULL OR year_from <= year_to),
      CONSTRAINT person_events_dates
        CHECK (date_from IS NULL OR date_to IS NULL OR date_from <= date_to)
    )
  `.execute(db);
  await sql`CREATE INDEX person_events_person_type_idx ON person_events (person_id, event_type)`.execute(
    db,
  );

  await sql`
    CREATE TABLE parent_child_relationships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      parent_id UUID NOT NULL REFERENCES people(id),
      child_id UUID NOT NULL REFERENCES people(id),
      relationship_type TEXT NOT NULL DEFAULT 'biological' CHECK (relationship_type IN (
        'biological', 'adoptive', 'step', 'foster', 'guardian', 'unknown'
      )),
      family_union_id UUID REFERENCES family_unions(id),
      verification_status TEXT NOT NULL DEFAULT 'proposed'
        CHECK (verification_status IN ('proposed', 'confirmed', 'disputed', 'rejected')),
      confidence SMALLINT CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT parent_child_not_self CHECK (parent_id <> child_id),
      CONSTRAINT parent_child_unique UNIQUE (parent_id, child_id, relationship_type)
    )
  `.execute(db);
  await sql`CREATE INDEX parent_child_parent_idx ON parent_child_relationships (parent_id)`.execute(
    db,
  );
  await sql`CREATE INDEX parent_child_child_idx ON parent_child_relationships (child_id)`.execute(
    db,
  );
  await sql`CREATE INDEX parent_child_union_idx ON parent_child_relationships (family_union_id)`.execute(
    db,
  );

  await sql`
    CREATE TABLE evidence (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id UUID NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
      subject_type TEXT NOT NULL CHECK (subject_type IN (
        'person', 'person_name', 'person_event', 'parent_child_relationship', 'family_union'
      )),
      subject_id UUID NOT NULL,
      assertion TEXT NOT NULL,
      stance TEXT NOT NULL CHECK (stance IN ('supports', 'disputes')),
      confidence SMALLINT CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100)),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX evidence_subject_idx ON evidence (subject_type, subject_id)`.execute(db);
  await sql`CREATE INDEX evidence_source_idx ON evidence (source_id)`.execute(db);

  await sql`
    CREATE TABLE match_candidates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_person_id UUID NOT NULL REFERENCES submission_people(id) ON DELETE CASCADE,
      canonical_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      score SMALLINT NOT NULL CHECK (score >= 0 AND score <= 100),
      reasons JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'deferred')),
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT match_candidates_unique UNIQUE (submission_person_id, canonical_person_id)
    )
  `.execute(db);
  await sql`CREATE INDEX match_candidates_submission_person_idx ON match_candidates (submission_person_id)`.execute(
    db,
  );
  await sql`CREATE INDEX match_candidates_person_idx ON match_candidates (canonical_person_id)`.execute(
    db,
  );

  await sql`
    CREATE TABLE person_merge_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_person_id UUID NOT NULL REFERENCES people(id),
      target_person_id UUID NOT NULL REFERENCES people(id),
      actor_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      snapshot JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);
  await sql`CREATE INDEX person_merge_history_target_idx ON person_merge_history (target_person_id)`.execute(
    db,
  );

  // Deferred FK from the staging layer (Task 05 left it FK-less).
  await sql`
    ALTER TABLE submission_people
      ADD CONSTRAINT submission_people_matched_person_fk
      FOREIGN KEY (matched_person_id) REFERENCES people(id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE submission_people DROP CONSTRAINT IF EXISTS submission_people_matched_person_fk`.execute(
    db,
  );
  await sql`DROP TABLE IF EXISTS person_merge_history`.execute(db);
  await sql`DROP TABLE IF EXISTS match_candidates`.execute(db);
  await sql`DROP TABLE IF EXISTS evidence`.execute(db);
  await sql`DROP TABLE IF EXISTS parent_child_relationships`.execute(db);
  await sql`DROP TABLE IF EXISTS person_events`.execute(db);
  await sql`DROP TABLE IF EXISTS places`.execute(db);
  await sql`DROP TABLE IF EXISTS person_names`.execute(db);
  await sql`DROP TABLE IF EXISTS sources`.execute(db);
  await sql`DROP TABLE IF EXISTS union_partners`.execute(db);
  await sql`DROP TABLE IF EXISTS family_unions`.execute(db);
  await sql`DROP TABLE IF EXISTS people`.execute(db);
}
