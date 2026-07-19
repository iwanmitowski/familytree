import 'server-only';
import { signRequest, type ActorRole, type SignedRequest } from '@familytree/shared';

export interface SignParams {
  secret: string;
  serviceId: string;
  method: string;
  /** Path plus query string exactly as sent, e.g. /v1/internal/people?q=x */
  pathWithQuery: string;
  rawBody?: string;
  actorId: string;
  actorRole: ActorRole;
  idempotencyKey?: string;
  /** Overridable for tests/vectors; default now / fresh UUID in the shared signer. */
  timestamp?: string;
  nonce?: string;
}

/**
 * Thin wrapper over the shared signer (@familytree/shared). Signing and the
 * API's verification share this exact code, so they cannot drift (ADR 0004).
 * Do NOT reimplement the algorithm here.
 */
export function signOracleRequest(params: SignParams): SignedRequest {
  return signRequest(params);
}
