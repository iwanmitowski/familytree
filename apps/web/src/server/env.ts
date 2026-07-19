import 'server-only';
import { z } from 'zod';

/**
 * Server-only environment. The `server-only` import makes any client-component
 * import a build error, so these secrets can never reach the browser bundle
 * (idea.md §17). No variable here is NEXT_PUBLIC_.
 */
const serverEnvSchema = z.object({
  ORACLE_API_BASE_URL: z.string().url(),
  SERVICE_ID: z.string().min(1),
  SERVICE_HMAC_SECRET: z.string().min(16),
  IP_HASH_SECRET: z.string().min(16),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1).optional(),
  ADMIN_EMAIL_ALLOWLIST: z.string().optional(),
  OAUTH_CLIENT_ID: z.string().optional(),
  OAUTH_CLIENT_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parses and caches the server environment; fails fast naming missing vars. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid server environment — ${details}`);
  }
  cached = parsed.data;
  return cached;
}
