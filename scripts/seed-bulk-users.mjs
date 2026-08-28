/**
 * Seed Bulk Users - SmartLecture
 * Tạo 5 Giáo viên, 60 Học viên, 4 Lớp học
 * Chạy: node scripts/seed-bulk-users.mjs
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { writeFileSync, readFileSync } from 'node:fs';

const BASE_URL = 'http://localhost:4000/api';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

// ========== CẤU HÌNH ==========
const TEACHERS = [
  { username: 'gv_nguyenvanA', password: 'Gv@123456', displayName: 'Nguyen Van An', subject: 'Toan hoc' },
  { username: 'gv_tranthiB', password: 'Gv@123456', displayName: 'Tran Thi Binh', subject: 'Vat ly' },
  { username: 'gv_levanC', password: 'Gv@123456', displayName: 'Le Van Cuong', subject: 'Hoa hoc' },
  { username: 'gv_phamthiD', password: 'Gv@123456', displayName: 'Pham Thi Dung', subject: 'Sinh hoc' },
  { username: 'gv_hoangvanE', password: 'Gv@123456', displayName: 'Hoang Van Em', subject: 'Tin hoc' }
];

const CLASSES = [
  { name: '12A1', subject: 'Toan hoc', teacherIndex: 0, academicYear: '2025-2026', totalPeriods: 35 },
  { name: '12A2', subject: 'Vat ly', teacherIndex: 1, academicYear: '2025-2026', totalPeriods: 35 },
  { name: '12A3', subject: 'Hoa hoc', teacherIndex: 2, academicYear: '2025-2026', totalPeriods: 35 },
  { name: '12A4', subject: 'Sinh hoc', teacherIndex: 3, academicYear: '2025-2026', totalPeriods: 35 }
];

const STUDENTS_PER_CLASS = 15;
const TOTAL_STUDENTS = CLASSES.length * STUDENTS_PER_CLASS; // 60

// Danh sách tên tiếng Việt không dấu
const HO_LIST = ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Huynh', 'Vo', 'Dang', 'Bui', 'Do', 'Ho', 'Ngo', 'Duong', 'Ly'];
const TEN_LIST = ['An', 'Binh', 'Cuong', 'Dung', 'Em', 'Phuong', 'Hung', 'Khanh', 'Lan', 'Minh', 'Nam', 'Oanh', 'Phuc', 'Quang', 'Son', 'Thao', 'Uyen', 'Vinh', 'Xuan', 'Yen'];
const GIOI_TINH = ['Nam', 'Nu'];
const QUE_QUAN = ['Ha Noi', 'Hai Phong', 'Da Nang', 'TP.HCM', 'Can Tho', 'Binh Duong', 'Dong Nai', 'Ba Ria', 'Vung Tau', 'Quang Ninh'];

// ========== HTTP HELPER ==========
function request(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: `/api${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null, code = '', message = '';
        if (data) {
          try {
            parsed = JSON.parse(data);
            if (parsed.error) { code = parsed.error.code; message = parsed.error.message; }
          } catch { }
        }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: parsed, code, message, raw: data });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function uploadFile(path, token, filePath, fieldName = 'file') {
  return new Promise((resolve, reject) => {
    const fileData = readFileSync(filePath);
    const boundary = `----WebKitFormBoundary${randomUUID().replace(/-/g, '')}`;

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    };

    const options = {
      hostname: 'localhost',
      port: 4000,
      path: `/api${path}`,
      method: 'POST',
      headers
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null, code = '', message = '';
        if (data) {
          try {
            parsed = JSON.parse(data);
            if (parsed.error) { code = parsed.error.code; message = parsed.error.message; }
          } catch { }
        }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: parsed, code, message, raw: data });
      });
    });

    req.on('error', reject);

    // Build multipart body
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="students.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    req.write(header);
    req.write(fileData);
    req.write(footer);
    req.end();
  });
}

function check(name, cond) {
  if (cond) console.log(`  ✓ PASS: ${name}`);
  else console.log(`  ✗ FAIL: ${name}`);
  return cond;
}

async function main() {
  console.log('\n===========================================');
  console.log('  SEED BULK USERS - SMARTLECTURE');
  console.log('===========================================\n');

  // --- 1. Đăng nhập Admin ---
  console.log('[LOG] Dang nhap Admin...');
  const login = await request('POST', '/auth/login', null, { username: ADMIN_USER, password: ADMIN_PASS });
  if (!login.ok) throw new Error(`Dang nhap admin that bai: ${login.message} (status ${login.status})`);
  const adminToken = login.data.token;
  check('Admin login', adminToken.length > 50);

  // --- 2. Tạo 5 Giáo viên ---
  console.log('\n[LOG] Tao 5 tai khoan Giao vien...');
  const teacherTokens = {};
  const teacherIds = {};

  for (const t of TEACHERS) {
    const res = await request('POST', '/users', adminToken, {
      username: t.username,
      password: t.password,
      role: 'teacher',
      displayName: t.displayName
    });

    if (res.ok) {
      const tid = res.data.user.id;
      teacherIds[t.username] = tid;
      check(`Tao GV: ${t.displayName} (${t.username})`, true);

      // Đăng nhập lấy token
      const tLogin = await request('POST', '/auth/login', null, { username: t.username, password: t.password });
      if (tLogin.ok) teacherTokens[t.username] = tLogin.data.token;
    } else {
      check(`Tao GV: ${t.displayName} (${t.username}) - ${res.message}`, false);
    }
  }

  // --- 3. Tạo 4 Lớp học ---
  console.log('\n[LOG] Tao 4 Lop hoc...');
  const classIds = {};

  for (let i = 0; i < CLASSES.length; i++) {
    const c = CLASSES[i];
    const teacherUser = TEACHERS[c.teacherIndex].username;
    const teacherToken = teacherTokens[teacherUser];

    const res = await request('POST', '/classes', teacherToken, {
      name: c.name,
      subject: c.subject,
      academicYear: c.academicYear,
      totalPeriods: c.totalPeriods
    });

    if (res.ok) {
      const cid = res.data.class.id;
      classIds[c.name] = cid;
      check(`Tao lop: ${c.name} (${c.subject}) - GV: ${TEACHERS[c.teacherIndex].displayName}`, true);
    } else {
      check(`Tao lop: ${c.name} - ${res.message}`, false);
    }
  }

  // --- 4. Tạo 60 Học viên và Import vào từng lớp ---
  console.log(`\n[LOG] Tao ${TOTAL_STUDENTS} hoc vien va import vao lop...`);

  const HO = HO_LIST;
  const TEN = TEN_LIST;
  const GT = GIOI_TINH;
  const QQ = QUE_QUAN;

  let studentIndex = 0;

  for (const c of CLASSES) {
    const cid = classIds[c.name];
    const teacherUser = TEACHERS[c.teacherIndex].username;
    const teacherToken = teacherTokens[teacherUser];

    console.log(`  → Tao file Excel cho lop ${c.name} (hoc vien ${studentIndex+1} - ${studentIndex+STUDENTS_PER_CLASS})...`);

    // Tạo dữ liệu Excel
    const headers = ['STT', 'Ma hoc vien', 'Ho va ten', 'Ngay sinh', 'Gioi tinh', 'Lop', 'Que quan', 'Tai khoan user', 'Mat khau'];
    const rows = [headers];

    for (let j = 0; j < STUDENTS_PER_CLASS; j++) {
      const idx = studentIndex + j;
      const stt = j + 1;
      const maHV = `HV${String(idx + 1).padStart(4, '0')}`;
      const ho = HO[Math.floor(Math.random() * HO.length)];
      const dem = TEN[Math.floor(Math.random() * TEN.length)];
      const ten = TEN[Math.floor(Math.random() * TEN.length)];
      const hoTen = `${ho} ${dem} ${ten}`;
      const namSinh = Math.floor(Math.random() * (2009 - 2006 + 1)) + 2006;
      const thang = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
      const ngay = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
      const ngaySinh = `${ngay}/${thang}/${namSinh}`;
      const gt = GT[Math.floor(Math.random() * GT.length)];
      const qq = QQ[Math.floor(Math.random() * QQ.length)];
      const tk = `hv${String(idx + 1).padStart(4, '0')}`;
      const mk = 'Hv@12345';

      rows.push([stt, maHV, hoTen, ngaySinh, gt, c.name, qq, tk, mk]);
    }

    // Tạo workbook
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Danh sach');
    ws.addRows(rows);
    [6, 14, 25, 12, 10, 10, 15, 18, 14].forEach((width, index) => { ws.getColumn(index + 1).width = width; });
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const xlsxPath = `/tmp/students_${c.name}.xlsx`;
    writeFileSync(xlsxPath, buf);

    studentIndex += STUDENTS_PER_CLASS;

    console.log(`  → Import vao lop ${c.name}...`);
    const importRes = await uploadFile(`/classes/${cid}/import-students`, teacherToken, xlsxPath);

    if (importRes.ok) {
      const d = importRes.data;
      check(`Import lop ${c.name}: tao ${d.created} moi, ghi danh ${d.enrolled}, bo qua ${d.skipped}`,
            d.created === STUDENTS_PER_CLASS && d.enrolled === STUDENTS_PER_CLASS);
    } else {
      check(`Import lop ${c.name} - Status ${importRes.status}: ${importRes.message}`, false);
    }

    // Cleanup
    try { require('node:fs').unlinkSync(xlsxPath); } catch { }
  }

  // --- 5. Kiểm tra kết quả ---
  console.log('\n[LOG] Kiem tra ket qua...');

  for (const c of CLASSES) {
    const cid = classIds[c.name];
    const teacherUser = TEACHERS[c.teacherIndex].username;
    const teacherToken = teacherTokens[teacherUser];

    const detail = await request('GET', `/classes/${cid}`, teacherToken);
    if (detail.ok) {
      const count = detail.data.students.length;
      check(`Lop ${c.name}: ${count} hoc vien`, count === STUDENTS_PER_CLASS);
    }
  }

  // --- TỔNG KẾT ---
  console.log('\n===========================================');
  console.log('  HOAN TAT SEED DU LIEU');
  console.log('===========================================');
  console.log('  Giao vien: 5 tai khoan');
  console.log('  Lop hoc: 4 lop (12A1, 12A2, 12A3, 12A4)');
  console.log('  Hoc vien: 60 tai khoan (15/lop)');
  console.log('');
  console.log('Thong tin dang nhap:');
  console.log(`  Admin:  ${ADMIN_USER} / ${ADMIN_PASS}`);
  TEACHERS.forEach(t => console.log(`  GV:     ${t.username} / ${t.password}  [${t.displayName} - ${t.subject}]`));
  console.log('  HV:     hv0001..hv0060 / Hv@12345');
  console.log('');
  console.log('Mo http://localhost:5173 de kiem tra');
}

main().catch(err => {
  console.error('\n✗ LOI:', err.message);
  process.exit(1);
});
