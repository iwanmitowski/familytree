import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv, RouteDeps } from '../transport/app';
import { writeError } from '../transport/http';
import { parseJson } from '../transport/validate';
import { requireRole } from '../auth/hmac';
import { getFileStorage } from './storage';
import { deleteFile, getFileContent, uploadFile } from './service';
import { listFilesByPerson, listFilesBySource, type FileRow } from './repo';
import { MAX_FILE_BYTES } from './sniff';

// Hard DoS ceiling on the base64 envelope (2x the 10MB binary cap). Files
// between 10MB and this bound decode fine but are rejected as too_large (413)
// by the service; anything past this is a 400 before we allocate the buffer.
const MAX_BASE64_LEN = Math.ceil((MAX_FILE_BYTES * 2 * 4) / 3) + 1024;

function fileMeta(row: FileRow) {
  return {
    id: row.id,
    personId: row.person_id,
    sourceId: row.source_id,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    createdAt: row.created_at,
  };
}

export function registerFileRoutes(app: Hono<AppEnv>, deps: RouteDeps): void {
  const { db } = deps;
  const actor = (c: Context<AppEnv>) => c.get('actorId') ?? 'admin';

  const uploadSchema = z.object({
    filename: z.string().min(1).max(500),
    contentBase64: z.string().min(1).max(MAX_BASE64_LEN),
    personId: z.string().uuid().nullish(),
    sourceId: z.string().uuid().nullish(),
  });

  app.post('/v1/internal/files', requireRole('admin'), async (c) => {
    const parsed = await parseJson(c, uploadSchema);
    if ('response' in parsed) return parsed.response;
    const { filename, contentBase64, personId, sourceId } = parsed.data;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(contentBase64, 'base64');
    } catch {
      return writeError(c, 400, 'invalid_content', 'Невалидно съдържание на файла');
    }

    const result = await uploadFile(db, getFileStorage(), { buffer, filename, personId, sourceId }, actor(c));
    if (result.ok) return c.json(fileMeta(result.file), 201);
    switch (result.kind) {
      case 'too_large':
        return writeError(c, 413, 'file_too_large', 'Файлът е твърде голям (максимум 10MB)');
      case 'invalid_type':
        return writeError(c, 422, 'invalid_file_type', 'Разрешени са само JPEG, PNG, WEBP и PDF');
      case 'bad_image':
        return writeError(c, 422, 'invalid_image', 'Изображението не може да бъде обработено');
      case 'no_subject':
        return writeError(c, 422, 'no_subject', 'Файлът трябва да е свързан с човек или източник');
    }
  });

  app.get('/v1/internal/files', requireRole('admin'), async (c) => {
    const personId = c.req.query('personId');
    const sourceId = c.req.query('sourceId');
    if (personId) return c.json({ items: (await listFilesByPerson(db, personId)).map(fileMeta) });
    if (sourceId) return c.json({ items: (await listFilesBySource(db, sourceId)).map(fileMeta) });
    return writeError(c, 422, 'missing_params', 'Необходим е personId или sourceId');
  });

  // Streamed content (admin only — files are NEVER exposed publicly, idea.md §15).
  app.get('/v1/internal/files/:id', requireRole('admin'), async (c) => {
    const content = await getFileContent(db, getFileStorage(), c.req.param('id'));
    if (!content) return writeError(c, 404, 'not_found', 'Файлът не е намерен');
    return c.json({
      ...fileMeta(content.row),
      contentBase64: content.buffer.toString('base64'),
    });
  });

  app.delete('/v1/internal/files/:id', requireRole('admin'), async (c) => {
    const ok = await deleteFile(db, getFileStorage(), c.req.param('id'), actor(c));
    if (!ok) return writeError(c, 404, 'not_found', 'Файлът не е намерен');
    return c.body(null, 204);
  });
}
