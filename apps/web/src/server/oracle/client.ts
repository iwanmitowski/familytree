import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ActorRole } from '@familytree/shared';
import { serverEnv } from '../env';
import { signOracleRequest } from './sign';
import { normalizeErrorBody, OracleError } from './errors';

export interface Actor {
  id: string;
  role: ActorRole;
}

export interface OracleFetchOptions {
  method?: string;
  /** Serialized once; the body hash is computed over these exact bytes. */
  body?: unknown;
  actor: Actor;
  /** Required for mutating requests that need idempotency. */
  idempotencyKey?: string;
  /** Correlation id; generated when absent. Not part of the signature. */
  requestId?: string;
  timeoutMs?: number;
}

export interface OracleResponse<T> {
  data: T;
  status: number;
  requestId: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const RETRYABLE_GET_ATTEMPTS = 2;

function isIdempotentMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

/**
 * Signs and sends a request to the Oracle API (idea.md §4, §17). Serializes the
 * body once, computes X-Body-SHA256 over those bytes, sets all HMAC headers,
 * forwards a correlation id, times out, retries only idempotent GETs, and never
 * logs secrets or signatures. Non-2xx responses throw a normalized OracleError.
 */
export async function oracleFetch<T = unknown>(
  path: string,
  options: OracleFetchOptions,
): Promise<OracleResponse<T>> {
  const env = serverEnv();
  const method = (options.method ?? 'GET').toUpperCase();
  const requestId = options.requestId ?? randomUUID();
  const rawBody = options.body === undefined ? undefined : JSON.stringify(options.body);

  const url = new URL(path, env.ORACLE_API_BASE_URL);
  const pathWithQuery = url.pathname + url.search;

  const attempts = isIdempotentMethod(method) ? RETRYABLE_GET_ATTEMPTS : 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Each attempt re-signs: fresh nonce + timestamp (a reused nonce is rejected).
    const signed = signOracleRequest({
      secret: env.SERVICE_HMAC_SECRET,
      serviceId: env.SERVICE_ID,
      method,
      pathWithQuery,
      rawBody,
      actorId: options.actor.id,
      actorRole: options.actor.role,
      idempotencyKey: options.idempotencyKey,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          ...signed.headers,
          'Content-Type': 'application/json',
          'X-Request-Id': requestId,
        },
        body: rawBody,
        signal: controller.signal,
        cache: 'no-store',
      });

      const text = await res.text();
      let parsed: unknown = null;
      if (text) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          parsed = null;
        }
      }

      if (!res.ok) {
        throw normalizeErrorBody(res.status, parsed, res.headers.get('x-request-id') ?? requestId);
      }

      return { data: parsed as T, status: res.status, requestId };
    } catch (err) {
      // Domain errors (4xx) are final; only transport failures on GET retry.
      if (err instanceof OracleError) throw err;
      if (attempt === attempts - 1) break;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new OracleError(
    502,
    'upstream_unreachable',
    'The upstream service is unavailable',
    requestId,
  );
}
