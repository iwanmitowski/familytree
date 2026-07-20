import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Object storage for uploaded files. The default is a local directory (a
 * private volume on the VM, synced to object storage by the backup script —
 * see ADR 0005). A production S3-compatible implementation can be dropped in
 * behind this interface without touching the service layer.
 */
export interface FileStorage {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Local directory storage. Keys are server-generated `files/<uuid>` paths. */
export class LocalDirStorage implements FileStorage {
  private readonly base: string;

  constructor(baseDir: string) {
    this.base = resolve(baseDir);
  }

  private pathFor(key: string): string {
    // Keys are server-generated and validated; still guard against traversal.
    const full = resolve(join(this.base, key));
    if (!full.startsWith(this.base)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}

let cached: FileStorage | undefined;

/** Process-wide storage, backed by FILE_STORAGE_DIR (default ./.file-storage). */
export function getFileStorage(): FileStorage {
  if (!cached) cached = new LocalDirStorage(process.env.FILE_STORAGE_DIR ?? './.file-storage');
  return cached;
}

/** Test seam. */
export function setFileStorage(storage: FileStorage | undefined): void {
  cached = storage;
}
