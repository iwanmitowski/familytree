import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { insertAuditEntry } from '../audit/repo';
import {
  insertEvidence,
  insertSource,
  listEvidenceBySubject,
  type EvidenceRow,
  type SourceRow,
} from './repo';

type Db = Kysely<DB>;

export type SourceType =
  | 'questionnaire' | 'interview' | 'birth_certificate' | 'marriage_certificate'
  | 'death_certificate' | 'church_register' | 'family_document' | 'photograph'
  | 'grave_marker' | 'other';
export type SubjectType =
  | 'person' | 'person_name' | 'person_event' | 'parent_child_relationship' | 'family_union';
export type Stance = 'supports' | 'disputes';

const SUBJECT_TABLE: Record<SubjectType, keyof DB> = {
  person: 'people',
  person_name: 'person_names',
  person_event: 'person_events',
  parent_child_relationship: 'parent_child_relationships',
  family_union: 'family_unions',
};

export interface CreateSourceInput {
  sourceType: SourceType;
  title: string;
  description?: string | null;
  submissionId?: string | null;
}

export async function createSourceRecord(
  db: Db,
  input: CreateSourceInput,
  actorId: string,
): Promise<SourceRow> {
  const source = await insertSource(db, {
    source_type: input.sourceType,
    title: input.title,
    description: input.description ?? null,
    submission_id: input.submissionId ?? null,
  });
  await insertAuditEntry(db, {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'source.created',
    entity_type: 'source',
    entity_id: source.id,
  });
  return source;
}

export async function listSources(
  db: Db,
  opts: { type?: SourceType; q?: string; limit?: number } = {},
): Promise<SourceRow[]> {
  let query = db.selectFrom('sources').selectAll().orderBy('created_at', 'desc').limit(opts.limit ?? 50);
  if (opts.type) query = query.where('source_type', '=', opts.type);
  if (opts.q) query = query.where('title', 'ilike', `%${opts.q}%`);
  return query.execute();
}

export async function getSourceWithEvidence(
  db: Db,
  id: string,
): Promise<{ source: SourceRow; evidence: EvidenceRow[] } | undefined> {
  const source = await db.selectFrom('sources').selectAll().where('id', '=', id).executeTakeFirst();
  if (!source) return undefined;
  const evidence = await db.selectFrom('evidence').selectAll().where('source_id', '=', id).orderBy('created_at').execute();
  return { source, evidence };
}

export async function patchSourceRecord(
  db: Db,
  id: string,
  patch: { title?: string; description?: string | null },
  actorId: string,
): Promise<SourceRow | undefined> {
  const updated = await db
    .updateTable('sources')
    .set({ title: patch.title, description: patch.description })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
  if (!updated) return undefined;
  await insertAuditEntry(db, {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'source.updated',
    entity_type: 'source',
    entity_id: id,
  });
  return updated;
}

export type DeleteSourceResult = { ok: true } | { ok: false; kind: 'not_found' | 'in_use' };

/** Deleting a source that still has evidence is refused (ON DELETE RESTRICT). */
export async function deleteSourceRecord(
  db: Db,
  id: string,
  actorId: string,
): Promise<DeleteSourceResult> {
  const source = await db.selectFrom('sources').select('id').where('id', '=', id).executeTakeFirst();
  if (!source) return { ok: false, kind: 'not_found' };
  const evidence = await db.selectFrom('evidence').select('id').where('source_id', '=', id).limit(1).executeTakeFirst();
  if (evidence) return { ok: false, kind: 'in_use' };
  await db.deleteFrom('sources').where('id', '=', id).execute();
  await insertAuditEntry(db, {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'source.deleted',
    entity_type: 'source',
    entity_id: id,
  });
  return { ok: true };
}

export interface CreateEvidenceInput {
  sourceId: string;
  subjectType: SubjectType;
  subjectId: string;
  assertion: string;
  stance: Stance;
  confidence?: number | null;
  notes?: string | null;
}

export type CreateEvidenceResult =
  | { ok: true; evidence: EvidenceRow }
  | { ok: false; kind: 'source_not_found' | 'subject_not_found' };

/**
 * Records evidence linking a source to an assertion about a subject row. It
 * NEVER mutates the subject — a `disputes` stance changes nothing on the
 * person/event/relationship (idea.md §8).
 */
export async function createEvidenceRecord(
  db: Db,
  input: CreateEvidenceInput,
  actorId: string,
): Promise<CreateEvidenceResult> {
  const source = await db.selectFrom('sources').select('id').where('id', '=', input.sourceId).executeTakeFirst();
  if (!source) return { ok: false, kind: 'source_not_found' };

  const table = SUBJECT_TABLE[input.subjectType];
  const subject = await db
    .selectFrom(table)
    .select('id')
    .where('id', '=', input.subjectId)
    .executeTakeFirst();
  if (!subject) return { ok: false, kind: 'subject_not_found' };

  const evidence = await insertEvidence(db, {
    source_id: input.sourceId,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    assertion: input.assertion,
    stance: input.stance,
    confidence: input.confidence ?? null,
    notes: input.notes ?? null,
  });
  await insertAuditEntry(db, {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'evidence.created',
    entity_type: 'evidence',
    entity_id: evidence.id,
    metadata: JSON.stringify({ subjectType: input.subjectType, stance: input.stance }),
  });
  return { ok: true, evidence };
}

export function listEvidence(
  db: Db,
  subjectType: SubjectType,
  subjectId: string,
): Promise<EvidenceRow[]> {
  return listEvidenceBySubject(db, subjectType, subjectId);
}

export async function deleteEvidenceRecord(db: Db, id: string, actorId: string): Promise<boolean> {
  const deleted = await db.deleteFrom('evidence').where('id', '=', id).returningAll().executeTakeFirst();
  if (!deleted) return false;
  await insertAuditEntry(db, {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'evidence.deleted',
    entity_type: 'evidence',
    entity_id: id,
  });
  return true;
}
