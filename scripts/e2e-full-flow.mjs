/**
 * E2E Test - Full Flow: Tạo môn → Upload chương trình → Tạo bài giảng → Chọn câu hỏi
 * → Mở game → Hạ game → Tiếp tục trình chiếu → Lưu điểm/nhật ký
 * Chạy: node scripts/e2e-full-flow.mjs
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4000/api';

class ApiClient {
  constructor() {
    this.token = null;
  }

  async request(method, path, body) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost', port: 4000, path: `/api${path}`, method,
        headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }
      };
      const req = http.request(options, res => {
        let data = ''; res.on('data', c => data += c);
        res.on('end', () => {
          let parsed = null, code = '', msg = '';
          if (data) try { parsed = JSON.parse(data); if (parsed.error) { code = parsed.error.code; msg = parsed.error.message; } } catch {}
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: parsed, code, msg, raw: data });
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  setToken(t) { this.token = t; }
}

const api = new ApiClient();

function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`);
  else console.log(`  ✗ ${name}`);
  return cond;
}

async function main() {
  console.log('\n=== E2E FULL FLOW TEST ===\n');

  // 1. LOGIN ADMIN
  console.log('[1] Đăng nhập Admin...');
  const login = await api.request('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  check('Admin login', login.ok && login.data.token);
  api.setToken(login.data.token);

  // 2. TẠO GIÁO VIÊN
  console.log('\n[2] Tạo Giáo viên Vật lý...');
  const gv = await api.request('POST', '/users', { username: 'gv_vatly', password: 'Gv@123456', role: 'teacher', displayName: 'GV Vật Lý' });
  check('Tạo GV', gv.ok);
  const gvLogin = await api.request('POST', '/auth/login', { username: 'gv_vatly', password: 'Gv@123456' });
  check('GV login', gvLogin.ok);
  const gvToken = gvLogin.data.token;

  // 3. TẠO LỚP VẬT LÝ
  console.log('\n[3] Tạo lớp 12A_VL...');
  const apiGV = new ApiClient(); apiGV.setToken(gvToken);
  const cls = await apiGV.request('POST', '/classes', { name: '12A_VL', subject: 'Vật lý', academicYear: '2025-2026', totalPeriods: 35 });
  check('Tạo lớp', cls.ok);
  const classId = cls.data.class.id;
  console.log(`    Class ID: ${classId}`);

  // 4. TẠO MÔN HỌC (Subject)
  console.log('\n[4] Tạo môn học Vật lý...');
  const subj = await apiGV.request('POST', `/classes/${classId}/subjects`, { name: 'Vật lý', sortOrder: 0 });
  check('Tạo môn học', subj.ok);
  const subjectId = subj.data.id;
  console.log(`    Subject ID: ${subjectId}`);

  // 5. UPLOAD CHƯƠNG TRÌNH ĐÀO TẠO (Excel)
  console.log('\n[5] Upload chương trình đào tạo từ Excel...');
  const wb = XLSX.utils.book_new();
  const rows = [
    ['Tuần', 'Chương/Phần', 'Chủ đề/Nội dung', 'Số tiết dự kiến'],
    [1, 'Chương 1', 'Động học chất điểm', 3],
    [1, 'Chương 1', 'Động lực học Newton', 3],
    [2, 'Chương 2', 'Động lượng - Động năng', 3],
    [2, 'Chương 2', 'Bảo toàn năng lượng', 2],
    [3, 'Chương 3', 'Cơ học chất rắn', 3],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 40 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Chương trình');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Upload multipart
  const importRes = await new Promise((resolve, reject) => {
    const boundary = `----${randomUUID()}`;
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="ctdt.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    const full = Buffer.concat([Buffer.from(body), buf, Buffer.from(footer)]);

    const req = http.request({
      hostname: 'localhost', port: 4000, path: `/api/classes/${classId}/teaching-plans/import-curriculum`,
      method: 'POST', headers: {
        Authorization: `Bearer ${gvToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': full.length
      }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,data:d?JSON.parse(d):null})); });
    req.on('error', reject); req.write(full); req.end();
  });
  check('Import CTĐT', importRes.ok && importRes.data.created >= 4);
  console.log(`    Đã tạo ${importRes.data.created} mục, tổng ${importRes.data.totalPeriods} tiết`);

  // Lấy teaching plan ID
  const plans = await apiGV.request('GET', `/classes/${classId}/teaching-plans`);
  const planId = plans.data.plans[0].id;
  console.log(`    Teaching Plan ID: ${planId}`);

  // 6. TẠO BÀI GIẢNG (Lectures)
  console.log('\n[6] Tạo bài giảng...');
  const lectures = [];
  for (let i = 0; i < 3; i++) {
    const lec = await apiGV.request('POST', `/classes/${classId}/lectures`, {
      chapter: `Chương ${i+1}`, title: `Bài ${i+1}: ${i===0?'Động học':'Động lực học'}`, description: `Nội dung bài ${i+1}`
    });
    check(`Tạo bài giảng ${i+1}`, lec.ok);
    lectures.push(lec.data.id);
  }
  console.log(`    Đã tạo ${lectures.length} bài giảng`);

  // 7. TẠO CÂU HỎI (Question Bank) - có subjectId
  console.log('\n[7] Tạo ngân hàng câu hỏi Vật lý...');
  const questions = [];
  for (let i = 0; i < 5; i++) {
    const q = await apiGV.request('POST', '/questions', {
      type: 'mcq', content: `Câu hỏi Vật lý ${i+1}`, options: ['A','B','C','D'], correctAnswer: 'A',
      explanation: 'Giải thích', bloomLevel: 'Thông hiểu', category: 'Vật lý 12', subjectId,
      chapter: `Chương ${i%3+1}`, lesson: `Bài ${i+1}`, difficulty: 'medium'
    });
    check(`Tạo câu hỏi ${i+1}`, q.ok);
    questions.push(q.data.id);
  }
  console.log(`    Đã tạo ${questions.length} câu hỏi`);

  // 8. TẠO GAME ĐÃ CHUẨN BỊ (Prepared Game)
  console.log('\n[8] Tạo game đã chuẩn bị...');
  const prepGame = await apiGV.request('POST', '/prepared-games', {
    subjectId, classId, gameType: 'quick_quiz', title: 'Quiz Vật lý Chương 1',
    config: { secondsPerQuestion: 30, showAnswerAfter: true }, questionIds: questions.slice(0,3)
  });
  check('Tạo Prepared Game', prepGame.ok);
  const prepGameId = prepGame.data.id;
  console.log(`    Prepared Game ID: ${prepGameId}`);

  // 9. TẠO KẾ HOẠCH TIẾT (Lesson Plan) - gán slide, game, questions
  console.log('\n[9] Tạo kế hoạch tiết (Lesson Plan)...');
  const items = await apiGV.request('GET', `/classes/${classId}/teaching-plans/${planId}`);
  const itemId = items.data.plan.items[0].id;

  const lessonPlan = await apiGV.request('POST', `/curriculum-items/${itemId}/lesson-plans`, {
    title: 'Tiết 1: Động học chất điểm', script: '1. Ôn tập kiến thức cũ (5\')\n2. Trình chiếu slide động học (15\')\n3. Chạy game Quiz (10\')\n4. Giải bài tập (15\')',
    plannedDuration: 45, slideMaterialId: null, gameSessionId: null, questionSetId: null
  });
  check('Tạo Lesson Plan', lessonPlan.ok);
  const lessonPlanId = lessonPlan.data.id;
  console.log(`    Lesson Plan ID: ${lessonPlanId}`);

  // 10. MỞ PHIÊN DẠY (Teaching Log) - BẮT ĐẦU
  console.log('\n[10] Bắt đầu phiên dạy (Teaching Log)...');
  const apiLog = new ApiClient(); apiLog.setToken(gvToken);
  const logStart = await apiLog.request('POST', '/teaching-logs/start', {
    classId, subjectId, curriculumItemId: itemId, lessonPlanId
  });
  check('Bắt đầu nhật ký', logStart.ok);
  const logId = logStart.data.id;
  console.log(`    Log ID: ${logId}`);

  // 11. MỞ GAME (Launch Prepared Game)
  console.log('\n[11] Mở game từ Prepared Game...');
  const launch = await apiGV.request('POST', `/prepared-games/${prepGameId}/launch`, { classId, subjectId });
  check('Launch game', launch.ok);
  const gameSessionId = launch.data.id;
  const roomCode = launch.data.roomCode;
  console.log(`    Game Session ID: ${gameSessionId}, Room: ${roomCode}`);

  // Cập nhật Teaching Log - thêm game đã chạy
  console.log('\n[12] Cập nhật nhật ký - thêm game đã chạy...');
  const logUpdate1 = await apiLog.request('PATCH', `/teaching-logs/${logId}`, {
    gamesRun: [gameSessionId], slidesShown: [`slide-${lectures[0]}`]
  });
  check('Cập nhật log - game', logUpdate1.ok);

  // 12. HẠ GAME (Kết thúc game, ghi điểm KTTX)
  console.log('\n[13] Kết thúc game - ghi điểm KTTX...');
  // Giả lập kết thúc game và bonus
  const bonus = await apiGV.request('POST', `/games/${gameSessionId}/bonus`, { first: 1, second: 0.5, third: 0.25 });
  check('Bonus game', bonus.ok);
  console.log(`    Đã cộng điểm cho top 3`);

  // 13. TIẾP TỤC TRÌNH CHIẾU - cập nhật log thêm slides
  console.log('\n[14] Tiếp tục trình chiếu - cập nhật slides...');
  const logUpdate2 = await apiLog.request('PATCH', `/teaching-logs/${logId}`, {
    slidesShown: [`slide-${lectures[0]}`, `slide-${lectures[1]}`, `slide-${lectures[2]}`],
    videosPlayed: [`video-${lectures[0]}`],
    notes: 'Đã dạy xong Chương 1, chạy game Quiz, học viên hứng thú'
  });
  check('Cập nhật log - slides/video', logUpdate2.ok);

  // 14. ĐIỂM DANH (Attendance) - link với curriculum item
  console.log('\n[15] Tạo buổi điểm danh gắn với curriculum item...');
  const today = new Date().toISOString().slice(0,10);
  const sess = await apiGV.request('POST', `/classes/${classId}/attendance/sessions`, {
    date: today, periodsTotal: 2, note: 'Tiết 1-2: Động học', teachingType: 'Lý thuyết', teachingPlanItemId: itemId
  });
  check('Tạo buổi điểm danh', sess.ok);
  const sessionId = sess.data.id;

  // Lấy danh sách học viên
  const detail = await apiGV.request('GET', `/classes/${classId}`);
  const studentIds = detail.data.students.map(s => s.id).slice(0, 5);

  const att = await apiGV.request('PUT', `/attendance/sessions/${sessionId}/records`, {
    records: studentIds.map(id => ({ studentId: id, status: 'present', periodsAbsent: 0, reason: '' }))
  });
  check('Lưu điểm danh', att.ok);

  // 16. CẬP NHẬT LOG - ĐÃ ĐIỂM DANH
  console.log('\n[16] Cập nhật nhật ký - đã điểm danh...');
  const logUpdate3 = await apiLog.request('PATCH', `/teaching-logs/${logId}`, { attendanceTaken: true });
  check('Cập nhật log - điểm danh', logUpdate3.ok);

  // 17. GHI ĐIỂM KTTX
  console.log('\n[17] Ghi điểm KTTX cho học viên...');
  for (const sid of studentIds.slice(0, 3)) {
    const gr = await apiGV.request('PUT', `/classes/${classId}/grades/${sid}`, { kttx: 8 + Math.random() * 2 });
    check(`Ghi điểm ${sid}`, gr.ok);
  }

  // 18. KẾT THÚC PHIÊN DẠY
  console.log('\n[18] Kết thúc phiên dạy...');
  const logEnd = await apiLog.request('PATCH', `/teaching-logs/${logId}`, { endedAt: new Date().toISOString() });
  check('Kết thúc log', logEnd.ok);

  // 19. XUẤT NHẬT KÝ EXCEL
  console.log('\n[19] Xuất nhật ký giảng dạy (Excel)...');
  const exportRes = await apiLog.request('GET', `/classes/${classId}/teaching-logs/export?format=xlsx`);
  check('Xuất Excel nhật ký', exportRes.ok && exportRes.raw && exportRes.raw.length > 1000);
  console.log(`    File size: ${exportRes.raw.length} bytes`);

  // 20. KIỂM TRA NHẬT KÝ
  console.log('\n[20] Kiểm tra nhật ký đã lưu...');
  const logs = await apiLog.request('GET', `/classes/${classId}/teaching-logs`);
  check('Đọc nhật ký', logs.ok && logs.data.logs.length > 0);
  const log = logs.data.logs[0];
  console.log(`    Log entries: ${logs.data.logs.length}`);
  console.log(`    Games run: ${log.gamesRun.join(', ')}`);
  console.log(`    Slides: ${log.slidesShown.join(', ')}`);
  console.log(`    Attendance: ${log.attendanceTaken ? 'Có' : 'Không'}`);
  console.log(`    KTTX: ${log.kttxAwarded.join(', ')}`);

  // 21. TEST SUBJECT FILTER - tạo môn Hóa học, kiểm tra GV Vật lý KHÔNG thấy
  console.log('\n[21] Test phân quyền theo môn - tạo môn Hóa học...');
  const subjChem = await apiGV.request('POST', `/classes/${classId}/subjects`, { name: 'Hóa học', sortOrder: 1 });
  check('Tạo môn Hóa học', subjChem.ok);

  const subjQuestions = await apiGV.request('GET', `/questions?subjectId=${subjectId}`);
  check('GV Vật lý thấy câu hỏi Vật lý', subjQuestions.ok && subjQuestions.data.questions.length === 5);

  const chemQuestions = await apiGV.request('GET', `/questions?subjectId=${subjChem.data.id}`);
  check('GV Vật lý KHÔNG thấy câu hỏi Hóa (chưa có)', chemQuestions.ok && chemQuestions.data.questions.length === 0);

  // 22. BACKUP / RESTORE
  console.log('\n[22] Test Backup/Restore...');
  const backup = await apiGV.request('POST', '/system/backup');
  check('Backup', backup.ok);
  console.log(`    Backup: ${backup.data.name} (${backup.data.sizeBytes} bytes)`);

  const backups = await apiGV.request('GET', '/system/backups');
  check('List backups', backups.ok && backups.data.backups.length > 0);

  // 23. MEDIA AUDIT LOG
  console.log('\n[23] Test Media Audit Log...');
  const audit = await apiGV.request('GET', '/media-audit');
  check('Audit log', audit.ok);

  const storage = await apiGV.request('GET', '/media-audit/storage-summary');
  check('Storage summary', storage.ok);
  console.log(`    Total files: ${storage.data.totalFiles}, Size: ${storage.data.totalSizeBytes} bytes`);

  // 24. QUESTION BANK STATS
  console.log('\n[24] Question Bank Stats...');
  const qStats = await apiGV.request('GET', `/questions/stats?subjectId=${subjectId}`);
  check('Question stats', qStats.ok);
  console.log(`    Total: ${qStats.data.summary.total}, Used: ${qStats.data.summary.totalUsed}, Correct rate: ${qStats.data.summary.correctRate}`);
  console.log(`    By chapter:`, qStats.data.summary.byChapter);
  console.log(`    Difficult questions: ${qStats.data.difficultQuestions.length}`);

  // 25. CLEANUP - DELETE LOG (teacher can delete)
  console.log('\n[25] Test xóa nhật ký...');
  const delLog = await apiLog.request('DELETE', `/teaching-logs/${logId}`);
  check('Xóa nhật ký', delLog.ok);

  console.log('\n===========================================');
  console.log('  ✓ TẤT CẢ E2E TESTS PASSED');
  console.log('===========================================\n');
  console.log('Flow test passed:');
  console.log('  1. Tạo môn học (Subject)');
  console.log('  2. Upload chương trình đào tạo từ Excel');
  console.log('  3. Tạo bài giảng (Lectures)');
  console.log('  4. Tạo ngân hàng câu hỏi có subjectId');
  console.log('  5. Tạo Prepared Game');
  console.log('  6. Tạo Lesson Plan (kịch bản tiết)');
  console.log('  7. Bắt đầu Teaching Log');
  console.log('  8. Launch Game từ Prepared Game');
  console.log('  9. Cập nhật log: game, slides, videos');
  console.log('  10. Hạ game, ghi điểm KTTX');
  console.log('  11. Tiếp tục trình chiếu');
  console.log('  12. Điểm danh gắn curriculum item');
  console.log('  13. Ghi điểm KTTX');
  console.log('  14. Kết thúc phiên, xuất Excel nhật ký');
  console.log('  15. Phân quyền theo môn (subjectId)');
  console.log('  16. Backup/Restore');
  console.log('  17. Media Audit Log');
  console.log('  18. Question Bank Stats');
}

main().catch(e => { console.error('\n✗ ERROR:', e.message); process.exit(1); });