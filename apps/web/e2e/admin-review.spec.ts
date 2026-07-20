import { test, expect } from '@playwright/test';
import { loginAsAdmin, adminGet, adminPost, submitQuestionnaire, type SubmissionListItem } from './helpers';

// idea.md §23 steps 3-6: admin reviews a pending submission, resolves the people
// (create SELF + FATHER, link MOTHER to a pre-seeded person), confirms the two
// parent edges, and marks the submission processed.

test('admin resolves a submission end to end', async ({ page }) => {
  await loginAsAdmin(page);

  // Pre-seed the canonical MOTHER so it can be linked.
  await adminPost(page, '/api/admin/people', { firstName: 'Мария', surname: 'Митовска', livingStatus: 'deceased', privacyLevel: 'family' });

  const participant = `Е2Е Ревю ${Date.now()}`;
  await submitQuestionnaire(page, participant);

  const { items } = await adminGet<{ items: SubmissionListItem[] }>(page, '/api/admin/submissions?status=pending');
  const submission = items.find((s) => s.participantName === participant);
  expect(submission, 'pending submission present').toBeTruthy();

  await page.goto(`/admin/submissions/${submission!.id}`);
  await page.getByRole('button', { name: 'Започни преглед' }).click();

  // Резолюция tab (default for in_review).
  await page.getByRole('tab', { name: 'Резолюция' }).click();

  // SELF + FATHER → create new person.
  const createButtons = page.getByRole('button', { name: 'Създай нов човек' });
  await createButtons.first().click();
  await page.getByRole('button', { name: 'Създай' }).click();
  await expect(page.getByText('Създаден нов човек')).toBeVisible();

  // Link MOTHER to the pre-seeded person via the person picker.
  await page.getByRole('button', { name: 'Свържи със съществуващ' }).first().click();
  await page.getByLabel('Търсене на човек').first().fill('Мария');
  await page.getByRole('button', { name: /Мария/ }).first().click();
  await expect(page.getByText('Свързан със съществуващ човек')).toBeVisible();

  // Confirm the suggested parent edges.
  await page.getByRole('tab', { name: 'Връзки' }).click();
  for (const btn of await page.getByRole('button', { name: 'Потвърди' }).all()) {
    await btn.click();
  }

  // Complete.
  await page.getByRole('button', { name: 'Маркирай като обработена' }).click();

  await expect
    .poll(async () => (await adminGet<{ status: string }>(page, `/api/admin/submissions/${submission!.id}`)).status)
    .toBe('processed');
});
