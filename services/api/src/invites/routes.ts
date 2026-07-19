import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, RouteDeps } from '../transport/app';
import { writeError } from '../transport/http';
import { parseJson } from '../transport/validate';
import { requireRole } from '../auth/hmac';
import {
  createInvite,
  listPublicInvites,
  revokeInviteById,
  validateToken,
} from './service';

const createInviteSchema = z.object({
  recipientLabel: z.string().min(1).max(200),
  campaign: z.string().max(200).nullish(),
  expiresAt: z.string().datetime().nullish(),
  maxSubmissions: z.number().int().min(1).max(1000).optional(),
});

export function registerInviteRoutes(app: Hono<AppEnv>, deps: RouteDeps): void {
  const { db } = deps;

  // Service-level validation (no admin role) — the BFF checks a token before
  // rendering the questionnaire.
  app.get('/v1/internal/invites/validate', async (c) => {
    const token = c.req.query('token') ?? '';
    return c.json(await validateToken(db, token));
  });

  app.post('/v1/internal/invites', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, createInviteSchema);
    if ('response' in parsed) return parsed.response;
    const invite = await createInvite(db, parsed.data, c.get('actorId') ?? 'unknown');
    return c.json(invite, 201);
  });

  app.get('/v1/internal/invites', requireRole('admin'), async (c) => {
    return c.json({ items: await listPublicInvites(db) });
  });

  app.post('/v1/internal/invites/:id/revoke', requireRole('admin'), async (c) => {
    const invite = await revokeInviteById(db, c.req.param('id'), c.get('actorId') ?? 'unknown');
    if (!invite) return writeError(c, 404, 'not_found', 'Invite not found');
    return c.json(invite);
  });
}
