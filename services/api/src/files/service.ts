import { createHash, randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { DB } from '../db/generated/db';
import { insertAuditEntry } from '../audit/repo';
import type { FileStorage } from './storage';
import { getFile, insertFile, softDeleteFile, type FileRow } from './repo';
import { isImage, MAX_FILE_BYTES, sniffContentType } from './sniff';
import { stripImageMetadata } from './strip';

type Db = Kysely<DB>;

export interface UploadInput {
  buffer: Buffer;
  filename: string;
  personId?: string | null;
  sourceId?: string | null;
}

export type UploadResult =
  | { ok: true; file: FileRow }
  | { ok: false; kind: 'too_large' | 'invalid_type' | 'no_subject' | 'bad_image' };

/**
 * Validates, sanitises, and stores an uploaded file (idea.md §24 Phase 6):
 * magic-byte sniffing, 10MB cap, images decoded → stripped of all metadata →
 * re-encoded (EXIF/GPS removed), PDFs stored as-is. Writes the object first,
 * then the DB row; on a row failure the orphaned object is best-effort removed.
 */
export async function uploadFile(
  db: Db,
  storage: FileStorage,
  input: UploadInput,
  actorId: string,
): Promise<UploadResult> {
  if (!input.personId && !input.sourceId) return { ok: false, kind: 'no_subject' };
  if (input.buffer.length > MAX_FILE_BYTES) return { ok: false, kind: 'too_large' };

  const contentType = sniffContentType(input.buffer);
  if (!contentType) return { ok: false, kind: 'invalid_type' };

  let stored: Buffer;
  if (isImage(contentType)) {
    try {
      stored = stripImageMetadata(input.buffer, contentType);
    } catch {
      return { ok: false, kind: 'bad_image' };
    }
  } else {
    stored = input.buffer;
  }

  const storageKey = `files/${randomUUID()}`;
  const sha256 = createHash('sha256').update(stored).digest('hex');

  // Object first, row second (idea.md §24 — orphan sweeper handles a row failure).
  await storage.put(storageKey, stored);
  try {
    const file = await insertFile(db, {
      person_id: input.personId ?? null,
      source_id: input.sourceId ?? null,
      original_filename: input.filename.slice(0, 500),
      content_type: contentType,
      size_bytes: stored.length,
      sha256,
      storage_key: storageKey,
      uploaded_by: actorId,
    });
    await insertAuditEntry(db, {
      actor_type: 'admin',
      actor_id: actorId,
      action: 'file.uploaded',
      entity_type: 'file',
      entity_id: file.id,
    });
    return { ok: true, file };
  } catch (err) {
    await storage.delete(storageKey).catch(() => undefined);
    throw err;
  }
}

export interface FileContent {
  row: FileRow;
  buffer: Buffer;
}

/** Streams an active file's bytes (admin only — never public). */
export async function getFileContent(db: Db, storage: FileStorage, id: string): Promise<FileContent | null> {
  const row = await getFile(db, id);
  if (!row) return null;
  const buffer = await storage.get(row.storage_key);
  return { row, buffer };
}

export async function deleteFile(db: Db, storage: FileStorage, id: string, actorId: string): Promise<boolean> {
  const row = await softDeleteFile(db, id);
  if (!row) return false;
  await storage.delete(row.storage_key).catch(() => undefined);
  await insertAuditEntry(db, {
    actor_type: 'admin',
    actor_id: actorId,
    action: 'file.deleted',
    entity_type: 'file',
    entity_id: id,
  });
  return true;
}
