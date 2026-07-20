import { test, expect } from '@playwright/test';
import { loginAsAdmin, adminPost } from './helpers';

// idea.md §23.7: the admin tree rooted at SELF shows the parents branch.

test('admin tree shows the parents branch', async ({ page }) => {
  await loginAsAdmin(page);

  const self = await adminPost<{ id: string }>(page, '/api/admin/people', { firstName: 'Иван', surname: 'Дървесен', livingStatus: 'deceased', privacyLevel: 'family' });
  const father = await adminPost<{ id: string }>(page, '/api/admin/people', { firstName: 'Петър', surname: 'Дървесен', livingStatus: 'deceased', privacyLevel: 'public' });
  const mother = await adminPost<{ id: string }>(page, '/api/admin/people', { firstName: 'Мария', surname: 'Дървесна', livingStatus: 'deceased', privacyLevel: 'public' });

  await adminPost(page, '/api/admin/relationships', { parentId: father.id, childId: self.id, verificationStatus: 'confirmed' });
  await adminPost(page, '/api/admin/relationships', { parentId: mother.id, childId: self.id, verificationStatus: 'confirmed' });

  await page.goto(`/admin/tree?root=${self.id}`);

  await expect(page.getByText('Петър Дървесен')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Мария Дървесна')).toBeVisible();
});
