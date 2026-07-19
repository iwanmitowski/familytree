/**
 * Regenerates contracts/hmac-test-vectors.json from the shared signer.
 * Run from the repo root:  npx tsx packages/shared/scripts/generate-hmac-vectors.ts
 * The vectors are golden regression guards — if this file's output changes,
 * the wire contract changed and every consumer must be re-verified.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bodySha256, buildCanonicalPayload, signCanonical } from '../src/hmac';

const SECRET = 'vector-secret-0123456789abcdef-not-a-real-secret';
const SERVICE_ID = 'familytree-bff';

interface VectorInput {
  name: string;
  method: string;
  pathWithQuery: string;
  timestamp: string;
  nonce: string;
  idempotencyKey: string;
  actorId: string;
  actorRole: string;
  bodyUtf8: string;
}

const inputs: VectorInput[] = [
  {
    name: 'get-no-body',
    method: 'GET',
    pathWithQuery: '/v1/internal/submissions',
    timestamp: '2026-07-19T10:00:00.000Z',
    nonce: '11111111-1111-4111-8111-111111111111',
    idempotencyKey: '',
    actorId: 'admin@example.com',
    actorRole: 'admin',
    bodyUtf8: '',
  },
  {
    name: 'get-with-query-string',
    method: 'GET',
    pathWithQuery: '/v1/internal/people?q=%D0%9C%D0%B8%D1%82%D0%BE%D0%B2&limit=10',
    timestamp: '2026-07-19T10:01:00.000Z',
    nonce: '22222222-2222-4222-8222-222222222222',
    idempotencyKey: '',
    actorId: 'admin@example.com',
    actorRole: 'admin',
    bodyUtf8: '',
  },
  {
    name: 'post-json-body-with-idempotency-key',
    method: 'POST',
    pathWithQuery: '/v1/internal/submissions',
    timestamp: '2026-07-19T10:02:00.000Z',
    nonce: '33333333-3333-4333-8333-333333333333',
    idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    actorId: 'public',
    actorRole: 'public',
    bodyUtf8: '{"hello":"world"}',
  },
  {
    name: 'post-cyrillic-utf8-body',
    method: 'POST',
    pathWithQuery: '/v1/internal/submissions',
    timestamp: '2026-07-19T10:03:00.000Z',
    nonce: '44444444-4444-4444-8444-444444444444',
    idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    actorId: 'public',
    actorRole: 'public',
    bodyUtf8: '{"firstName":"Иван","surname":"Митовски","birthplace":"с. Горна Бела Речка"}',
  },
  {
    name: 'post-empty-idempotency-key',
    method: 'POST',
    pathWithQuery: '/v1/internal/submissions/00000000-0000-4000-8000-000000000000/start-review',
    timestamp: '2026-07-19T10:04:00.000Z',
    nonce: '55555555-5555-4555-8555-555555555555',
    idempotencyKey: '',
    actorId: 'admin@example.com',
    actorRole: 'admin',
    bodyUtf8: '',
  },
  {
    name: 'get-public-actor',
    method: 'GET',
    pathWithQuery: '/v1/internal/tree/00000000-0000-4000-8000-000000000000?ancestors=4&view=public',
    timestamp: '2026-07-19T10:05:00.000Z',
    nonce: '66666666-6666-4666-8666-666666666666',
    idempotencyKey: '',
    actorId: 'public',
    actorRole: 'public',
    bodyUtf8: '',
  },
];

const vectors = inputs.map((input) => {
  const hash = bodySha256(input.bodyUtf8);
  const canonicalPayload = buildCanonicalPayload({
    method: input.method,
    pathWithQuery: input.pathWithQuery,
    timestamp: input.timestamp,
    nonce: input.nonce,
    idempotencyKey: input.idempotencyKey,
    bodySha256: hash,
    actorId: input.actorId,
    actorRole: input.actorRole,
  });
  return {
    ...input,
    secret: SECRET,
    serviceId: SERVICE_ID,
    bodySha256: hash,
    canonicalPayload,
    signature: signCanonical(SECRET, canonicalPayload),
  };
});

const outPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../contracts/hmac-test-vectors.json',
);
writeFileSync(outPath, JSON.stringify({ version: 1, vectors }, null, 2) + '\n', 'utf8');
console.log(`Wrote ${vectors.length} vectors to ${outPath}`);
