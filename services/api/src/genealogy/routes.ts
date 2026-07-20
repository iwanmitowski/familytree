import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv, RouteDeps } from '../transport/app';
import { writeError } from '../transport/http';
import { parseJson } from '../transport/validate';
import { requireRole } from '../auth/hmac';
import {
  createParentChildEdge,
  deleteParentChildEdge,
  edgesBetween,
  patchParentChildEdge,
  type EdgeResult,
} from './relationships-service';
import {
  addPartner,
  createUnion,
  deleteUnion,
  getUnionView,
  patchUnion,
  removePartner,
  type UnionResult,
} from './unions-service';
import { resolveRelationship } from './resolver';
import { buildTreeProjection, type ProjectionOptions } from './projection';

const REL_TYPES = ['biological', 'adoptive', 'step', 'foster', 'guardian', 'unknown'] as const;
const VER_STATUS = ['proposed', 'confirmed', 'disputed', 'rejected'] as const;

const createSchema = z.object({
  parentId: z.string().uuid(),
  childId: z.string().uuid(),
  relationshipType: z.enum(REL_TYPES).optional(),
  familyUnionId: z.string().uuid().nullish(),
  verificationStatus: z.enum(VER_STATUS).optional(),
  confidence: z.number().int().min(0).max(100).nullish(),
});

const patchSchema = z.object({
  verificationStatus: z.enum(VER_STATUS).optional(),
  relationshipType: z.enum(REL_TYPES).optional(),
  confidence: z.number().int().min(0).max(100).nullish(),
  familyUnionId: z.string().uuid().nullish(),
});

function edgeResponse(c: Context<AppEnv>, result: EdgeResult, okStatus = 200) {
  if (result.ok) return c.json(result.edge, okStatus as 200 | 201);
  switch (result.kind) {
    case 'not_found':
      return writeError(c, 404, 'not_found', 'Връзката или човекът не е намерен');
    case 'invalid':
      return writeError(c, 422, 'invalid_relationship', result.message);
    case 'conflict':
      return writeError(c, 409, 'conflict', result.message);
    case 'cycle':
      return writeError(c, 422, 'cycle_detected', 'Връзката би създала цикъл в родословието');
  }
}

