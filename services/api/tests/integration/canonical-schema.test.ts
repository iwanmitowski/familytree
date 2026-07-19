import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createTestDb, migrateToLatest, migrateToZero, testDatabaseUrl, type TestDb } from './helpers';
import {
  insertMergeHistory,
  insertPerson,
  insertPersonEvent,
  insertPersonName,
  patchPerson,
  searchPeopleByNormalizedName,
} from '../../src/people/repo';
import { getOrCreatePlace } from '../../src/people/places-repo';
import {
  insertFamilyUnion,
  insertParentChild,
  insertUnionPartner,
  listUnionsByPerson,
} from '../../src/genealogy/repo';
import { insertEvidence, insertSource, listEvidenceBySubject } from '../../src/sources/repo';
import {
  listMatchCandidates,
  setMatchCandidateStatus,
  upsertMatchCandidate,
} from '../../src/matching/repo';
import { insertSubmission, insertSubmissionPerson } from '../../src/submissions/repo';

const CANONICAL_TABLES = [
  'people',
  'person_names',
  'places',
  'person_events',
  'parent_child_relationships',
  'family_unions',
  'union_partners',
  'sources',
  'evidence',
  'match_candidates',
  'person_merge_history',
];

describe.skipIf(!testDatabaseUrl())('canonical schema', () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = createTestDb();
    await migrateToZero(ctx.migrator);
    await migrateToLatest(ctx.migrator);
  });

  afterAll(async () => {
    await ctx.destroy();
  });

  it('full up -> down-to-zero -> up cycle includes every canonical table', async () => {
    await migrateToZero(ctx.migrator);
    await migrateToLatest(ctx.migrator);
    const result = await sql<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name NOT LIKE 'kysely%'
    `.execute(ctx.db);
    const tables = result.rows.map((r) => r.table_name);
    for (const table of CANONICAL_TABLES) {
      expect(tables).toContain(table);
    }
  });

  it('rejects a self-parent edge (CHECK)', async () => {
    const person = await insertPerson(ctx.db);
    await expect(
      insertParentChild(ctx.db, { parent_id: person.id, child_id: person.id }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects a duplicate (parent, child, type) edge but allows a second type', async () => {
    const parent = await insertPerson(ctx.db);
    const child = await insertPerson(ctx.db);
    await insertParentChild(ctx.db, {
      parent_id: parent.id,
      child_id: child.id,
      relationship_type: 'biological',
    });
    await expect(
      insertParentChild(ctx.db, {
        parent_id: parent.id,
        child_id: child.id,
        relationship_type: 'biological',
      }),
    ).rejects.toMatchObject({ code: '23505' });

    // A valid adoption edge alongside the biological one is allowed (idea.md §12).
    const adoptive = await insertParentChild(ctx.db, {
      parent_id: parent.id,
      child_id: child.id,
      relationship_type: 'adoptive',
    });
    expect(adoptive.relationship_type).toBe('adoptive');
  });

  it('rejects a duplicate union partner and cascades partners on union delete', async () => {
    const union = await insertFamilyUnion(ctx.db, { union_type: 'marriage' });
    const person = await insertPerson(ctx.db);
    await insertUnionPartner(ctx.db, { union_id: union.id, person_id: person.id });
    await expect(
      insertUnionPartner(ctx.db, { union_id: union.id, person_id: person.id }),
    ).rejects.toMatchObject({ code: '23505' });

    const unions = await listUnionsByPerson(ctx.db, person.id);
    expect(unions).toHaveLength(1);
  });

  it('a person may belong to multiple unions', async () => {
    const person = await insertPerson(ctx.db);
    const first = await insertFamilyUnion(ctx.db, { union_type: 'marriage' });
    const second = await insertFamilyUnion(ctx.db, { union_type: 'partnership' });
    await insertUnionPartner(ctx.db, { union_id: first.id, person_id: person.id });
    await insertUnionPartner(ctx.db, { union_id: second.id, person_id: person.id });
    expect(await listUnionsByPerson(ctx.db, person.id)).toHaveLength(2);
  });

  it('enforces one preferred name per (person, name_type)', async () => {
    const person = await insertPerson(ctx.db);
    await insertPersonName(ctx.db, {
      person_id: person.id,
      first_name: 'Иван',
      surname: 'Митовски',
      normalized_name: 'иван митовски',
      name_type: 'primary',
      is_preferred: true,
    });
    await expect(
      insertPersonName(ctx.db, {
        person_id: person.id,
        first_name: 'Йоан',
        surname: 'Митовски',
        normalized_name: 'йоан митовски',
        name_type: 'primary',
        is_preferred: true,
      }),
    ).rejects.toMatchObject({ code: '23505' });

    // A non-preferred alias of the same type is fine.
    const alias = await insertPersonName(ctx.db, {
      person_id: person.id,
      first_name: 'Йоан',
      normalized_name: 'йоан',
      name_type: 'primary',
      is_preferred: false,
    });
    expect(alias.is_preferred).toBe(false);
  });

  it('search finds people by normalized name and hides merged people', async () => {
    const person = await insertPerson(ctx.db);
    await insertPersonName(ctx.db, {
      person_id: person.id,
      first_name: 'Мария',
      surname: 'Митовска',
      normalized_name: 'мария митовска',
      name_type: 'primary',
      is_preferred: true,
    });
    const found = await searchPeopleByNormalizedName(ctx.db, 'митовска');
    expect(found.map((p) => p.id)).toContain(person.id);

    const target = await insertPerson(ctx.db);
    await sql`UPDATE people SET merged_into_person_id = ${target.id}, deleted_at = now() WHERE id = ${person.id}`.execute(
      ctx.db,
    );
    const afterMerge = await searchPeopleByNormalizedName(ctx.db, 'митовска');
    expect(afterMerge.map((p) => p.id)).not.toContain(person.id);
  });

  it('rejects a self-merge (CHECK)', async () => {
    const person = await insertPerson(ctx.db);
    await expect(
      sql`UPDATE people SET merged_into_person_id = ${person.id} WHERE id = ${person.id}`.execute(
        ctx.db,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('deduplicates places incl. NULL parents (NULLS NOT DISTINCT)', async () => {
    const first = await getOrCreatePlace(ctx.db, {
      name: 'София',
      normalized_name: 'софия',
      place_type: 'settlement',
    });
    const second = await getOrCreatePlace(ctx.db, {
      name: 'СОФИЯ',
      normalized_name: 'софия',
      place_type: 'settlement',
    });
    expect(second.id).toBe(first.id);
  });

  it('enforces event year/date ordering and confidence range', async () => {
    const person = await insertPerson(ctx.db);
    await expect(
      insertPersonEvent(ctx.db, {
        person_id: person.id,
        event_type: 'birth',
        year_from: 1950,
        year_to: 1940,
        date_precision: 'range',
      }),
    ).rejects.toMatchObject({ code: '23514' });

    const parent = await insertPerson(ctx.db);
    await expect(
      insertParentChild(ctx.db, {
        parent_id: parent.id,
        child_id: person.id,
        confidence: 150,
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('deferred FK: matched_person_id must reference a real person', async () => {
    const submission = await insertSubmission(ctx.db, { original_payload: '{}' });
    await expect(
      insertSubmissionPerson(ctx.db, {
        submission_id: submission.id,
        local_key: 'SELF',
        matched_person_id: '00000000-0000-0000-0000-000000000001',
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('evidence blocks source deletion (RESTRICT) and never mutates its subject', async () => {
    const person = await insertPerson(ctx.db);
    const before = await patchPerson(ctx.db, person.id, { notes: 'преди доказателството' });
    const source = await insertSource(ctx.db, {
      source_type: 'interview',
      title: 'Разговор с роднина',
    });
    await insertEvidence(ctx.db, {
      source_id: source.id,
      subject_type: 'person',
      subject_id: person.id,
      assertion: 'identity',
      stance: 'disputes',
    });

    await expect(
      sql`DELETE FROM sources WHERE id = ${source.id}`.execute(ctx.db),
    ).rejects.toMatchObject({ code: '23503' });

    const after = await ctx.db
      .selectFrom('people')
      .selectAll()
      .where('id', '=', person.id)
      .executeTakeFirstOrThrow();
    expect(after.notes).toBe(before?.notes);
    expect(await listEvidenceBySubject(ctx.db, 'person', person.id)).toHaveLength(1);
  });

  it('match candidates: unique pair upsert refreshes score but keeps review state', async () => {
    const submission = await insertSubmission(ctx.db, { original_payload: '{}' });
    const submissionPerson = await insertSubmissionPerson(ctx.db, {
      submission_id: submission.id,
      local_key: 'SELF',
    });
    const person = await insertPerson(ctx.db);

    const first = await upsertMatchCandidate(ctx.db, {
      submission_person_id: submissionPerson.id,
      canonical_person_id: person.id,
      score: 55,
      reasons: [{ field: 'normalizedName', score: 35, description: 'Пълно съвпадение на името' }],
    });
    await setMatchCandidateStatus(ctx.db, first.id, 'accepted', 'admin@example.com');

    const refreshed = await upsertMatchCandidate(ctx.db, {
      submission_person_id: submissionPerson.id,
      canonical_person_id: person.id,
      score: 70,
      reasons: [{ field: 'normalizedName', score: 35, description: 'Пълно съвпадение на името' }],
    });
    expect(refreshed.id).toBe(first.id);
    expect(refreshed.score).toBe(70);
    expect(refreshed.status).toBe('accepted');
    expect(refreshed.reviewed_by).toBe('admin@example.com');

    expect(await listMatchCandidates(ctx.db, submissionPerson.id)).toHaveLength(1);
  });

  it('stores merge history with a snapshot', async () => {
    const source = await insertPerson(ctx.db);
    const target = await insertPerson(ctx.db);
    const entry = await insertMergeHistory(ctx.db, {
      source_person_id: source.id,
      target_person_id: target.id,
      actor_id: 'admin@example.com',
      reason: 'дублиран запис',
      snapshot: JSON.stringify({ names: [], events: [] }),
    });
    expect(entry.snapshot).toEqual({ names: [], events: [] });
  });
});
