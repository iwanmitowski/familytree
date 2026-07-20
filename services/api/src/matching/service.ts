import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { normalize } from '../names';
import { insertAuditEntry } from '../audit/repo';
import { score, type PersonMatchContext, type MatchReason } from './score';
import { listMatchCandidates, upsertMatchCandidate } from './repo';

type Db = Kysely<DB>;

const MIN_SCORE = 30;
const MAX_CANDIDATES = 10;
const MAX_PREFILTER = 50;

export interface RankedCandidate {
  id: string;
  canonicalPersonId: string;
  score: number;
  reasons: MatchReason[];
  status: string;
  person: { id: string; label: string; birthYear: number | null };
}

export type FindMatchesResult =
  | { ok: true; candidates: RankedCandidate[] }
  | { ok: false; kind: 'not_found' };

interface CandidateRow {
  person_id: string;
  normalized_name: string | null;
  label: string | null;
  birth_surname: string | null;
  nickname: string | null;
  birth_year_from: number | null;
  birth_year_to: number | null;
  birthplace: string | null;
}

/** Builds the match context for the submitted person. */
async function submissionContext(
  db: Db,
  submissionPersonId: string,
): Promise<{ ctx: PersonMatchContext; submissionId: string } | undefined> {
  const sp = await db
    .selectFrom('submission_people')
    .selectAll()
    .where('id', '=', submissionPersonId)
    .executeTakeFirst();
  if (!sp) return undefined;
  return {
    submissionId: sp.submission_id,
    ctx: {
      normalizedName: sp.normalized_name ?? '',
      birthSurname: sp.birth_surname ? normalize(sp.birth_surname) : null,
      nickname: sp.nickname ? normalize(sp.nickname) : null,
      birthYearFrom: sp.birth_year_from,
      birthYearTo: sp.birth_year_to,
      birthplaceNormalized: sp.birthplace_text ? normalize(sp.birthplace_text) : null,
    },
  };
}

/**
 * Prefilters canonical people by shared name token OR a birth year within ±2,
 * excluding merged/deleted people. Returns up to MAX_PREFILTER candidate rows
 * with the fields needed for scoring.
 */
async function prefilterCandidates(db: Db, ctx: PersonMatchContext): Promise<CandidateRow[]> {
  const nameTokens = ctx.normalizedName.split(' ').filter(Boolean);
  const spYear =
    ctx.birthYearFrom != null && ctx.birthYearTo != null
      ? (ctx.birthYearFrom + ctx.birthYearTo) / 2
      : (ctx.birthYearFrom ?? ctx.birthYearTo ?? null);

  // Candidate person ids by shared name token.
  const idsByName = nameTokens.length
    ? await db
        .selectFrom('person_names')
        .innerJoin('people', 'people.id', 'person_names.person_id')
        .select('person_names.person_id as id')
        .distinct()
        .where('people.merged_into_person_id', 'is', null)
        .where('people.deleted_at', 'is', null)
        .where((eb) =>
          eb.or(nameTokens.map((t) => eb('person_names.normalized_name', 'like', `%${t}%`))),
        )
        .limit(MAX_PREFILTER)
        .execute()
    : [];

  const idsByYear =
    spYear != null
      ? await db
          .selectFrom('person_events')
          .innerJoin('people', 'people.id', 'person_events.person_id')
          .select('person_events.person_id as id')
          .distinct()
          .where('people.merged_into_person_id', 'is', null)
          .where('people.deleted_at', 'is', null)
          .where('person_events.event_type', '=', 'birth')
          .where('person_events.year_from', '>=', Math.floor(spYear) - 2)
          .where('person_events.year_to', '<=', Math.ceil(spYear) + 2)
          .limit(MAX_PREFILTER)
          .execute()
      : [];

  const personIds = [...new Set([...idsByName, ...idsByYear].map((r) => r.id))].slice(
    0,
    MAX_PREFILTER,
  );
  if (personIds.length === 0) return [];

  // Load the scoring fields for each candidate (preferred primary name + birth event).
  const rows = await db
    .selectFrom('people')
    .leftJoin('person_names as primary_name', (join) =>
      join
        .onRef('primary_name.person_id', '=', 'people.id')
        .on('primary_name.name_type', '=', 'primary')
        .on('primary_name.is_preferred', '=', true),
    )
    .leftJoin('person_names as birth_name', (join) =>
      join.onRef('birth_name.person_id', '=', 'people.id').on('birth_name.name_type', '=', 'birth'),
    )
    .leftJoin('person_names as nick_name', (join) =>
      join
        .onRef('nick_name.person_id', '=', 'people.id')
        .on('nick_name.name_type', '=', 'nickname'),
    )
    .leftJoin('person_events as birth_event', (join) =>
      join
        .onRef('birth_event.person_id', '=', 'people.id')
        .on('birth_event.event_type', '=', 'birth'),
    )
    .leftJoin('places', 'places.id', 'birth_event.place_id')
    .select([
      'people.id as person_id',
      'primary_name.normalized_name as normalized_name',
      sql<string>`concat_ws(' ', primary_name.first_name, primary_name.surname)`.as('label'),
      'birth_name.birth_surname as birth_surname',
      'nick_name.nickname as nickname',
      'birth_event.year_from as birth_year_from',
      'birth_event.year_to as birth_year_to',
      'places.normalized_name as birthplace',
    ])
    .where('people.id', 'in', personIds)
    .execute();

  return rows;
}

