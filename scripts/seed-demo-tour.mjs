/**
 * Standalone, throwaway demo + smoke-test dataset for a product walkthrough.
 * Mirrors the user's real class ("DH31A — Điện tử số") without touching real data.
 * Creates a broad account/question/game surface and reports which game types
 * failed to create, so it doubles as a quick "does every game type still work"
 * regression check beyond what the isolated E2E suite already covers.
 * Usage: BASE=http://127.0.0.1:PORT node scripts/seed-demo-tour.mjs
 */
const base = process.env.BASE ?? 'http://127.0.0.1:4800';
let failures = 0;

async function api(method, path, token, body) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) { console.error(`  ! ${method} ${path} -> ${res.status}`, data); failures++; }
  return data;
}
async function login(username, password) {
  const r = await api('POST', '/auth/login', null, { username, password });
  return r?.token ?? '';
}

console.log('Seeding demo tour + smoke-test dataset...');

// --- Accounts ---
const firstAdmin = await login('admin', 'admin123');
await api('POST', '/auth/change-password', firstAdmin, { oldPassword: 'admin123', newPassword: 'Admin@Demo2026' });
const admin = await login('admin', 'Admin@Demo2026');

await api('POST', '/users', admin, { username: 'gv.tuan', password: 'GvTuan@2026', role: 'teacher', displayName: 'Thầy Tuấn' }).catch(() => {});
const firstTeacher = await login('gv.tuan', 'GvTuan@2026');
await api('POST', '/auth/change-password', firstTeacher, { oldPassword: 'GvTuan@2026', newPassword: 'Tuan@Demo2026' });
const teacher = await login('gv.tuan', 'Tuan@Demo2026');

await api('POST', '/users', admin, { username: 'gv.mai', password: 'GvMai@2026', role: 'teacher', displayName: 'Cô Mai' }).catch(() => {});
const firstTeacher2 = await login('gv.mai', 'GvMai@2026');
await api('POST', '/auth/change-password', firstTeacher2, { oldPassword: 'GvMai@2026', newPassword: 'Mai@Demo2026' });
const teacher2 = await login('gv.mai', 'Mai@Demo2026');
console.log('  2 teachers ready: gv.tuan / Tuan@Demo2026, gv.mai / Mai@Demo2026');

const cls = await api('POST', '/classes', teacher, { name: 'DH31A', subject: 'Điện tử số', academicYear: '2026-2027' });
const classId = cls.class?.id;

const students = [
  { username: 'sv.anhnt', password: 'Sv@Demo123', displayName: 'Nguyễn Thị Anh' },
  { username: 'sv.binhvh', password: 'Sv@Demo123', displayName: 'Vũ Hoàng Bình' },
  { username: 'sv.chinhld', password: 'Sv@Demo123', displayName: 'Lê Đức Chính' },
  { username: 'sv.dungth', password: 'Sv@Demo123', displayName: 'Trần Hải Dũng' },
  { username: 'sv.emtv', password: 'Sv@Demo123', displayName: 'Trịnh Văn Em' },
  { username: 'sv.giangnh', password: 'Sv@Demo123', displayName: 'Nguyễn Hoài Giang' },
];
for (const [index, s] of students.entries()) await api('POST', '/users', teacher, { ...s, role: 'student', studentCode: `DEMO-${String(index + 1).padStart(3, '0')}`, classId }).catch(() => {});
const studentsRes = await api('GET', '/users?role=student', teacher);
const studentIds = (studentsRes.users ?? []).filter((u) => u.username.startsWith('sv.')).map((u) => u.id);
await api('POST', `/classes/${classId}/enroll`, teacher, { studentIds });
console.log(`  class DH31A ready: ${studentIds.length} students enrolled`);

const lecture = await api('POST', `/classes/${classId}/lectures`, teacher, { chapter: 'Chương 1', title: 'Cổng logic cơ bản', description: 'Giới thiệu cổng AND, OR, NOT và IC 7400.' });
console.log('  lecture ready:', lecture?.id ? 'Cổng logic cơ bản' : '(failed)');

