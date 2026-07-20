import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv, RouteDeps } from '../transport/app';
import { writeError } from '../transport/http';
import { parseJson } from '../transport/validate';
import { requireRole } from '../auth/hmac';
import {
  createEvidenceRecord,
  createSourceRecord,
  deleteEvidenceRecord,
  deleteSourceRecord,
  getSourceWithEvidence,
  listEvidence,
  listSources,
  patchSourceRecord,
} from './service';

const SOURCE_TYPES = [
  'questionnaire', 'interview', 'birth_certificate', 'marriage_certificate',
  'death_certificate', 'church_register', 'family_document', 'photograph',
  'grave_marker', 'other',
] as const;
const SUBJECT_TYPES = [
  'person', 'person_name', 'person_event', 'parent_child_relationship', 'family_union',
] as const;

export function registerSourceRoutes(app: Hono<AppEnv>, deps: RouteDeps): void {
  const { db } = deps;
  const actor = (c: Context<AppEnv>) => c.get('actorId') ?? 'admin';

  const createSourceSchema = z.object({
    sourceType: z.enum(SOURCE_TYPES),
    title: z.string().min(1).max(500),
    description: z.string().max(4000).nullish(),
    submissionId: z.string().uuid().nullish(),
  });

  app.post('/v1/internal/sources', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, createSourceSchema);
    if ('response' in parsed) return parsed.response;
    return c.json(await createSourceRecord(db, parsed.data, actor(c)), 201);
  });

  app.get('/v1/internal/sources', requireRole('admin'), async (c) => {
    const type = c.req.query('type');
    return c.json({
      items: await listSources(db, {
        type: (SOURCE_TYPES as readonly string[]).includes(type ?? '')
          ? (type as (typeof SOURCE_TYPES)[number])
          : undefined,
        q: c.req.query('q') ?? undefined,
      }),
    });
  });

  app.get('/v1/internal/sources/:id', requireRole('admin'), async (c) => {
    const result = await getSourceWithEvidence(db, c.req.param('id'));
    if (!result) return writeError(c, 404, 'not_found', 'Източникът не е намерен');
    return c.json(result);
  });

  app.patch('/v1/internal/sources/:id', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, z.object({ title: z.string().min(1).max(500).optional(), description: z.string().max(4000).nullish() }));
    if ('response' in parsed) return parsed.response;
    const updated = await patchSourceRecord(db, c.req.param('id'), parsed.data, actor(c));
    if (!updated) return writeError(c, 404, 'not_found', 'Източникът не е намерен');
    return c.json(updated);
  });

  app.delete('/v1/internal/sources/:id', requireRole('admin'), async (c) => {
    const result = await deleteSourceRecord(db, c.req.param('id'), actor(c));
    if (result.ok) return c.body(null, 204);
    if (result.kind === 'in_use') return writeError(c, 409, 'source_in_use', 'Източникът има доказателства');
    return writeError(c, 404, 'not_found', 'Източникът не е намерен');
  });

  const createEvidenceSchema = z.object({
    sourceId: z.string().uuid(),
    subjectType: z.enum(SUBJECT_TYPES),
    subjectId: z.string().uuid(),
    assertion: z.string().min(1).max(500),
    stance: z.enum(['supports', 'disputes']),
    confidence: z.number().int().min(0).max(100).nullish(),
    notes: z.string().max(4000).nullish(),
  });

  app.post('/v1/internal/evidence', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, createEvidenceSchema);
    if ('response' in parsed) return parsed.response;
    const result = await createEvidenceRecord(db, parsed.data, actor(c));
    if (result.ok) return c.json(result.evidence, 201);
    if (result.kind === 'source_not_found') return writeError(c, 404, 'not_found', 'Източникът не е намерен');
    return writeError(c, 422, 'subject_not_found', 'Субектът на доказателството не съществува');
  });

  app.get('/v1/internal/evidence', requireRole('admin'), async (c) => {
    const subjectType = c.req.query('subjectType');
    const subjectId = c.req.query('subjectId');
    if (!subjectType || !subjectId || !(SUBJECT_TYPES as readonly string[]).includes(subjectType)) {
      return writeError(c, 422, 'missing_params', 'Необходими са subjectType и subjectId');
    }
    return c.json({ items: await listEvidence(db, subjectType as (typeof SUBJECT_TYPES)[number], subjectId) });
  });

  app.delete('/v1/internal/evidence/:id', requireRole('admin'), async (c) => {
    const ok = await deleteEvidenceRecord(db, c.req.param('id'), actor(c));
    if (!ok) return writeError(c, 404, 'not_found', 'Доказателството не е намерено');
    return c.body(null, 204);
  });
}
