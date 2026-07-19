/**
 * HMAC service authentication — the single implementation used by BOTH the
 * Vercel BFF (signing) and the Oracle API (verification). The wire contract
 * is documented in contracts/hmac.md; golden vectors live in
 * contracts/hmac-test-vectors.json. Server-only code (node:crypto) — never
 * import from client components.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const ACTOR_ROLES = ['admin', 'public'] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

/** Canonical header names (lowercase; HTTP headers are case-insensitive). */
export const HMAC_HEADERS = {
  serviceId: 'x-service-id',
  timestamp: 'x-request-timestamp',
  nonce: 'x-request-nonce',
  idempotencyKey: 'x-idempotency-key',
  bodySha256: 'x-body-sha256',
  actorId: 'x-actor-id',
  actorRole: 'x-actor-role',
  signature: 'x-signature',
} as const;

export interface CanonicalParts {
  /** HTTP method; canonicalized to uppercase. */
  method: string;
  /** Percent-encoded path; when a query string exists: path + '?' + raw query. */
  pathWithQuery: string;
  /** RFC3339 UTC timestamp, e.g. 2026-07-19T10:00:00.000Z */
  timestamp: string;
  /** Single-use UUIDv4. */
  nonce: string;
  /** Empty string when the request carries no idempotency key. */
  idempotencyKey: string;
  /** Lowercase hex SHA-256 of the raw body (empty body = hash of ''). */
  bodySha256: string;
  actorId: string;
  actorRole: string;
}

export function bodySha256(rawBody: string | Uint8Array): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

export function buildCanonicalPayload(parts: CanonicalParts): string {
  return [
    parts.method.toUpperCase(),
    parts.pathWithQuery,
    parts.timestamp,
    parts.nonce,
    parts.idempotencyKey,
    parts.bodySha256,
    parts.actorId,
    parts.actorRole,
  ].join('\n');
}

export function signCanonical(secret: string, canonicalPayload: string): string {
  return createHmac('sha256', secret).update(canonicalPayload).digest('hex');
}

/**
 * Idempotency request hash: identifies "the same request retried". It
 * deliberately EXCLUDES timestamp and nonce — retries rotate both (nonces are
 * single-use), so hashing the full canonical payload would make every retry
 * look like a different request and break idempotent replay.
 */
export function requestHash(parts: {
  method: string;
  pathWithQuery: string;
  bodySha256: string;
  actorId: string;
  actorRole: string;
}): string {
  return createHash('sha256')
    .update(
      [
        parts.method.toUpperCase(),
        parts.pathWithQuery,
        parts.bodySha256,
        parts.actorId,
        parts.actorRole,
      ].join('\n'),
    )
    .digest('hex');
}

export interface SignRequestInput {
  secret: string;
  serviceId: string;
  method: string;
  pathWithQuery: string;
  /** Raw body bytes exactly as they will be sent; omit for bodyless requests. */
  rawBody?: string | Uint8Array;
  actorId: string;
  actorRole: ActorRole;
  idempotencyKey?: string;
  /** Overridable for tests/vectors; defaults to now. */
  timestamp?: string;
  /** Overridable for tests/vectors; defaults to a fresh UUIDv4. */
  nonce?: string;
}

export interface SignedRequest {
  headers: Record<string, string>;
  canonicalPayload: string;
  bodySha256: string;
  signature: string;
  timestamp: string;
  nonce: string;
}

