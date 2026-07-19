import type { Context } from 'hono';
import type { ZodType } from 'zod';
import { writeError, type AppEnv } from './http';

/**
 * Parses and validates a JSON body against a Zod schema. Returns the typed
 * value, or a Response (uniform 400) the handler should return directly.
 */
export async function parseJson<T>(
  c: Context<AppEnv>,
  schema: ZodType<T>,
): Promise<{ data: T } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { response: await writeError(c, 400, 'invalid_json', 'Request body is not valid JSON') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`)
      .join('; ');
    return { response: await writeError(c, 400, 'validation_error', message) };
  }
  return { data: parsed.data };
}
