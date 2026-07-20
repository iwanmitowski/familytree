import type { MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Kysely } from 'kysely';
import { requestHash, verifyRequest } from '@familytree/shared';
import type { Logger } from '../logger';
import { hmacFailures } from '../metrics/registry';
import { writeError, type AppEnv } from '../transport/http';
import type { DB } from '../db/generated/db';
import {
  getIdempotencyKey,
  insertIdempotencyKey,
  insertNonce,
  setIdempotencyResponse,
} from './service-auth-repo';

const NONCE_TTL_MS = 10 * 60 * 1000;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Stateful storage behind the middleware. Production binds it to the real
 * database (dbAuthStore); unit tests use an in-memory implementation.
 */
export interface AuthStore {
  /** Returns false when the nonce was already used. */
  insertNonce(nonce: string, serviceId: string, expiresAt: Date): Promise<boolean>;
  getIdempotency(key: string): Promise<
    | { request_hash: string; response_status: number | null; response_body: unknown }
    | undefined
  >;
  /** Claims a key; returns false when it already exists (benign race). */
  claimIdempotency(values: {
    key: string;
    service_id: string;
    request_hash: string;
    expires_at: Date;
  }): Promise<boolean>;
  saveIdempotencyResponse(key: string, status: number, body: unknown): Promise<void>;
}

export function dbAuthStore(db: Kysely<DB>): AuthStore {
  return {
    insertNonce: (nonce, serviceId, expiresAt) => insertNonce(db, nonce, serviceId, expiresAt),
    getIdempotency: (key) => getIdempotencyKey(db, key),
    claimIdempotency: (values) => insertIdempotencyKey(db, values),
    saveIdempotencyResponse: (key, status, body) => setIdempotencyResponse(db, key, status, body),
  };
}

export interface HmacAuthConfig {
  serviceId: string;
  secret: string;
  store: AuthStore;
  maxSkewMs?: number;
}

/**
 * HMAC service authentication for /v1/internal/* (contracts/hmac.md).
 * Order: pure crypto checks first (headers, skew, body hash, constant-time
 * signature), then the stateful ones (nonce replay, idempotency) — so
 * unauthenticated garbage never writes to the database. All failures return
 * the same generic 401; the reason is logged at debug level only.
 */
export function hmacAuth(config: HmacAuthConfig, logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const unauthorized = (reason: string) => {
      hmacFailures.inc();
      logger.debug({ reason, requestId: c.get('requestId') }, 'hmac rejected');
      return writeError(c, 401, 'unauthorized', 'authentication failed');
    };

    const rawBody = new Uint8Array(await c.req.arrayBuffer());
    const url = new URL(c.req.url);
    const pathWithQuery = url.pathname + url.search;

    const result = verifyRequest({
      secret: config.secret,
      expectedServiceId: config.serviceId,
      method: c.req.method,
      pathWithQuery,
      rawBody,
      header: (name) => c.req.header(name),
      maxSkewMs: config.maxSkewMs,
    });
    if (!result.ok) {
      return unauthorized(result.reason);
    }

    if (!(await config.store.insertNonce(result.nonce, config.serviceId, new Date(Date.now() + NONCE_TTL_MS)))) {
      return unauthorized('nonce_reused');
    }

    let claimedIdempotencyKey: string | undefined;
    if (MUTATING_METHODS.has(c.req.method.toUpperCase()) && result.idempotencyKey) {
      const key = result.idempotencyKey;
      const hash = requestHash({
        method: c.req.method,
        pathWithQuery,
        bodySha256: result.bodySha256,
        actorId: result.actorId,
        actorRole: result.actorRole,
      });

      const existing = await config.store.getIdempotency(key);
      if (existing) {
        if (existing.request_hash !== hash) {
          return writeError(
            c,
            409,
            'idempotency_conflict',
            'Idempotency key was already used with a different request',
          );
        }
        if (existing.response_status !== null && existing.response_status !== undefined) {
          // Replay the stored response verbatim (contracts/hmac.md).
          return c.newResponse(
            JSON.stringify(existing.response_body ?? null),
            existing.response_status as ContentfulStatusCode,
            {
              'Content-Type': 'application/json; charset=UTF-8',
              'Idempotent-Replay': 'true',
              'X-Request-Id': c.get('requestId'),
            },
          );
        }
        // Claimed but no response stored: previous attempt died mid-flight —
        // re-execute and store the new response.
      } else {
        await config.store.claimIdempotency({
          key,
          service_id: config.serviceId,
          request_hash: hash,
          expires_at: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        });
      }
      claimedIdempotencyKey = key;
    }

    c.set('actorId', result.actorId);
    c.set('actorRole', result.actorRole);

    await next();

    if (claimedIdempotencyKey && c.res && c.res.status < 500) {
      try {
        const text = await c.res.clone().text();
        let body: unknown = null;
        try {
          body = text ? (JSON.parse(text) as unknown) : null;
        } catch {
          body = { raw: text };
        }
        await config.store.saveIdempotencyResponse(claimedIdempotencyKey, c.res.status, body);
      } catch (err) {
        // Never fail the request because response capture failed.
        logger.error({ err, requestId: c.get('requestId') }, 'idempotency response capture failed');
      }
    }
  };
}

/** Role gate for admin-only endpoints; runs after hmacAuth. */
export function requireRole(role: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.get('actorRole') !== role) {
      return writeError(c, 403, 'forbidden', 'Insufficient role');
    }
    await next();
  };
}