export function signRequest(input: SignRequestInput): SignedRequest {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const nonce = input.nonce ?? randomUUID();
  const hash = bodySha256(input.rawBody ?? '');
  const canonicalPayload = buildCanonicalPayload({
    method: input.method,
    pathWithQuery: input.pathWithQuery,
    timestamp,
    nonce,
    idempotencyKey: input.idempotencyKey ?? '',
    bodySha256: hash,
    actorId: input.actorId,
    actorRole: input.actorRole,
  });
  const signature = signCanonical(input.secret, canonicalPayload);

  const headers: Record<string, string> = {
    'X-Service-Id': input.serviceId,
    'X-Request-Timestamp': timestamp,
    'X-Request-Nonce': nonce,
    'X-Body-SHA256': hash,
    'X-Actor-Id': input.actorId,
    'X-Actor-Role': input.actorRole,
    'X-Signature': signature,
  };
  if (input.idempotencyKey) {
    headers['X-Idempotency-Key'] = input.idempotencyKey;
  }
  return { headers, canonicalPayload, bodySha256: hash, signature, timestamp, nonce };
}

export type VerifyFailureReason =
  | 'missing_header'
  | 'unknown_service'
  | 'invalid_timestamp'
  | 'timestamp_skew'
  | 'body_hash_mismatch'
  | 'bad_signature';

export interface VerifyOk {
  ok: true;
  actorId: string;
  actorRole: string;
  nonce: string;
  timestamp: string;
  /** '' when the request carried no idempotency key. */
  idempotencyKey: string;
  bodySha256: string;
  canonicalPayload: string;
}

export interface VerifyFail {
  ok: false;
  reason: VerifyFailureReason;
}

export const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000;

export interface VerifyRequestInput {
  secret: string;
  expectedServiceId: string;
  method: string;
  pathWithQuery: string;
  rawBody: string | Uint8Array;
  /** Case-insensitive header getter (e.g. Hono's c.req.header). */
  header: (name: string) => string | undefined;
  now?: Date;
  maxSkewMs?: number;
}

/**
 * Pure verification: headers, clock skew, body hash, constant-time signature.
 * Stateful checks (nonce replay, idempotency) are the API middleware's job.
 * Actor headers are trusted ONLY because they are part of the signed payload.
 */
export function verifyRequest(input: VerifyRequestInput): VerifyOk | VerifyFail {
  const get = (name: string) => input.header(name) ?? undefined;

  const serviceId = get(HMAC_HEADERS.serviceId);
  const timestamp = get(HMAC_HEADERS.timestamp);
  const nonce = get(HMAC_HEADERS.nonce);
  const bodyHash = get(HMAC_HEADERS.bodySha256);
  const actorId = get(HMAC_HEADERS.actorId);
  const actorRole = get(HMAC_HEADERS.actorRole);
  const signature = get(HMAC_HEADERS.signature);
  const idempotencyKey = get(HMAC_HEADERS.idempotencyKey) ?? '';

  if (!serviceId || !timestamp || !nonce || !bodyHash || !actorId || !actorRole || !signature) {
    return { ok: false, reason: 'missing_header' };
  }
  if (serviceId !== input.expectedServiceId) {
    return { ok: false, reason: 'unknown_service' };
  }

  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  const now = input.now ?? new Date();
  const maxSkew = input.maxSkewMs ?? DEFAULT_MAX_SKEW_MS;
  if (Math.abs(now.getTime() - parsed) > maxSkew) {
    return { ok: false, reason: 'timestamp_skew' };
  }

  const actualBodyHash = bodySha256(input.rawBody);
  if (actualBodyHash !== bodyHash) {
    return { ok: false, reason: 'body_hash_mismatch' };
  }

  const canonicalPayload = buildCanonicalPayload({
    method: input.method,
    pathWithQuery: input.pathWithQuery,
    timestamp,
    nonce,
    idempotencyKey,
    bodySha256: bodyHash,
    actorId,
    actorRole,
  });
  const expected = Buffer.from(signCanonical(input.secret, canonicalPayload), 'utf8');
  const provided = Buffer.from(signature, 'utf8');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, reason: 'bad_signature' };
  }

  return {
    ok: true,
    actorId,
    actorRole,
    nonce,
    timestamp,
    idempotencyKey,
    bodySha256: bodyHash,
    canonicalPayload,
  };
}
