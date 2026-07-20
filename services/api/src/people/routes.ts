import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv, RouteDeps } from '../transport/app';
import { writeError } from '../transport/http';
import { parseJson } from '../transport/validate';
import { requireRole } from '../auth/hmac';
import { getPersonAggregate, type PersonAggregateResult } from './aggregate';
import {
  createPersonFromSubmission,
  createPersonManual,
  linkPersonFromSubmission,
  patchPersonById,
  searchPeople,
  type PromotionResult,
} from './service';

const createSchema = z.object({
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).nullish(),
  surname: z.string().max(100).nullish(),
  birthSurname: z.string().max(100).nullish(),
  nickname: z.string().max(100).nullish(),
  livingStatus: z.enum(['living', 'deceased', 'unknown']).optional(),
  privacyLevel: z.enum(['private', 'family', 'public']).optional(),
});

const patchSchema = z.object({
  privacyLevel: z.enum(['private', 'family', 'public']).optional(),
  livingStatus: z.enum(['living', 'deceased', 'unknown']).optional(),
  notes: z.string().max(4000).nullish(),
});

const linkSchema = z.object({ personId: z.string().uuid() });

function aggregateResponse(c: Context<AppEnv>, result: PromotionResult, okStatus = 200) {
  if (result.ok) return c.json(result.person, okStatus as 200 | 201);
  if (result.kind === 'not_found') return writeError(c, 404, 'not_found', 'Човекът не е намерен');
  if (result.kind === 'merged') {
    return c.json({ mergedIntoPersonId: result.mergedIntoPersonId }, 409);
  }
  return writeError(c, 422, 'guard_failed', result.message);
}

export function registerPeopleRoutes(app: Hono<AppEnv>, deps: RouteDeps): void {
  const { db } = deps;
  const actor = (c: Context<AppEnv>) => c.get('actorId') ?? 'admin';

  app.post('/v1/internal/people', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, createSchema);
    if ('response' in parsed) return parsed.response;
    return aggregateResponse(c, await createPersonManual(db, parsed.data, actor(c)), 201);
  });

  app.get('/v1/internal/people', requireRole('admin'), async (c) => {
    const q = c.req.query('q') ?? '';
    const includeMerged = c.req.query('includeMerged') === 'true';
    const limit = clampInt(c.req.query('limit'), 25, 1, 100);
    const offset = clampInt(c.req.query('offset'), 0, 0, 1_000_000);
    return c.json(await searchPeople(db, q, { limit, offset, includeMerged }));
  });

  app.get('/v1/internal/people/:id', requireRole('admin'), async (c) =>
    aggregateResponse(c, await getPersonAggregate(db, c.req.param('id'))),
  );

  app.patch('/v1/internal/people/:id', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, patchSchema);
    if ('response' in parsed) return parsed.response;
    return aggregateResponse(c, await patchPersonById(db, c.req.param('id'), parsed.data, actor(c)));
  });

  app.post('/v1/internal/submission-people/:id/create-person', requireRole('admin'), async (c) =>
    aggregateResponse(c, await createPersonFromSubmission(db, c.req.param('id'), actor(c)), 201),
  );

  app.post('/v1/internal/submission-people/:id/link-person', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, linkSchema);
    if ('response' in parsed) return parsed.response;
    return aggregateResponse(
      c,
      await linkPersonFromSubmission(db, c.req.param('id'), parsed.data.personId, actor(c)),
    );
  });
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = value ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(Math.trunc(n), max));
}

// PersonAggregateResult is a subset of PromotionResult — reuse the same handler.
export type { PersonAggregateResult };
