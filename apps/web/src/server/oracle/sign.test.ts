import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { signOracleRequest } from './sign';

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
  signature: string;
}

function loadVectors(): Vector[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = path.resolve(here, '../../../../../contracts/hmac-test-vectors.json');
  return (JSON.parse(readFileSync(file, 'utf8')) as { vectors: Vector[] }).vectors;
}

describe('signOracleRequest — parity with the shared golden vectors', () => {
  const vectors = loadVectors();

  it('has vectors to check', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(6);
  });

  for (const vector of loadVectors()) {
    it(`reproduces the signature for ${vector.name}`, () => {
      const signed = signOracleRequest({
        secret: vector.secret,
        serviceId: vector.serviceId,
        method: vector.method,
        pathWithQuery: vector.pathWithQuery,
        rawBody: vector.bodyUtf8 || undefined,
        actorId: vector.actorId,
        actorRole: vector.actorRole,
        idempotencyKey: vector.idempotencyKey || undefined,
        timestamp: vector.timestamp,
        nonce: vector.nonce,
      });
      expect(signed.bodySha256).toBe(vector.bodySha256);
      expect(signed.signature).toBe(vector.signature);
      expect(signed.headers['X-Signature']).toBe(vector.signature);
    });
  }
});