function toCandidateContext(row: CandidateRow): PersonMatchContext {
  return {
    normalizedName: row.normalized_name ?? '',
    birthSurname: row.birth_surname ? normalize(row.birth_surname) : null,
    nickname: row.nickname ? normalize(row.nickname) : null,
    birthYearFrom: row.birth_year_from,
    birthYearTo: row.birth_year_to,
    birthplaceNormalized: row.birthplace ?? null,
  };
}

/**
 * Scores candidates for a submitted person, upserts match_candidates (refreshing
 * score/reasons but preserving admin review state), and returns the ranked list.
 * Never writes matched_person_id or creates people — the admin always chooses.
 */
export async function findMatches(
  db: Db,
  submissionPersonId: string,
  actorId: string,
): Promise<FindMatchesResult> {
  const sub = await submissionContext(db, submissionPersonId);
  if (!sub) return { ok: false, kind: 'not_found' };

  const rows = await prefilterCandidates(db, sub.ctx);
  const scored = rows
    .map((row) => ({ row, result: score(sub.ctx, toCandidateContext(row)) }))
    .filter(({ result }) => result.score >= MIN_SCORE)
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, MAX_CANDIDATES);

  for (const { row, result } of scored) {
    await upsertMatchCandidate(db, {
      submission_person_id: submissionPersonId,
      canonical_person_id: row.person_id,
      score: result.score,
      reasons: result.reasons,
    });
  }

  await insertAuditEntry(db, {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'matching.run',
    entity_type: 'submission_person',
    entity_id: submissionPersonId,
    metadata: JSON.stringify({ candidates: scored.length }),
  });

  // Return the persisted candidates (carrying any prior review status).
  const persisted = await listMatchCandidates(db, submissionPersonId);
  const byPerson = new Map(scored.map(({ row, result }) => [row.person_id, { row, result }]));
  const candidates: RankedCandidate[] = persisted
    .filter((c) => byPerson.has(c.canonical_person_id))
    .map((c) => {
      const entry = byPerson.get(c.canonical_person_id)!;
      return {
        id: c.id,
        canonicalPersonId: c.canonical_person_id,
        score: c.score,
        reasons: (c.reasons as unknown as MatchReason[]) ?? entry.result.reasons,
        status: c.status,
        person: {
          id: c.canonical_person_id,
          label: entry.row.label ?? '',
          birthYear: entry.row.birth_year_from,
        },
      };
    });

  return { ok: true, candidates };
}
