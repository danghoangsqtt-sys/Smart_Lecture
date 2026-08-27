import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(new URL('../data/smart-lecture.db', import.meta.url));
db.exec('PRAGMA foreign_keys = ON;');

const DEMO_CATEGORY = 'Demo: Kiến thức số cơ bản';
const DEMO_TITLE = 'Quiz test — Kiến thức số cơ bản';

const questions = [
  ['CPU là viết tắt của?', 'Bộ xử lý trung tâm', 'Bộ nhớ tạm', 'Thiết bị nhập', 'Ổ lưu trữ', 'A'],
  ['RAM dùng để làm gì?', 'Lưu trữ tạm khi chạy chương trình', 'Lưu mãi dữ liệu', 'In tài liệu', 'Kết nối mạng', 'A'],
  ['Thiết bị nào là thiết bị nhập?', 'Bàn phím', 'Màn hình', 'Máy in', 'Loa', 'A'],
  ['Thiết bị nào là thiết bị xuất?', 'Màn hình', 'Chuột', 'Bàn phím', 'Máy quét', 'A'],
  ['1 KB bằng bao nhiêu byte?', '1024 byte', '100 byte', '512 byte', '2048 byte', 'A'],
  ['Hệ điều hành có vai trò chính là gì?', 'Quản lý phần cứng và phần mềm', 'Chỉ soạn văn bản', 'Chỉ vẽ hình', 'Chỉ chơi game', 'A'],
  ['Phần mềm trình duyệt dùng để?', 'Truy cập các trang web', 'Quét virus', 'In ảnh', 'Tắt máy', 'A'],
  ['Địa chỉ website thường bắt đầu bằng?', 'http:// hoặc https://', 'cpu://', 'ram://', 'file://', 'A'],
  ['Mật khẩu mạnh nên có?', 'Chữ hoa, chữ thường, số và ký tự đặc biệt', 'Chỉ ngày sinh', 'Chỉ tên cá nhân', 'Một chữ số', 'A'],
  ['Phishing là gì?', 'Lừa đảo để lấy thông tin', 'Sao lưu dữ liệu', 'Nén tệp', 'Cài phần mềm', 'A'],
  ['Tệp có phần mở rộng .docx thường là?', 'Văn bản Word', 'Ảnh', 'Âm thanh', 'Video', 'A'],
  ['Tệp có phần mở rộng .xlsx thường là?', 'Bảng tính Excel', 'Văn bản Word', 'Ảnh', 'Trình chiếu', 'A'],
  ['Ctrl + C là phím tắt?', 'Sao chép', 'Cắt', 'Dán', 'Lưu', 'A'],
  ['Ctrl + V là phím tắt?', 'Dán', 'Sao chép', 'Hoàn tác', 'In', 'A'],
  ['Dịch vụ lưu tệp qua Internet gọi là?', 'Lưu trữ đám mây', 'Bộ nhớ ROM', 'Bàn phím', 'Màn hình', 'A'],
  ['Wi-Fi dùng để?', 'Kết nối mạng không dây', 'Tăng dung lượng RAM', 'In tài liệu', 'Sạc pin', 'A'],
  ['Sao lưu dữ liệu giúp?', 'Khôi phục khi mất dữ liệu', 'Xóa virus ngay lập tức', 'Tăng tốc màn hình', 'Tắt mạng', 'A'],
  ['Phần mềm độc hại còn gọi là?', 'Malware', 'Hardware', 'Browser', 'Folder', 'A'],
  ['Khi nhận liên kết lạ, nên làm gì?', 'Kiểm tra trước khi nhấp', 'Nhấp ngay', 'Gửi cho mọi người', 'Tắt máy ngay', 'A'],
  ['Đâu là hành vi bảo vệ tài khoản tốt?', 'Bật xác thực hai lớp', 'Chia sẻ mật khẩu', 'Dùng cùng một mật khẩu yếu', 'Đăng nhập trên máy lạ rồi không đăng xuất', 'A'],
];

const owner = db.prepare("SELECT id FROM users WHERE role IN ('admin', 'teacher') AND status = 'active' ORDER BY role = 'admin' DESC LIMIT 1").get();
if (!owner) throw new Error('Chưa có tài khoản quản trị/giáo viên hoạt động. Hãy khởi động ứng dụng để tạo admin trước.');

const insertQuestion = db.prepare(`
  INSERT INTO questions (id, owner_id, type, content, options_json, correct_answer, explanation, bloom_level, category)
  VALUES (?, ?, 'mcq', ?, ?, ?, ?, 'Nhớ', ?)
`);

const questionIds = [];
db.exec('BEGIN');
try {
  for (const [content, ...rest] of questions) {
    const options = rest.slice(0, 4);
    const correct = rest[4];
    let row = db.prepare('SELECT id FROM questions WHERE owner_id = ? AND content = ?').get(owner.id, content);
    if (!row) {
      const id = randomUUID();
      insertQuestion.run(id, owner.id, content, JSON.stringify(options), correct, `Đáp án đúng: ${correct}.`, DEMO_CATEGORY);
      row = { id };
    }
    questionIds.push(row.id);
  }

  let game = db.prepare('SELECT id, room_code FROM game_sessions WHERE host_teacher_id = ? AND config_json LIKE ? AND status = \'lobby\' LIMIT 1').get(owner.id, `%${DEMO_TITLE}%`);
  if (!game) {
    let roomCode;
    do roomCode = String(Math.floor(100000 + Math.random() * 900000));
    while (db.prepare("SELECT 1 FROM game_sessions WHERE room_code = ? AND status != 'finished'").get(roomCode));
    const id = randomUUID();
    db.prepare(`INSERT INTO game_sessions (id, host_teacher_id, game_type, room_code, question_ids_json, config_json)
      VALUES (?, ?, 'quick_quiz', ?, ?, ?)`)
      .run(id, owner.id, roomCode, JSON.stringify(questionIds), JSON.stringify({ title: DEMO_TITLE, secondsPerQuestion: 20, durationSec: 120, difficulty: 1, lockOnStart: false }));
    game = { id, room_code: roomCode };
  } else {
    db.prepare('UPDATE game_sessions SET question_ids_json = ? WHERE id = ?').run(JSON.stringify(questionIds), game.id);
  }

  let prepared = db.prepare('SELECT id FROM prepared_games WHERE teacher_id = ? AND title = ? LIMIT 1').get(owner.id, DEMO_TITLE);
  if (!prepared) {
    const id = randomUUID();
    db.prepare(`INSERT INTO prepared_games (id, teacher_id, game_type, title, config_json, question_ids_json)
      VALUES (?, ?, 'quick_quiz', ?, ?, ?)`)
      .run(id, owner.id, DEMO_TITLE, JSON.stringify({ title: DEMO_TITLE, secondsPerQuestion: 20, durationSec: 120, difficulty: 1, lockOnStart: false }), JSON.stringify(questionIds));
    prepared = { id };
  } else {
    db.prepare('UPDATE prepared_games SET question_ids_json = ? WHERE id = ?').run(JSON.stringify(questionIds), prepared.id);
  }
  db.exec('COMMIT');
  console.log(JSON.stringify({ questions: questionIds.length, gameId: game.id, roomCode: game.room_code, preparedGameId: prepared.id }));
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}
