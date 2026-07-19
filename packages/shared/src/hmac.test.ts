import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bodySha256,
  buildCanonicalPayload,
  requestHash,
  signCanonical,
  signRequest,
  verifyRequest,
  type VerifyFail,
} from './hmac';

const SECRET = 'unit-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff';

interface Vector {
  name: string;
  method: string;
  pathWithQuery: string;
  timestamp: string;
  nonce: string;
  idempotencyKey: string;
  actorId: string;
  actorRole: 'admin' | 'public';
  bodyUtf8: string;
  secret: string;
  serviceId: string;
  bodySha256: string;
  canonicalPayload: string;
  signature: string;
}

function loadVectors(): Vector[] {
  const url = new URL('../../../contracts/hmac-test-vectors.json', import.meta.url);
  return (JSON.parse(readFileSync(url, 'utf8')) as { vectors: Vector[] }).vectors;
}

function baseSignInput() {
  return {
    secret: SECRET,
    serviceId: SERVICE_ID,
    method: 'POST',
    pathWithQuery: '/v1/internal/submissions',
    rawBody: '{"a":1}',
    actorId: 'public',
    actorRole: 'public' as const,
    idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  };
}

function verifyInputFor(
  signed: ReturnType<typeof signRequest>,
  overrides: Record<string, string | undefined> = {},
) {
  const headers: Record<string, string | undefined> = { ...signed.headers, ...overrides };
  const lookup = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return (name: string) => lookup.get(name.toLowerCase());
}

describe('canonical payload', () => {
  it('empty body hashes to the SHA-256 of the empty string', () => {
    expect(bodySha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('joins exactly eight lines and uppercases the method', () => {
    const payload = buildCanonicalPayload({
      method: 'post',
      pathWithQuery: '/v1/internal/x?a=1',
      timestamp: 'T',
      nonce: 'N',
      idempotencyKey: '',
      bodySha256: 'H',
      actorId: 'A',
      actorRole: 'R',
    });
    expect(payload.split('\n')).toEqual(['POST', '/v1/internal/x?a=1', 'T', 'N', '', 'H', 'A', 'R']);
  });

  it('request hash excludes timestamp and nonce so retries match', () => {
    const first = signRequest(baseSignInput());
    const retry = signRequest(baseSignInput());
    expect(first.nonce).not.toBe(retry.nonce);
    const hashOf = (s: ReturnType<typeof signRequest>) =>
      requestHash({
        method: 'POST',
        pathWithQuery: '/v1/internal/submissions',
        bodySha256: s.bodySha256,
        actorId: 'public',
        actorRole: 'public',
      });
    expect(hashOf(first)).toBe(hashOf(retry));
  });
});

describe('sign + verify roundtrip', () => {
  it('accepts a correctly signed request and returns the signed actor', () => {
    const signed = signRequest(baseSignInput());
    const result = verifyRequest({
      secret: SECRET,
      expectedServiceId: SERVICE_ID,
      method: 'POST',
      pathWithQuery: '/v1/internal/submissions',
      rawBody: '{"a":1}',
      header: verifyInputFor(signed),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actorId).toBe('public');
      expect(result.actorRole).toBe('public');
      expect(result.idempotencyKey).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    }
  });

  const failCase = (
    name: string,
    reason: VerifyFail['reason'],
    mutate: (input: Parameters<typeof verifyRequest>[0], signed: ReturnType<typeof signRequest>) => void,
  ) => {
    it(`rejects: ${name} (${reason})`, () => {
      const signed = signRequest(baseSignInput());
      const input: Parameters<typeof verifyRequest>[0] = {
        secret: SECRET,
        expectedServiceId: SERVICE_ID,
        method: 'POST',
        pathWithQuery: '/v1/internal/submissions',
        rawBody: '{"a":1}',
        header: verifyInputFor(signed),
      };
      mutate(input, signed);
      const result = verifyRequest(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe(reason);
    });
  };

  failCase('missing signature header', 'missing_header', (input, signed) => {
    input.header = verifyInputFor(signed, { 'X-Signature': undefined as unknown as string });
    const orig = input.header;
    input.header = (n) => (n.toLowerCase() === 'x-signature' ? undefined : orig(n));
  });

  failCase('wrong service id', 'unknown_service', (input) => {
    input.expectedServiceId = 'someone-else';
  });

  failCase('unparseable timestamp', 'invalid_timestamp', (input, signed) => {
    input.header = verifyInputFor(signed, { 'X-Request-Timestamp': 'not-a-date' });
  });

  failCase('expired timestamp (10 min old)', 'timestamp_skew', (input, signed) => {
    input.now = new Date(Date.parse(signed.timestamp) + 10 * 60 * 1000);
  });

  failCase('future timestamp (10 min ahead)', 'timestamp_skew', (input, signed) => {
    input.now = new Date(Date.parse(signed.timestamp) - 10 * 60 * 1000);
  });

  failCase('body swapped after signing', 'body_hash_mismatch', (input) => {
    input.rawBody = '{"a":2}';
  });

  failCase('actor role tampered after signing', 'bad_signature', (input, signed) => {
    input.header = verifyInputFor(signed, { 'X-Actor-Role': 'admin' });
  });

  failCase('signature of wrong length', 'bad_signature', (input, signed) => {
    input.header = verifyInputFor(signed, { 'X-Signature': 'deadbeef' });
  });

  failCase('tampered path', 'bad_signature', (input) => {
    input.pathWithQuery = '/v1/internal/people';
  });
});

describe('golden vectors (contracts/hmac-test-vectors.json)', () => {
  const vectors = loadVectors();

  it('has at least 6 vectors', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(6);
  });

  for (const vector of loadVectors()) {
    it(`reproduces: ${vector.name}`, () => {
      expect(bodySha256(vector.bodyUtf8)).toBe(vector.bodySha256);
      const canonical = buildCanonicalPayload({
        method: vector.method,
        pathWithQuery: vector.pathWithQuery,
        timestamp: vector.timestamp,
        nonce: vector.nonce,
        idempotencyKey: vector.idempotencyKey,
        bodySha256: vector.bodySha256,
        actorId: vector.actorId,
        actorRole: vector.actorRole,
      });
      expect(canonical).toBe(vector.canonicalPayload);
      expect(signCanonical(vector.secret, canonical)).toBe(vector.signature);

      // The full signer agrees with the piecewise computation.
      const signed = signRequest({
        secret: vector.secret,
        serviceId: vector.serviceId,
        method: vector.method,
        pathWithQuery: vector.pathWithQuery,
        rawBody: vector.bodyUtf8,
        actorId: vector.actorId,
        actorRole: vector.actorRole,
        idempotencyKey: vector.idempotencyKey || undefined,
        timestamp: vector.timestamp,
        nonce: vector.nonce,
      });
      expect(signed.signature).toBe(vector.signature);

      // And verification accepts the vector end-to-end.
      const result = verifyRequest({
        secret: vector.secret,
        expectedServiceId: vector.serviceId,
        method: vector.method,
        pathWithQuery: vector.pathWithQuery,
        rawBody: vector.bodyUtf8,
        header: verifyInputFor(signed),
        now: new Date(vector.timestamp),
      });
      expect(result.ok).toBe(true);
    });
  }
});
