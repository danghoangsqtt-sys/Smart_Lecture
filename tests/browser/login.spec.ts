import { expect, test } from '@playwright/test';

test('admin can change the initial password and log in through the browser', async ({ page, request }) => {
  const firstLogin = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
  expect(firstLogin.ok()).toBeTruthy();
  const firstToken = (await firstLogin.json() as { token: string }).token;
  const changed = await request.post('/api/auth/change-password', {
    headers: { Authorization: `Bearer ${firstToken}` },
    data: { oldPassword: 'admin123', newPassword: 'Admin@123456' },
  });
  expect(changed.ok()).toBeTruthy();

  await page.goto('/login');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('Admin@123456');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('SmartLecture').first()).toBeVisible();
});
