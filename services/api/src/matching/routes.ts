import { Hono } from 'hono';
import type { AppEnv, RouteDeps } from '../transport/app';
import { writeError } from '../transport/http';
import { requireRole } from '../auth/hmac';
import { findMatches } from './service';

export function registerMatchingRoutes(app: Hono<AppEnv>, deps: RouteDeps): void {
  const { db } = deps;

  app.post(
    '/v1/internal/submission-people/:id/find-matches',
    requireRole('admin'),
    async (c) => {
      const result = await findMatches(db, c.req.param('id'), c.get('actorId') ?? 'admin');
      if (!result.ok) return writeError(c, 404, 'not_found', 'Submission person not found');
      return c.json({ candidates: result.candidates });
    },
  );
}
