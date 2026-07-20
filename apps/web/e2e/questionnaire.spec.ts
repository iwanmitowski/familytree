import { test, expect, type Page } from '@playwright/test';
import { loginAsAdmin, adminGet, type SubmissionListItem } from './helpers';

// idea.md §23 steps 1-2: a visitor fills the Bulgarian questionnaire (participant
// + SELF + parents + one grandparent), passes the Turnstile test widget, submits,
// and the submission lands as `pending`.

export const PARTICIPANT = `Е2Е Участник ${Date.now()}`;

async function next(page: Page) {
  await page.getByRole('button', { name: 'Напред' }).click();
}

test('a questionnaire submission is stored as pending', async ({ page }) => {
  await page.goto('/questionnaire');

  // Step 1 — participant + required consent.
  await page.getByLabel(/Вашето име|Име/).first().fill(PARTICIPANT);
  await page.getByLabel(/Връзка с рода/).first().fill('внук');
  await page.getByRole('checkbox').first().check(); // data_processing consent
  await next(page);

  // Step 2 — SELF.
  await page.getByLabel('Собствено име').first().fill('Иван');
  await page.getByLabel('Фамилия').first().fill('Митовски');
  await page.getByLabel(/Година на раждане/).first().fill('1958');
  await next(page);

  // Step 3 — parents (FATHER + MOTHER).
  await page.getByLabel('Собствено име').nth(0).fill('Петър');
  await page.getByLabel('Фамилия').nth(0).fill('Митовски');
  await page.getByLabel('Собствено име').nth(1).fill('Мария');
  await page.getByLabel('Фамилия').nth(1).fill('Митовска');
  await next(page);

  // Step 4 — one paternal grandparent.
  await page.getByLabel('Собствено име').first().fill('Георги');
  await page.getByLabel('Фамилия').first().fill('Митовски');
  await next(page);

  // Steps 5-6 — skippable.
  await page.getByRole('button', { name: 'Пропусни тази стъпка' }).click();
  await page.getByRole('button', { name: 'Пропусни тази стъпка' }).click();

  // Step 7 — consent + Turnstile (official test key auto-passes) + submit.
  await page.getByRole('button', { name: /Изпрати|Изпращане/ }).click();

  await expect(page.getByText(/Благодарим|получена|референт/i)).toBeVisible({ timeout: 15_000 });

  // §23.2 — assert the submission is pending (via the admin API).
  await loginAsAdmin(page);
  const { items } = await adminGet<{ items: SubmissionListItem[] }>(page, '/api/admin/submissions?status=pending');
  expect(items.some((s) => s.participantName === PARTICIPANT)).toBeTruthy();
});
