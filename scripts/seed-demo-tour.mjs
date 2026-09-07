/**
 * Standalone, throwaway demo dataset for a product walkthrough.
 * Mirrors the user's real class ("DH31A — Điện tử số") without touching real data.
 * Usage: BASE=http://127.0.0.1:PORT node scripts/seed-demo-tour.mjs
 */
const base = process.env.BASE ?? 'http://127.0.0.1:4800';

async function api(method, path, token, body) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) console.error(`  ! ${method} ${path} -> ${res.status}`, data);
  return data;
}
async function login(username, password) {
  const r = await api('POST', '/auth/login', null, { username, password });
  return r?.token ?? '';
}

console.log('Seeding demo tour dataset...');

// Admin bootstraps a teacher account.
const firstAdmin = await login('admin', 'admin123');
await api('POST', '/auth/change-password', firstAdmin, { oldPassword: 'admin123', newPassword: 'Admin@Demo2026' });
const admin = await login('admin', 'Admin@Demo2026');
await api('POST', '/users', admin, { username: 'gv.tuan', password: 'GvTuan@2026', role: 'teacher', displayName: 'Thầy Tuấn' }).catch(() => {});
const firstTeacher = await login('gv.tuan', 'GvTuan@2026');
await api('POST', '/auth/change-password', firstTeacher, { oldPassword: 'GvTuan@2026', newPassword: 'Tuan@Demo2026' });
const teacher = await login('gv.tuan', 'Tuan@Demo2026');
console.log('  teacher ready: gv.tuan / Tuan@Demo2026');

const students = [
  { username: 'sv.anhnt', password: 'Sv@Demo123', displayName: 'Nguyễn Thị Anh' },
  { username: 'sv.binhvh', password: 'Sv@Demo123', displayName: 'Vũ Hoàng Bình' },
  { username: 'sv.chinhld', password: 'Sv@Demo123', displayName: 'Lê Đức Chính' },
  { username: 'sv.dungth', password: 'Sv@Demo123', displayName: 'Trần Hải Dũng' },
];
for (const s of students) await api('POST', '/users', teacher, { ...s, role: 'student' }).catch(() => {});

const cls = await api('POST', '/classes', teacher, { name: 'DH31A', subject: 'Điện tử số', academicYear: '2026-2027' });
const classId = cls.class.id;
const studentsRes = await api('GET', '/users?role=student', teacher);
const studentIds = (studentsRes.users ?? []).filter((u) => u.username.startsWith('sv.')).map((u) => u.id);
await api('POST', `/classes/${classId}/enroll`, teacher, { studentIds });
console.log(`  class DH31A ready: ${studentIds.length} students enrolled`);

const lecture = await api('POST', `/classes/${classId}/lectures`, teacher, { chapter: 'Chương 1', title: 'Cổng logic cơ bản', description: 'Giới thiệu cổng AND, OR, NOT và IC 7400.' });
console.log('  lecture ready:', lecture.id ? 'Cổng logic cơ bản' : '(failed)');

const questionSpecs = [
  ['Cổng AND cho kết quả 1 khi nào?', 'A. Cả hai đầu vào đều là 1', 'B. Một trong hai đầu vào là 1', 'C. Cả hai đầu vào đều là 0', 'D. Không bao giờ', 'A'],
  ['IC 7400 chứa loại cổng logic nào?', 'A. NAND', 'B. NOR', 'C. XOR', 'D. AND', 'A'],
  ['Half Adder có bao nhiêu đầu ra?', 'A. 2 (Sum và Carry)', 'B. 1', 'C. 3', 'D. 4', 'A'],
  ['D Flip-Flop chốt dữ liệu tại thời điểm nào?', 'A. Cạnh lên xung Clock', 'B. Bất kỳ lúc nào', 'C. Khi Data = 0', 'D. Khi Reset = 1', 'A'],
];
const qIds = [];
for (const [content, a, b, c, d, correct] of questionSpecs) {
  const q = await api('POST', '/questions', teacher, {
    type: 'mcq', content, options: [a, b, c, d], correctAnswer: correct,
    explanation: '', bloomLevel: 'Nhận biết', category: 'Điện tử số', folderId: null,
  });
  if (q.question?.id) qIds.push(q.question.id);
}
console.log(`  ${qIds.length} questions ready`);

const quiz = await api('POST', '/games', teacher, { gameType: 'quick_quiz', questionIds: qIds, secondsPerQuestion: 20, classId });
console.log('  quick quiz room:', quiz.roomCode);

const circuit = await api('POST', '/games', teacher, { gameType: 'circuit_simulate', classId });
console.log('  circuit lab room:', circuit.roomCode);

console.log('\nDemo tour dataset ready.');
console.log('  Teacher: gv.tuan / Tuan@Demo2026');
console.log('  Student: sv.anhnt / Sv@Demo123');
