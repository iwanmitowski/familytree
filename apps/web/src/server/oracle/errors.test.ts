import { describe, expect, it } from 'vitest';
import { normalizeErrorBody, OracleError } from './errors';

describe('normalizeErrorBody', () => {
  it('maps the uniform API error shape', () => {
    const err = normalizeErrorBody(422, {
      error: { code: 'cycle_detected', message: 'would create a cycle', requestId: 'req-1' },
    });
    expect(err).toBeInstanceOf(OracleError);
    expect(err.status).toBe(422);
    expect(err.code).toBe('cycle_detected');
    expect(err.message).toBe('would create a cycle');
    expect(err.requestId).toBe('req-1');
  });

  it('falls back to a generic error for an unparseable body', () => {
    const err = normalizeErrorBody(500, 'not json at all', 'req-2');
    expect(err.code).toBe('upstream_error');
    expect(err.message).toBe('Upstream error');
    expect(err.requestId).toBe('req-2');
  });

  it('falls back when error is present but malformed', () => {
    const err = normalizeErrorBody(400, { error: 'oops' });
    expect(err.code).toBe('upstream_error');
  });

  it('never leaks internal fields onto the normalized error', () => {
    const err = normalizeErrorBody(500, {
      error: { code: 'x', message: 'y' },
      stack: 'secret internal stack',
      dbHost: 'internal-db',
    });
    expect(JSON.stringify(err)).not.toContain('internal-db');
    expect(JSON.stringify(err)).not.toContain('secret internal stack');
  });
});