// --- Questions: mixed type, mixed Bloom level ---
const mcqSpecs = [
  ['Cổng AND cho kết quả 1 khi nào?', 'A. Cả hai đầu vào đều là 1', 'B. Một trong hai đầu vào là 1', 'C. Cả hai đầu vào đều là 0', 'D. Không bao giờ', 'A', 'Nhận biết'],
  ['IC 7400 chứa loại cổng logic nào?', 'A. NAND', 'B. NOR', 'C. XOR', 'D. AND', 'A', 'Nhận biết'],
  ['Half Adder có bao nhiêu đầu ra?', 'A. 2 (Sum và Carry)', 'B. 1', 'C. 3', 'D. 4', 'A', 'Thông hiểu'],
  ['D Flip-Flop chốt dữ liệu tại thời điểm nào?', 'A. Cạnh lên xung Clock', 'B. Bất kỳ lúc nào', 'C. Khi Data = 0', 'D. Khi Reset = 1', 'A', 'Thông hiểu'],
  ['Bảng chân trị cổng XOR: A=1, B=1 thì Y bằng?', 'A. 0', 'B. 1', 'C. Không xác định', 'D. Tùy IC', 'A', 'Vận dụng'],
  ['Mạch Full Adder xử lý được mấy bit đầu vào?', 'A. 3 (A, B, Cin)', 'B. 2', 'C. 1', 'D. 4', 'A', 'Vận dụng'],
];
const qIds = [];
for (const [content, a, b, c, d, correct, bloom] of mcqSpecs) {
  const q = await api('POST', '/questions', teacher, {
    type: 'mcq', content, options: [a, b, c, d], correctAnswer: correct,
    explanation: '', bloomLevel: bloom, category: 'Điện tử số', folderId: null,
  });
  if (q?.question?.id) qIds.push(q.question.id);
}
const fillQ = await api('POST', '/questions', teacher, {
  type: 'fill', content: 'Đơn vị đo điện trở là ___', correctAnswer: 'ohm',
  explanation: '', bloomLevel: 'Nhận biết', category: 'Điện tử số', folderId: null,
});
const essayQ = await api('POST', '/questions', teacher, {
  type: 'essay', content: 'Trình bày nguyên lý hoạt động của D Flip-Flop.', correctAnswer: 'Chốt giá trị D tại cạnh lên của Clock, giữ nguyên đến cạnh lên kế tiếp.',
  explanation: '', bloomLevel: 'Vận dụng cao', category: 'Điện tử số', folderId: null,
});
console.log(`  ${qIds.length} mcq + 1 fill + 1 essay questions ready`);

// --- Exam ---
const exam = await api('POST', '/exams', teacher, {
  title: 'Kiểm tra 15 phút — Cổng logic', durationMin: 15, questionIds: qIds.slice(0, 4),
  config: { class_id: classId, purpose: 'online_test', shuffle_questions: true, shuffle_options: true, max_attempts: 1 },
});
if (exam?.id) {
  await api('PATCH', `/exams/${exam.id}/status`, teacher, { status: 'published' });
}
console.log('  exam ready:', exam?.id ? 'Kiểm tra 15 phút — Cổng logic (published)' : '(failed)');

// --- Games: create every game type, report which fail ---
const gameResults = {};
async function createGame(gameType, extra) {
  const g = await api('POST', '/games', teacher, { gameType, classId, ...extra });
  gameResults[gameType] = g?.roomCode ? 'OK ' + g.roomCode : 'FAILED';
  return g;
}

await createGame('quick_quiz', { questionIds: qIds, secondsPerQuestion: 20 });
await createGame('tug_of_war', { questionIds: qIds, secondsPerQuestion: 20 });
await createGame('math_race', { durationSec: 90, difficulty: 2 });
await createGame('hand_raise', { questionIds: qIds, secondsPerQuestion: 20 });
await createGame('crossword', {
  puzzle: {
    keyword: 'OR',
    rows: [
      { clue: 'Đơn vị đo điện trở', word: 'OHM' },
      { clue: 'Hồ quang điện', word: 'ARC' },
    ],
  },
});
await createGame('bingo', {});
await createGame('memory_match', {});
await createGame('word_scramble', { questionIds: qIds });
await createGame('quiz_show', { questionIds: qIds });
await createGame('circuit_draw', {});
await createGame('circuit_simulate', {});

console.log('\n  Game creation results:');
for (const [type, result] of Object.entries(gameResults)) {
  console.log(`    ${result.startsWith('OK') ? 'OK  ' : 'FAIL'}  ${type.padEnd(16)} ${result}`);
}

console.log(`\nDemo tour dataset ready (${failures} REST call failure(s) total).`);
console.log('  Teacher: gv.tuan / Tuan@Demo2026 (owns class DH31A)');
console.log('  Teacher 2: gv.mai / Mai@Demo2026 (owns the created games)');
console.log('  Student: sv.anhnt / Sv@Demo123');
process.exit(failures > 0 ? 1 : 0);
