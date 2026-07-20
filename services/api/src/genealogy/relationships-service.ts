import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { insertAuditEntry } from '../audit/repo';
import { getPerson } from '../people/repo';
import {
  deleteParentChild,
  getParentChild,
  insertParentChild,
  listParentChildByPerson,
  patchParentChild,
  type ParentChildRow,
} from './repo';
import { lockPersonPair, wouldCreateCycle } from './cycle';

type Db = Kysely<DB>;

export type RelType = 'biological' | 'adoptive' | 'step' | 'foster' | 'guardian' | 'unknown';
export type VerStatus = 'proposed' | 'confirmed' | 'disputed' | 'rejected';

export interface CreateEdgeInput {
  parentId: string;
  childId: string;
  relationshipType?: RelType;
  familyUnionId?: string | null;
  verificationStatus?: VerStatus;
  confidence?: number | null;
}

export type EdgeResult =
  | { ok: true; edge: ParentChildRow }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'invalid'; message: string }
  | { ok: false; kind: 'conflict'; message: string }
  | { ok: false; kind: 'cycle' };

async function activePerson(db: Db, id: string): Promise<boolean> {
  const p = await getPerson(db, id);
  return !!p && !p.deleted_at && !p.merged_into_person_id;
}

/**
 * Creates a parent-child edge in one transaction with ancestry-cycle prevention
 * (idea.md §12). An advisory lock on the person pair serializes competing
 * inserts so A→B and B→A cannot both slip through.
 */
export async function createParentChildEdge(
  db: Db,
  input: CreateEdgeInput,
  actorId: string,
): Promise<EdgeResult> {
  const { parentId, childId } = input;
  if (parentId === childId) return { ok: false, kind: 'invalid', message: 'Човек не може да е свой родител' };

  return db.transaction().execute(async (trx): Promise<EdgeResult> => {
    await lockPersonPair(trx, parentId, childId);

    if (!(await activePerson(trx, parentId)) || !(await activePerson(trx, childId))) {
      return { ok: false, kind: 'not_found' };
    }

    const relationshipType = input.relationshipType ?? 'biological';
    const duplicate = await trx
      .selectFrom('parent_child_relationships')
      .select('id')
      .where('parent_id', '=', parentId)
      .where('child_id', '=', childId)
      .where('relationship_type', '=', relationshipType)
      .executeTakeFirst();
    if (duplicate) return { ok: false, kind: 'conflict', message: 'Такава връзка вече съществува' };

    const status = input.verificationStatus ?? 'proposed';
    if (status === 'proposed' || status === 'confirmed') {
      if (await wouldCreateCycle(trx, parentId, childId)) return { ok: false, kind: 'cycle' };
    }

    const edge = await insertParentChild(trx, {
      parent_id: parentId,
      child_id: childId,
      relationship_type: relationshipType,
      family_union_id: input.familyUnionId ?? null,
      verification_status: status,
      confidence: input.confidence ?? null,
    });
    await insertAuditEntry(trx, {
      actor_type: 'admin',
      actor_id: actorId,
      action: 'relationship.created',
      entity_type: 'parent_child_relationship',
      entity_id: edge.id,
      metadata: JSON.stringify({ parentId, childId, relationshipType, status }),
    });
    return { ok: true, edge };
  });
}

const ALLOWED_TRANSITIONS: Record<VerStatus, VerStatus[]> = {
  proposed: ['confirmed', 'disputed', 'rejected'],
  confirmed: ['disputed'],
  disputed: ['confirmed', 'rejected'],
  rejected: [],
};

export interface PatchEdgeInput {
  verificationStatus?: VerStatus;
  relationshipType?: RelType;
  confidence?: number | null;
  familyUnionId?: string | null;
}

export async function patchParentChildEdge(
  db: Db,
  id: string,
  input: PatchEdgeInput,
  actorId: string,
): Promise<EdgeResult> {
  return db.transaction().execute(async (trx): Promise<EdgeResult> => {
    const edge = await getParentChild(trx, id);
    if (!edge) return { ok: false, kind: 'not_found' };

    if (input.verificationStatus && input.verificationStatus !== edge.verification_status) {
      if (!ALLOWED_TRANSITIONS[edge.verification_status as VerStatus].includes(input.verificationStatus)) {
        return { ok: false, kind: 'conflict', message: 'Непозволена промяна на статуса' };
      }
      // Confirming re-runs the cycle check inside the transaction.
      if (input.verificationStatus === 'confirmed') {
        await lockPersonPair(trx, edge.parent_id, edge.child_id);
        if (await wouldCreateCycle(trx, edge.parent_id, edge.child_id)) {
          return { ok: false, kind: 'cycle' };
        }
      }
    }

    const updated = await patchParentChild(trx, id, {
      verification_status: input.verificationStatus,
      relationship_type: input.relationshipType,
      confidence: input.confidence,
      family_union_id: input.familyUnionId,
    });
    await insertAuditEntry(trx, {
      actor_type: 'admin',
      actor_id: actorId,
      action: 'relationship.updated',
      entity_type: 'parent_child_relationship',
      entity_id: id,
      metadata: JSON.stringify(input),
    });
    return { ok: true, edge: updated! };
  });
}

export async function deleteParentChildEdge(
  db: Db,
  id: string,
  actorId: string,
): Promise<{ ok: boolean }> {
  const deleted = await deleteParentChild(db, id);
  if (!deleted) return { ok: false };
  await insertAuditEntry(db, {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'relationship.deleted',
    entity_type: 'parent_child_relationship',
    entity_id: id,
    metadata: JSON.stringify({ snapshot: deleted }),
  });
  return { ok: true };
}

/** Direct edges between two people, in both directions. */
export function edgesBetween(db: Db, a: string, b: string): Promise<ParentChildRow[]> {
  return listParentChildByPerson(db, a).then((edges) =>
    edges.filter((e) => e.parent_id === b || e.child_id === b),
  );
}
