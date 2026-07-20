import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitQuestionnaire } from './submit';

const VALID_VALUES = {
  participantName: 'Тест Тестов',
  connectionToFamily: 'внук',
  consentDataProcessing: true,
  self: { firstName: 'Иван', livingStatus: 'living' },
  website: '',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('submitQuestionnaire', () => {
  it('posts a versioned payload + turnstile token + idempotency key and returns the reference code', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { submissionId: 'abcdef12-3456-7890-abcd-ef1234567890' }));

    const result = await submitQuestionnaire({
      values: VALID_VALUES,
      formStartedAt: 1_700_000_000_000,
      turnstileToken: 'tok-123',
      inviteToken: 'inv_x',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      submissionId: 'abcdef12-3456-7890-abcd-ef1234567890',
      referenceCode: 'abcdef12',
    });
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(init.body as string) as {
      payload: { payloadVersion: number; people: unknown[] };
      turnstileToken: string;
      inviteToken: string;
      idempotencyKey: string;
    };
    expect(body.payload.payloadVersion).toBe(1);
    expect(body.payload.people).toHaveLength(1);
    expect(body.turnstileToken).toBe('tok-123');
    expect(body.inviteToken).toBe('inv_x');
    expect(body.idempotencyKey).toMatch(/[0-9a-f-]{36}/);
  });

  it('reuses one idempotency key across retries and clears it on success', async () => {
    const failThenSucceed = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { error: { code: 'x' } }))
      .mockResolvedValueOnce(jsonResponse(201, { submissionId: 'id-2-3456-7890' }));

    const first = await submitQuestionnaire({
      values: VALID_VALUES,
      formStartedAt: 1,
      turnstileToken: 't',
      fetchImpl: failThenSucceed as unknown as typeof fetch,
    });
    expect(first.ok).toBe(false);
    const keyAfterFail = sessionStorage.getItem('familytree.questionnaire.idempotencyKey');
    expect(keyAfterFail).toBeTruthy();

    const second = await submitQuestionnaire({
      values: VALID_VALUES,
      formStartedAt: 1,
      turnstileToken: 't',
      fetchImpl: failThenSucceed as unknown as typeof fetch,
    });
    expect(second.ok).toBe(true);
    const [, init2] = failThenSucceed.mock.calls[1]!;
    expect((JSON.parse(init2.body as string) as { idempotencyKey: string }).idempotencyKey).toBe(
      keyAfterFail,
    );
    // Cleared after success.
    expect(sessionStorage.getItem('familytree.questionnaire.idempotencyKey')).toBeNull();
  });

  it('maps 429 to rate_limited', async () => {
    const result = await submitQuestionnaire({
      values: VALID_VALUES,
      formStartedAt: 1,
      turnstileToken: 't',
      fetchImpl: (() => Promise.resolve(jsonResponse(429, {}))) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, kind: 'rate_limited' });
  });

  it('maps a 400 turnstile_failed to turnstile', async () => {
    const result = await submitQuestionnaire({
      values: VALID_VALUES,
      formStartedAt: 1,
      turnstileToken: 't',
      fetchImpl: (() =>
        Promise.resolve(jsonResponse(400, { error: { code: 'turnstile_failed' } }))) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, kind: 'turnstile' });
  });

  it('rejects invalid values before calling fetch', async () => {
    const fetchImpl = vi.fn();
    const result = await submitQuestionnaire({
      values: { participantName: '', self: {} },
      formStartedAt: 1,
      turnstileToken: 't',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('validation');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a network failure to error', async () => {
    const result = await submitQuestionnaire({
      values: VALID_VALUES,
      formStartedAt: 1,
      turnstileToken: 't',
      fetchImpl: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, kind: 'error' });
  });
});
