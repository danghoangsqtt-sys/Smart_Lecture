import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

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

test('teacher can open Teaching Mode and minimize the persistent game dock', async ({ page, request }) => {
  const adminLogin = await request.post('/api/auth/login', { data: { username: 'admin', password: 'Admin@123456' } });
  const adminToken = (await adminLogin.json() as { token: string }).token;
  const teacher = await request.post('/api/users', { headers: { Authorization: `Bearer ${adminToken}` }, data: { username: 'browser.teacher', password: 'Teacher@123', role: 'teacher', displayName: 'Browser Teacher' } });
  expect(teacher.ok()).toBeTruthy();
  const teacherLogin = await request.post('/api/auth/login', { data: { username: 'browser.teacher', password: 'Teacher@123' } });
  const teacherToken = (await teacherLogin.json() as { token: string }).token;
  await request.post('/api/auth/change-password', { headers: { Authorization: `Bearer ${teacherToken}` }, data: { oldPassword: 'Teacher@123', newPassword: 'Teacher@1234' } });
  const created = await request.post('/api/classes', { headers: { Authorization: `Bearer ${teacherToken}` }, data: { name: 'Browser Class', subject: 'Browser Subject', academicYear: '2026-2027' } });
  const classId = (await created.json() as { class: { id: string } }).class.id;
  const subjects = await request.get(`/api/classes/${classId}/subjects`, { headers: { Authorization: `Bearer ${teacherToken}` } });
  const subjectId = (await subjects.json() as { subjects: Array<{ id: string }> }).subjects[0]!.id;
  const lecture = await request.post(`/api/classes/${classId}/lectures`, { headers: { Authorization: `Bearer ${teacherToken}` }, data: { chapter: 'Browser', title: 'Browser PPTX', description: '', subjectId } });
  const lectureId = (await lecture.json() as { id: string }).id;
  const plan = await request.post(`/api/classes/${classId}/teaching-plans`, { headers: { Authorization: `Bearer ${teacherToken}` }, data: { name: 'Browser plan', description: '', subjectId } });
  const planId = (await plan.json() as { id: string }).id;
  const item = await request.post(`/api/teaching-plans/${planId}/items`, { headers: { Authorization: `Bearer ${teacherToken}` }, data: { week: 1, chapter: 'Browser', topic: 'PPTX fallback', plannedPeriods: 1, lectureId } });
  expect(item.ok()).toBeTruthy();
  const pptx = await request.post(`/api/lectures/${lectureId}/materials`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
    multipart: { file: { name: 'browser-slides.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: Buffer.from('not a real PowerPoint') } },
  });
  expect(pptx.ok()).toBeTruthy();

  await page.goto('/login');
  await page.locator('#username').fill('browser.teacher');
  await page.locator('#password').fill('Teacher@1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.goto('/teaching');
  await expect(page.getByText(/Sẵn sàng trước giờ dạy/)).toBeVisible();
  await expect(page.getByRole('button', { name: /XLSX/ })).toBeVisible();
  const reportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /XLSX/ }).click();
  expect((await reportDownload).suggestedFilename()).toContain('.xlsx');
  await page.goto(`/classes/${classId}/teach/${subjectId}`);
  await expect(page.getByRole('button', { name: 'Chuyển sang PDF' })).toBeVisible();
  await page.getByRole('button', { name: /Mở.*Game/ }).click();
  await expect(page.getByText(/Game đang chuẩn bị/)).toBeVisible();
  await page.getByTitle('Hạ game xuống').click();
  await expect(page.getByText(/Game đang chuẩn bị/)).toBeVisible();
});
