import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv, RouteDeps } from '../transport/app';
import { writeError } from '../transport/http';
import { parseJson } from '../transport/validate';
import { requireRole } from '../auth/hmac';
import { createSubmission } from './service';
import { getSubmissionDetail, listSubmissionsForAdmin } from './read';
import { markSpam, rejectSubmission, startReview, type TransitionResult } from './workflow';
import { contactLeads } from './contact-leads';
import type { SubmissionRow } from './repo';

const payloadSchema = z.object({}).passthrough();

const createSchema = z.object({
  payload: payloadSchema,
  clientFingerprint: z.string().max(200).optional(),
  inviteToken: z.string().max(400).optional(),
  spamSignal: z.enum(['honeypot', 'too_fast']).optional(),
});

const STATUSES = ['draft', 'pending', 'in_review', 'processed', 'rejected', 'spam'] as const;

export function registerSubmissionRoutes(app: Hono<AppEnv>, deps: RouteDeps): void {
  const { db } = deps;

  // Public submission (actor role "public"): stores an immutable submission.
  app.post('/v1/internal/submissions', async (c) => {
    const parsed = await parseJson(c, createSchema);
    if ('response' in parsed) return parsed.response;

    const result = await createSubmission(
      db,
      {
        payload: parsed.data.payload as never,
        clientFingerprint: parsed.data.clientFingerprint,
        inviteToken: parsed.data.inviteToken,
        spamSignal: parsed.data.spamSignal,
      },
      c.get('requestId'),
    );

    if (!result.ok) {
      if (result.kind === 'rate_limited') {
        c.header('Retry-After', '86400');
        return writeError(c, 429, 'rate_limited', 'Твърде много заявки. Опитайте по-късно.');
      }
      return writeError(c, 429, 'invite_invalid', `Поканата не е валидна: ${result.reason}`);
    }
    return c.json({ submissionId: result.submissionId }, 201);
  });

  // Admin: list submissions.
  app.get('/v1/internal/submissions', requireRole('admin'), async (c) => {
    const statusParam = c.req.query('status') ?? '';
    const status = (STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as SubmissionRow['status'])
      : undefined;
    const limit = clampInt(c.req.query('limit'), 25, 1, 100);
    const offset = clampInt(c.req.query('offset'), 0, 0, 1_000_000);
    return c.json(await listSubmissionsForAdmin(db, { status, limit, offset }));
  });

  // Admin: full submission detail.
  app.get('/v1/internal/submissions/:id', requireRole('admin'), async (c) => {
    const detail = await getSubmissionDetail(db, c.req.param('id'));
    if (!detail) return writeError(c, 404, 'not_found', 'Submission not found');
    return c.json(detail);
  });

  // Admin: status transitions.
  app.post('/v1/internal/submissions/:id/start-review', requireRole('admin'), async (c) =>
    transitionResponse(c, await startReview(db, c.req.param('id'), c.get('actorId') ?? 'admin')),
  );

  const reasonSchema = z.object({ reason: z.string().min(1).max(2000) });

  app.post('/v1/internal/submissions/:id/reject', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, reasonSchema);
    if ('response' in parsed) return parsed.response;
    return transitionResponse(
      c,
      await rejectSubmission(db, c.req.param('id'), parsed.data.reason, c.get('actorId') ?? 'admin'),
    );
  });

  app.post('/v1/internal/submissions/:id/mark-spam', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, reasonSchema);
    if ('response' in parsed) return parsed.response;
    return transitionResponse(
      c,
      await markSpam(db, c.req.param('id'), parsed.data.reason, c.get('actorId') ?? 'admin'),
    );
  });

  // Admin: snowball contact leads.
  app.get('/v1/internal/contact-leads', requireRole('admin'), async (c) => {
    return c.json(await contactLeads(db));
  });
}

function transitionResponse(c: Context<AppEnv>, result: TransitionResult) {
  if (result.ok) return c.json({ id: c.req.param('id'), status: result.status });
  if (result.kind === 'not_found') return writeError(c, 404, 'not_found', 'Submission not found');
  return writeError(
    c,
    409,
    'invalid_transition',
    `Неразрешен преход от статус „${result.from}“`,
  );
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = value ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(Math.trunc(n), max));
}
