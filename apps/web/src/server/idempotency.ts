import 'server-only';
import { randomUUID } from 'node:crypto';

/** Fresh idempotency key for a mutating Oracle API request (UUIDv4). */
export function newIdempotencyKey(): string {
  return randomUUID();
}