export function registerRelationshipRoutes(app: Hono<AppEnv>, deps: RouteDeps): void {
  const { db } = deps;
  const actor = (c: Context<AppEnv>) => c.get('actorId') ?? 'admin';

  app.post('/v1/internal/relationships/parent-child', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, createSchema);
    if ('response' in parsed) return parsed.response;
    return edgeResponse(c, await createParentChildEdge(db, parsed.data, actor(c)), 201);
  });

  app.patch('/v1/internal/relationships/:id', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, patchSchema);
    if ('response' in parsed) return parsed.response;
    return edgeResponse(c, await patchParentChildEdge(db, c.req.param('id'), parsed.data, actor(c)));
  });

  app.delete('/v1/internal/relationships/:id', requireRole('admin'), async (c) => {
    const result = await deleteParentChildEdge(db, c.req.param('id'), actor(c));
    if (!result.ok) return writeError(c, 404, 'not_found', 'Връзката не е намерена');
    return c.body(null, 204);
  });

  app.get('/v1/internal/relationships/between', requireRole('admin'), async (c) => {
    const a = c.req.query('personA');
    const b = c.req.query('personB');
    if (!a || !b) return writeError(c, 422, 'missing_params', 'Необходими са personA и personB');
    return c.json({ edges: await edgesBetween(db, a, b) });
  });

  // --- Family unions ---
  const unionSchema = z.object({
    unionType: z.enum(['marriage', 'partnership', 'unknown']),
    partnerIds: z.array(z.string().uuid()).min(1).max(2),
  });
  const partnerSchema = z.object({ personId: z.string().uuid() });

  app.post('/v1/internal/unions', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, unionSchema);
    if ('response' in parsed) return parsed.response;
    return unionResponse(c, await createUnion(db, parsed.data.unionType, parsed.data.partnerIds, actor(c)), 201);
  });

  app.get('/v1/internal/unions/:id', requireRole('admin'), async (c) => {
    const view = await getUnionView(db, c.req.param('id'));
    if (!view) return writeError(c, 404, 'not_found', 'Съюзът не е намерен');
    return c.json(view);
  });

  app.patch('/v1/internal/unions/:id', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, z.object({ unionType: z.enum(['marriage', 'partnership', 'unknown']) }));
    if ('response' in parsed) return parsed.response;
    return unionResponse(c, await patchUnion(db, c.req.param('id'), parsed.data.unionType, actor(c)));
  });

  app.post('/v1/internal/unions/:id/partners', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, partnerSchema);
    if ('response' in parsed) return parsed.response;
    return unionResponse(c, await addPartner(db, c.req.param('id'), parsed.data.personId, actor(c)));
  });

  app.delete('/v1/internal/unions/:id/partners/:personId', requireRole('admin'), async (c) =>
    unionResponse(c, await removePartner(db, c.req.param('id'), c.req.param('personId'), actor(c))),
  );

  app.delete('/v1/internal/unions/:id', requireRole('admin'), async (c) => {
    const result = await deleteUnion(db, c.req.param('id'), actor(c));
    if (result.ok) return c.body(null, 204);
    if (result.kind === 'in_use') return writeError(c, 409, 'union_in_use', 'Съюзът се използва от връзка дете-родител');
    return writeError(c, 404, 'not_found', 'Съюзът не е намерен');
  });

  // --- Tree projection (idea.md §13) ---
  const boolParam = (v: string | undefined, dflt: boolean) => (v === undefined ? dflt : v === 'true');
  const intParam = (v: string | undefined, dflt: number) => {
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.max(0, Math.min(Math.trunc(n), 6)) : dflt;
  };

  // view=admin requires the admin role; everyone else is forced to public.
  const resolveView = (c: Context<AppEnv>): 'admin' | 'public' =>
    c.get('actorRole') === 'admin' && c.req.query('view') !== 'public' ? 'admin' : 'public';

  async function tree(c: Context<AppEnv>, overrides: ProjectionOptions) {
    const projection = await buildTreeProjection(db, c.req.param('personId') ?? '', {
      ancestors: intParam(c.req.query('ancestors'), overrides.ancestors ?? 4),
      descendants: intParam(c.req.query('descendants'), overrides.descendants ?? 2),
      includePartners: boolParam(c.req.query('includePartners'), overrides.includePartners ?? true),
      includeSiblings: boolParam(c.req.query('includeSiblings'), overrides.includeSiblings ?? false),
      view: resolveView(c),
    });
    if (!projection) return writeError(c, 404, 'not_found', 'Човекът не е намерен');
    return c.json(projection);
  }

  // No requireRole — public actors get the redacted (public) view.
  app.get('/v1/internal/tree/:personId', (c) => tree(c, {}));
  app.get('/v1/internal/tree/:personId/ancestors', (c) => tree(c, { descendants: 0 }));
  app.get('/v1/internal/tree/:personId/descendants', (c) => tree(c, { ancestors: 0 }));

  // Relationship path (public gets a redacted result — only the label + confidence).
  app.get('/v1/internal/relationship-path', async (c) => {
    const a = c.req.query('personA');
    const b = c.req.query('personB');
    if (!a || !b) return writeError(c, 422, 'missing_params', 'Необходими са personA и personB');
    const maxDepth = Math.max(1, Math.min(10, Number(c.req.query('maxDepth')) || 6));
    const result = await resolveRelationship(db, a, b, maxDepth);
    if (!result.ok) return writeError(c, 422, 'unknown_person', 'Непознат човек');
    if (resolveView(c) === 'public') {
      // Never expose ids of people or common ancestors publicly.
      return c.json({
        connected: result.result.connected,
        relationshipLabelBg: result.result.relationshipLabelBg,
        confidence: result.result.confidence,
      });
    }
    return c.json(result.result);
  });
}

function unionResponse(c: Context<AppEnv>, result: UnionResult, okStatus = 200) {
  if (result.ok) return c.json(result.union, okStatus as 200 | 201);
  switch (result.kind) {
    case 'not_found':
      return writeError(c, 404, 'not_found', 'Съюзът или човекът не е намерен');
    case 'invalid':
      return writeError(c, 422, 'invalid_union', result.message);
    case 'conflict':
      return writeError(c, 409, 'conflict', result.message);
  }
}
