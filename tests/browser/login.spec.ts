import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

function createPdfFixture(): Buffer {
  const stream = 'BT /F1 24 Tf 72 720 Td (SmartLecture PDF fixture) Tj ET';
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) { offsets.push(Buffer.byteLength(pdf)); pdf += object; }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

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
  const pdf = await request.post(`/api/lectures/${lectureId}/materials`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
    multipart: { file: { name: 'browser-slides.pdf', mimeType: 'application/pdf', buffer: createPdfFixture() } },
  });
  expect(pdf.ok()).toBeTruthy();
  const video = await request.post(`/api/lectures/${lectureId}/materials`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
    multipart: { file: { name: 'browser-video.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video-fixture') } },
  });
  expect(video.ok()).toBeTruthy();

  await page.goto('/login');
  await page.locator('#username').fill('browser.teacher');
  await page.locator('#password').fill('Teacher@1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/teaching');
  await expect(page.getByText(/Sẵn sàng trước giờ dạy/)).toBeVisible();
  await expect(page.getByRole('button', { name: /XLSX/ })).toBeVisible();
  const reportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /XLSX/ }).click();
  expect((await reportDownload).suggestedFilename()).toContain('.xlsx');
  await page.goto(`/classes/${classId}/teach/${subjectId}`);
  await expect(page.getByRole('button', { name: 'Chuyển sang PDF' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tia laser' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Highlight' })).toBeVisible();
  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Tia laser' })).toHaveClass(/bg-rose-600/);
  await page.keyboard.press('h');
  await expect(page.getByRole('button', { name: 'Highlight', exact: true })).toHaveClass(/bg-yellow-300/);
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Bút lông' })).toHaveClass(/bg-blue-600/);
  await page.getByRole('button', { name: 'Bút lông' }).click();
  await page.getByRole('button', { name: 'Màu xanh dương' }).click();
  const annotationSurface = page.locator('main svg');
  await expect(annotationSurface).toBeVisible();
  const surfaceBox = await annotationSurface.boundingBox();
  expect(surfaceBox).not.toBeNull();
  await page.mouse.move(surfaceBox!.x + 40, surfaceBox!.y + 40);
  await page.mouse.down();
  await page.mouse.move(surfaceBox!.x + 140, surfaceBox!.y + 90);
  await page.mouse.up();
  await expect(annotationSurface.locator('polyline')).toHaveCount(1);
  await page.getByRole('button', { name: /Mở.*Video/ }).click();
  const videoDock = page.getByLabel('Trình phát video nổi');
  await expect(videoDock.locator('video')).toBeVisible();
  await videoDock.getByRole('button', { name: 'Thu nhỏ video' }).click();
  await expect(videoDock.locator('video')).toBeAttached();
  const videoHandle = page.getByLabel('Kéo khung video');
  const initialVideoBox = await videoHandle.boundingBox();
  expect(initialVideoBox).not.toBeNull();
  await page.mouse.move(initialVideoBox!.x + 100, initialVideoBox!.y + 20);
  await page.mouse.down();
  await page.mouse.move(initialVideoBox!.x + 180, initialVideoBox!.y + 70);
  await page.mouse.up();
  await expect.poll(async () => (await videoHandle.boundingBox())?.x ?? 0).toBeGreaterThan(initialVideoBox!.x + 50);
  await page.getByRole('button', { name: /Mở.*Game/ }).click();
  await expect(page.getByText(/Game đang chuẩn bị/)).toBeVisible();
  await page.getByTitle('Hạ game xuống').click();
  await expect(page.getByText(/Game đang chuẩn bị/)).toBeVisible();
  const gameHandle = page.getByLabel('Kéo khung game');
  const initialGameBox = await gameHandle.boundingBox();
  expect(initialGameBox).not.toBeNull();
  await page.mouse.move(initialGameBox!.x + 100, initialGameBox!.y + 20);
  await page.mouse.down();
  await page.mouse.move(initialGameBox!.x + 160, initialGameBox!.y + 60);
  await page.mouse.up();
  await expect.poll(async () => (await gameHandle.boundingBox())?.x ?? 0).toBeGreaterThan(initialGameBox!.x + 35);
  await page.reload();
  await expect(page.getByText(/Game đang chuẩn bị/)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Trình phát video nổi').locator('video')).toBeAttached();
  await expect.poll(async () => (await page.getByLabel('Kéo khung video').boundingBox())?.x ?? 0).toBeGreaterThan(initialVideoBox!.x + 50);
  await expect.poll(async () => (await page.getByLabel('Kéo khung game').boundingBox())?.x ?? 0).toBeGreaterThan(initialGameBox!.x + 35);
  await expect(page.getByRole('button', { name: 'Màu xanh dương' })).toHaveClass(/border-white/);
  await expect(page.locator('main svg polyline')).toHaveCount(1);
  await expect(page.locator('main svg polyline')).toHaveAttribute('stroke', '#2563eb');
  await page.getByRole('button', { name: 'Tẩy từng nét' }).click();
  const restoredSurface = page.locator('main svg');
  const restoredStroke = restoredSurface.locator('polyline');
  const restoredStrokeBox = await restoredStroke.boundingBox();
  expect(restoredStrokeBox).not.toBeNull();
  await page.mouse.click(restoredStrokeBox!.x + restoredStrokeBox!.width / 2, restoredStrokeBox!.y + restoredStrokeBox!.height / 2);
  await expect(restoredSurface.locator('polyline')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(restoredSurface.locator('polyline')).toHaveCount(1);
  await page.getByRole('button', { name: 'Làm lại', exact: true }).click();
  await expect(restoredSurface.locator('polyline')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(restoredSurface.locator('polyline')).toHaveCount(1);
  await page.getByRole('button', { name: 'Xóa nét trang hiện tại', exact: true }).click();
  await expect(restoredSurface.locator('polyline')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(restoredSurface.locator('polyline')).toHaveCount(1);
  await page.getByRole('button', { name: 'Làm lại', exact: true }).click();
  await expect(restoredSurface.locator('polyline')).toHaveCount(0);
});
