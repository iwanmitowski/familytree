import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Hono context variables shared across the app and middleware. */
export type AppEnv = {
  Variables: {
    requestId: string;
    /** Set by the HMAC middleware from the SIGNED actor headers. */
    actorId?: string;
    actorRole?: string;
  };
};

/** Uniform error shape (conventions §5). */
export function writeError(
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
) {
  return c.json({ error: { code, message, requestId: c.get('requestId') } }, status);
}
