import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { signRequest } from '@familytree/shared';
import { createApp } from '../../src/transport/app';
import { dbAuthStore } from '../../src/auth/hmac';
import { insertPerson } from '../../src/people/repo';
import { LocalDirStorage, setFileStorage } from '../../src/files/storage';
import { createTestDb, migrateToLatest, testDatabaseUrl, type TestDb } from './helpers';

const SECRET = 'files-test-secret-0123456789abcdef';
const SERVICE_ID = 'familytree-bff-files';
const logger = pino({ enabled: false });

function jpegWithExif(): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from('GPSLatitude:42.7')]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), u16(payload.length + 2), payload]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x02, 0xaa, 0xbb, 0xcc, 0xff, 0xd9]);
  return Buffer.concat([soi, app1, sos]);
}
function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}

describe.skipIf(!testDatabaseUrl())('file uploads (task-38)', () => {
  let ctx: TestDb;
  let app: ReturnType<typeof createApp>;
  let storageDir: string;

  beforeAll(async () => {
    ctx = createTestDb();
    await migrateToLatest(ctx.migrator);
    storageDir = await mkdtemp(join(tmpdir(), 'ft-e2e-files-'));
    setFileStorage(new LocalDirStorage(storageDir));
    app = createApp({
      logger,
      db: ctx.db,
      ping: async () => true,
      hmac: { serviceId: SERVICE_ID, secret: SECRET, store: dbAuthStore(ctx.db) },
    });
  });

  afterAll(async () => {
    setFileStorage(undefined);
    await rm(storageDir, { recursive: true, force: true });
    await ctx.destroy();
  });

  function call(method: string, path: string, body?: unknown) {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const signed = signRequest({
      secret: SECRET,
      serviceId: SERVICE_ID,
      method,
      pathWithQuery: path,
      rawBody: raw,
      actorId: 'admin@example.com',
      actorRole: 'admin',
      idempotencyKey: method === 'GET' ? undefined : randomUUID(),
    });
    return app.request(`http://api.test${path}`, {
      method,
      headers: { ...signed.headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : raw,
    });
  }

  it('uploads → strips EXIF → fetches → deletes', async () => {
    const person = await insertPerson(ctx.db, { living_status: 'deceased', privacy_level: 'family' });

    const upload = await call('POST', '/v1/internal/files', {
      filename: 'photo.jpg',
      contentBase64: jpegWithExif().toString('base64'),
      personId: person.id,
    });
    expect(upload.status).toBe(201);
    const meta = (await upload.json()) as { id: string; contentType: string };
    expect(meta.contentType).toBe('image/jpeg');

    // List by person.
    const list = (await (await call('GET', `/v1/internal/files?personId=${person.id}`)).json()) as { items: { id: string }[] };
    expect(list.items.map((f) => f.id)).toContain(meta.id);

    // Fetch content — EXIF/GPS must be gone from the stored object.
    const fetched = (await (await call('GET', `/v1/internal/files/${meta.id}`)).json()) as { contentBase64: string };
    const bytes = Buffer.from(fetched.contentBase64, 'base64');
    expect(bytes.includes(Buffer.from('Exif'))).toBe(false);
    expect(bytes.includes(Buffer.from('GPSLatitude'))).toBe(false);

    // Delete (soft) → subsequent fetch is 404.
    expect((await call('DELETE', `/v1/internal/files/${meta.id}`)).status).toBe(204);
    expect((await call('GET', `/v1/internal/files/${meta.id}`)).status).toBe(404);
  });

  it('rejects an .exe renamed to .jpg by magic-byte sniffing (422)', async () => {
    const person = await insertPerson(ctx.db, {});
    const res = await call('POST', '/v1/internal/files', {
      filename: 'malware.jpg',
      contentBase64: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0, 0, 0, 0, 0, 0, 0]).toString('base64'),
      personId: person.id,
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_file_type');
  });

  it('rejects an oversize file (413)', async () => {
    const person = await insertPerson(ctx.db, {});
    // 11 MB of JPEG-headed bytes.
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(11 * 1024 * 1024)]);
    const res = await call('POST', '/v1/internal/files', {
      filename: 'huge.jpg',
      contentBase64: big.toString('base64'),
      personId: person.id,
    });
    expect(res.status).toBe(413);
  });
});
