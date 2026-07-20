import { expect, type Page } from '@playwright/test';

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@example.com';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-test-password';

/**
 * Signs in as the test admin through the guarded Auth.js Credentials provider
 * (only present when E2E_TEST_MODE=1). Uses the request context so the session
 * cookie is shared with subsequent page navigations.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  const res = await page.request.post('/api/auth/callback/credentials', {
    form: {
      csrfToken: csrf.csrfToken as string,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      callbackUrl: '/admin',
    },
    maxRedirects: 5,
  });
  expect(res.status(), 'admin credentials login').toBeLessThan(400);
}

/** Admin BFF GET returning parsed JSON (requires an authenticated context). */
export async function adminGet<T>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(path, { headers: { 'X-Admin-Request': '1' } });
  expect(res.ok(), `GET ${path}`).toBeTruthy();
  return (await res.json()) as T;
}

/** Admin BFF POST returning parsed JSON. */
export async function adminPost<T>(page: Page, path: string, body?: unknown): Promise<T> {
  const res = await page.request.post(path, {
    headers: { 'X-Admin-Request': '1', 'Content-Type': 'application/json' },
    data: body ?? {},
  });
  expect(res.ok(), `POST ${path}`).toBeTruthy();
  return (await res.json()) as T;
}

export interface SubmissionListItem {
  id: string;
  status: string;
  participantName: string | null;
}

/** A minimal valid submission payload (SELF + FATHER + MOTHER + parent edges). */
export function buildPayload(participantName: string) {
  return {
    payloadVersion: 1,
    participant: { name: participantName, fillingForOther: false, connectionToFamily: 'внук', preferredContact: 'email' },
    people: [
      { localKey: 'SELF', firstName: 'Иван', surname: 'Митовски', birthYear: 1958, livingStatus: 'living' },
      { localKey: 'FATHER', firstName: 'Петър', surname: 'Митовски', birthYear: 1930, deathYear: 2001, livingStatus: 'deceased' },
      { localKey: 'MOTHER', firstName: 'Мария', surname: 'Митовска', birthYear: 1935, livingStatus: 'deceased' },
    ],
    relationships: [
      { fromLocalKey: 'SELF', toLocalKey: 'FATHER', type: 'parent' },
      { fromLocalKey: 'SELF', toLocalKey: 'MOTHER', type: 'parent' },
    ],
    origin: { hasMaterials: 'no' },
    consents: [{ consentType: 'data_processing', consentVersion: '2026-07-19', accepted: true }],
    meta: { startedAt: 0, durationMs: 120_000, fillingForOther: false },
  };
}

/** Submits a questionnaire through the public BFF (Turnstile test key passes). */
export async function submitQuestionnaire(page: Page, participantName: string): Promise<void> {
  const res = await page.request.post('/api/questionnaire/submit', {
    headers: { 'Content-Type': 'application/json' },
    data: { payload: buildPayload(participantName), turnstileToken: 'e2e', idempotencyKey: crypto.randomUUID() },
  });
  expect(res.status(), 'submit questionnaire').toBe(201);
}
