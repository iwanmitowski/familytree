import { test, expect } from '@playwright/test';
import { loginAsAdmin, adminPost, buildPayload } from './helpers';

// idea.md §23 (invites): a max-1 invite is consumed on first submission and
// rejected on the second use.

test('a single-use invite is consumed then rejected', async ({ page }) => {
  await loginAsAdmin(page);

  const invite = await adminPost<{ token: string; id: string }>(page, '/api/admin/invites', {
    recipientLabel: 'Е2Е Покана',
    maxSubmissions: 1,
  });
  expect(invite.token).toBeTruthy();

  const submit = (name: string) =>
    page.request.post('/api/questionnaire/submit', {
      headers: { 'Content-Type': 'application/json' },
      data: { payload: buildPayload(name), turnstileToken: 'e2e', inviteToken: invite.token, idempotencyKey: crypto.randomUUID() },
    });

  const first = await submit(`Покана Първи ${Date.now()}`);
  expect(first.status(), 'first use accepted').toBe(201);

  // used_submissions incremented → invite exhausted.
  const list = await (await page.request.get('/api/admin/invites', { headers: { 'X-Admin-Request': '1' } })).json();
  const row = (list.items as { id: string; usedSubmissions: number }[]).find((i) => i.id === invite.id);
  expect(row?.usedSubmissions).toBe(1);

  const second = await submit(`Покана Втори ${Date.now()}`);
  expect(second.status(), 'second use rejected').not.toBe(201);
});
