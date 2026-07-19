import 'server-only';

/**
 * Normalized error surfaced to BFF route handlers. Internal backend details
 * never pass through to the browser (idea.md §17.9) — callers map this to a
 * safe Bulgarian message.
 */
export class OracleError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'OracleError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

interface ApiErrorShape {
  error?: { code?: unknown; message?: unknown; requestId?: unknown };
}

/** Parses the API's uniform error body; anything unexpected → generic. */
export function normalizeErrorBody(
  status: number,
  body: unknown,
  fallbackRequestId?: string,
): OracleError {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as ApiErrorShape).error;
    if (err && typeof err === 'object') {
      const code = typeof err.code === 'string' ? err.code : 'upstream_error';
      const message = typeof err.message === 'string' ? err.message : 'Upstream error';
      const requestId = typeof err.requestId === 'string' ? err.requestId : fallbackRequestId;
      return new OracleError(status, code, message, requestId);
    }
  }
  return new OracleError(status, 'upstream_error', 'Upstream error', fallbackRequestId);
}
