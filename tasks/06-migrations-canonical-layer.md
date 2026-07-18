# Task 06: Migrations — canonical layer

**Depends on:** 05 · **Size:** L · **Spec:** idea.md §8 (people, person_names, places, person_events, parent_child_relationships, family_unions, union_partners, sources, evidence, match_candidates, person_merge_history), §7, §11

## Goal
Kysely migrations + basic typed queries for the canonical genealogy graph and its supporting tables.

## Requirements
1. New Kysely migration file(s), same conventions as Task 05. Tables per idea.md §8:
   - `people`: `living_status CHECK IN ('living','deceased','unknown')`, `privacy_level TEXT NOT NULL DEFAULT 'private' CHECK IN ('private','family','public')`, `notes`, `merged_into_person_id UUID REFERENCES people(id)`, `deleted_at`, timestamps.
   - `person_names`: fields per §8; `name_type CHECK IN ('primary','birth','married','alias','nickname','transliterated')`; `is_preferred BOOLEAN NOT NULL DEFAULT false`; partial unique index: one preferred name per `(person_id, name_type)` `WHERE is_preferred`; `source_id UUID` (FK added after `sources` exists in the same migration set).
   - `places`: per §8; `place_type CHECK IN ('country','region','municipality','settlement')`; `parent_place_id` self-FK; `UNIQUE (normalized_name, place_type, parent_place_id)` (nulls handled via `NULLS NOT DISTINCT` or a coalesce-based unique index).
   - `person_events`: per §8; `event_type CHECK IN ('birth','death','residence','migration','occupation','education')`; date fields `date_from DATE`, `date_to DATE`, `year_from INT`, `year_to INT`, `date_precision TEXT NOT NULL DEFAULT 'unknown' CHECK IN ('exact','month','year','approximate','range','unknown')`; `place_id` FK; `value TEXT` (occupation/education text); `CHECK (year_from <= year_to)` when both present. **The schema must make fake exact dates unnecessary** (idea.md §8).
   - `parent_child_relationships`: per §8 with `relationship_type CHECK IN ('biological','adoptive','step','foster','guardian','unknown')`, `verification_status TEXT NOT NULL DEFAULT 'proposed' CHECK IN ('proposed','confirmed','disputed','rejected')`, `confidence SMALLINT CHECK (confidence BETWEEN 0 AND 100)`, `family_union_id` FK; **`CHECK (parent_id <> child_id)`; `UNIQUE (parent_id, child_id, relationship_type)`** (cycle prevention itself is Task 22 logic).
   - `family_unions` (`union_type CHECK IN ('marriage','partnership','unknown')`) and `union_partners` (`union_id`, `person_id`, `UNIQUE (union_id, person_id)`). A person may appear in many unions; there is deliberately **no** `spouse_id` on `people` (idea.md §8).
   - `sources`: `source_type CHECK IN ('questionnaire','interview','birth_certificate','marriage_certificate','death_certificate','church_register','family_document','photograph','grave_marker','other')`, `title`, `description`, nullable `submission_id` FK, `created_at`.
   - `evidence`: `id`, `source_id` FK (ON DELETE RESTRICT), `subject_type CHECK IN ('person','person_name','person_event','parent_child_relationship','family_union')`, `subject_id UUID NOT NULL`, `assertion TEXT NOT NULL`, `stance TEXT NOT NULL CHECK IN ('supports','disputes')`, `confidence SMALLINT`, `notes`, `created_at`. Design goal per idea.md §8: many sources per assertion; disputes never auto-overwrite data.
   - `match_candidates`: per §8 + `UNIQUE (submission_person_id, canonical_person_id)`; `status TEXT NOT NULL DEFAULT 'pending' CHECK IN ('pending','accepted','rejected','deferred')`; `reasons JSONB NOT NULL`.
   - `person_merge_history`: per §8 (`source_person_id`, `target_person_id`, `actor_id`, `reason`, `snapshot JSONB NOT NULL`, `created_at`).
2. Add the deferred FK `submission_people.matched_person_id → people(id)`.
3. Indexes: `person_names (normalized_name)`, `person_names (person_id)`, `parent_child_relationships (parent_id)` and `(child_id)`, `union_partners (person_id)`, `person_events (person_id, event_type)`, `evidence (subject_type, subject_id)`, `match_candidates (submission_person_id)`, `people (merged_into_person_id)`.
4. Typed query helpers (Kysely, basics used by Stage 3): person insert/get/patch/list-search-by-normalized-name; person_names insert/list; places get-by-normalized/insert; person_events insert/list; parent_child insert/get/patch/delete/list-by-person; unions + partners insert/list; sources insert/get; evidence insert/list-by-subject; match_candidates upsert/list/set-status; merge history insert. Run `npm run codegen -w @familytree/api` to refresh `src/db/generated` and commit it.
5. Update `docs/data-model.md` (tables + ER diagram) to match exactly.

## Acceptance criteria
- Full `migrate up` / `down` to zero / `up` cycle passes on a clean DB.
- Constraint tests pass: self-parent CHECK fires; duplicate `(parent, child, type)` rejected; duplicate union partner rejected; one preferred primary name enforced.

## Verification
- Integration tests for the cycle above + constraint cases.
- Standard API verification + `npm run test:integration -w @familytree/api`.
- Commit as `task-06: canonical layer migrations`.
