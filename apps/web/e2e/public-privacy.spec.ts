import { test, expect } from '@playwright/test';
import { loginAsAdmin, adminPost } from './helpers';

// idea.md §23.8: the public tree masks living members and the public search
// cannot find a living person by name.

test('public tree masks living members', async ({ page }) => {
  await loginAsAdmin(page);

  const grandfather = await adminPost<{ id: string }>(page, '/api/admin/people', { firstName: 'Дядо', surname: 'Публичен', livingStatus: 'deceased', privacyLevel: 'public' });
  const living = await adminPost<{ id: string }>(page, '/api/admin/people', { firstName: 'Живко', surname: 'Публичен', livingStatus: 'living', privacyLevel: 'public' });
  // Living person is a child of the (public, deceased) grandfather.
  await adminPost(page, '/api/admin/relationships', { parentId: grandfather.id, childId: living.id, verificationStatus: 'confirmed' });

  // Sign out of the admin session so the tree is fetched as the public view.
  await page.request.post('/api/auth/signout', { form: { csrfToken: (await (await page.request.get('/api/auth/csrf')).json()).csrfToken } });

  await page.goto(`/tree?root=${grandfather.id}`);

  await expect(page.getByText('Дядо Публичен')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Жив член на семейството')).toBeVisible();
  await expect(page.getByText('Живко')).toHaveCount(0);
});

test('public search cannot find a living person', async ({ page }) => {
  await loginAsAdmin(page);
  await adminPost(page, '/api/admin/people', { firstName: 'Тайна', surname: 'Жива', livingStatus: 'living', privacyLevel: 'public' });

  const res = await page.request.get('/api/tree/search?q=Жива');
  const body = (await res.json()) as { items: { label: string }[] };
  expect(body.items.some((i) => i.label.includes('Тайна'))).toBeFalsy();
});
