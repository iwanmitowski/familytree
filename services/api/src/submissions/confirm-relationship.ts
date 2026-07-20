import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { getSourceBySubmission, insertEvidence, insertSource } from '../sources/repo';
import { getSubmission } from './repo';
import { createParentChildEdge } from '../genealogy/relationships-service';
import { createUnion } from '../genealogy/unions-service';

type Db = Kysely<DB>;

export type ConfirmInput =
  | { kind: 'parent_child'; parentPersonId: string; childPersonId: string; relationshipType?: string }
  | { kind: 'union'; partnerPersonIds: string[]; unionType?: 'marriage' | 'partnership' | 'unknown' };

export type ConfirmResult =
  | { ok: true; kind: 'parent_child' | 'union' }
  | { ok: false; kind: 'not_found' | 'invalid' | 'conflict' | 'cycle'; message: string };

const REL_TYPES = ['biological', 'adoptive', 'step', 'foster', 'guardian', 'unknown'] as const;

/** Find-or-create the submission's questionnaire source. */
async function questionnaireSource(db: Db, submissionId: string): Promise<string> {
  const existing = await getSourceBySubmission(db, submissionId);
  if (existing) return existing.id;
  const source = await insertSource(db, {
    source_type: 'questionnaire',
    title: 'Въпросник',
    submission_id: submissionId,
  });
  return source.id;
}

/**
 * Confirms a suggested relationship from a submission (idea.md §7): creates the
 * canonical parent-child edge (as `confirmed`) or family union via the existing
 * services, then attaches supporting questionnaire evidence to the new row.
 */
export async function confirmSuggestedRelationship(
  db: Db,
  submissionId: string,
  input: ConfirmInput,
  actorId: string,
): Promise<ConfirmResult> {
  const submission = await getSubmission(db, submissionId);
  if (!submission) return { ok: false, kind: 'not_found', message: 'Заявката не е намерена' };

  if (input.kind === 'parent_child') {
    const relationshipType = (REL_TYPES as readonly string[]).includes(input.relationshipType ?? '')
      ? (input.relationshipType as (typeof REL_TYPES)[number])
      : 'biological';
    const edge = await createParentChildEdge(
      db,
      { parentId: input.parentPersonId, childId: input.childPersonId, relationshipType, verificationStatus: 'confirmed' },
      actorId,
    );
    if (!edge.ok) {
      const message = 'message' in edge ? edge.message : 'Връзката би създала цикъл в родословието';
      return { ok: false, kind: edge.kind, message };
    }

    const source = await questionnaireSource(db, submissionId);
    await insertEvidence(db, {
      source_id: source,
      subject_type: 'parent_child_relationship',
      subject_id: edge.edge.id,
      assertion: 'relationship',
      stance: 'supports',
    });
    return { ok: true, kind: 'parent_child' };
  }

  const union = await createUnion(db, input.unionType ?? 'marriage', input.partnerPersonIds, actorId);
  if (!union.ok) {
    const message = 'message' in union ? union.message : 'Съюзът не е намерен';
    return { ok: false, kind: union.kind, message };
  }

  const source = await questionnaireSource(db, submissionId);
  await insertEvidence(db, {
    source_id: source,
    subject_type: 'family_union',
    subject_id: union.union.id,
    assertion: 'union',
    stance: 'supports',
  });
  return { ok: true, kind: 'union' };
}
