import { questionnaireSchema } from './schema';
import { toSubmissionPayload } from './payload';
import type { QuestionnaireDraftValues } from './store';

const IDEMPOTENCY_KEY_STORAGE = 'familytree.questionnaire.idempotencyKey';

/**
 * A single idempotency key per submit attempt-series (kept in sessionStorage)
 * so retries after a transient failure are de-duplicated by the API. Cleared
 * on success.
 */
export function attemptIdempotencyKey(): string {
  try {
    const existing = sessionStorage.getItem(IDEMPOTENCY_KEY_STORAGE);
    if (existing) return existing;
    const key = crypto.randomUUID();
    sessionStorage.setItem(IDEMPOTENCY_KEY_STORAGE, key);
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

export function clearIdempotencyKey(): void {
  try {
    sessionStorage.removeItem(IDEMPOTENCY_KEY_STORAGE);
  } catch {
    // ignore
  }
}

export type SubmitResult =
  | { ok: true; submissionId: string; referenceCode: string }
  | { ok: false; kind: 'validation'; issues: string[] }
  | { ok: false; kind: 'rate_limited' }
  | { ok: false; kind: 'turnstile' }
  | { ok: false; kind: 'error' };

export interface SubmitInput {
  values: QuestionnaireDraftValues;
  formStartedAt: number;
  turnstileToken: string;
  inviteToken?: string;
  /** Injectable for tests; defaults to the real fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Assembles the full questionnaire value, validates it, builds the versioned
 * payload, and posts it to the BFF (Task 16). Maps transport results to a
 * discriminated union the UI renders as Bulgarian messages.
 */
export async function submitQuestionnaire({
  values,
  formStartedAt,
  turnstileToken,
  inviteToken,
  fetchImpl = fetch,
}: SubmitInput): Promise<SubmitResult> {
  const full = { website: '', ...values, formStartedAt };
  const parsed = questionnaireSchema.safeParse(full);
  if (!parsed.success) {
    return {
      ok: false,
      kind: 'validation',
      issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(форма)'}: ${i.message}`),
    };
  }

  const payload = toSubmissionPayload(parsed.data);
  const idempotencyKey = attemptIdempotencyKey();

  let res: Response;
  try {
    res = await fetchImpl('/api/questionnaire/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, turnstileToken, inviteToken, idempotencyKey }),
    });
  } catch {
    return { ok: false, kind: 'error' };
  }

  if (res.status === 429) return { ok: false, kind: 'rate_limited' };
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    if (body?.error?.code === 'turnstile_failed') return { ok: false, kind: 'turnstile' };
    return { ok: false, kind: 'validation', issues: [] };
  }
  if (!res.ok) return { ok: false, kind: 'error' };

  const body = (await res.json().catch(() => null)) as { submissionId?: string } | null;
  if (!body?.submissionId) return { ok: false, kind: 'error' };

  clearIdempotencyKey();
  return {
    ok: true,
    submissionId: body.submissionId,
    referenceCode: body.submissionId.slice(0, 8),
  };
}
