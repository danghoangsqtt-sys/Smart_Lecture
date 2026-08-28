import ExcelJS from 'exceljs';

const base = 'http://127.0.0.1:4100/api';

async function request(path, token, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const body = await response.arrayBuffer();
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${new TextDecoder().decode(body)}`);
  return { response, body };
}

async function makeWorkbook(sheetName, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet(sheetName).addRows(rows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function upload(path, token, fileName, buffer, fields = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append('file', new Blob([buffer]), fileName);
  return request(path, token, { method: 'POST', body: form });
}

const login = await request('/auth/login', '', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'teacher.hoa', password: 'Gv@654321' }),
});
const teacherToken = JSON.parse(new TextDecoder().decode(login.body)).token;
const classesResponse = await request('/classes/mine', teacherToken);
const classId = JSON.parse(new TextDecoder().decode(classesResponse.body)).classes[0]?.id;
if (!classId) throw new Error('No teacher class available for Excel regression');

const subjectsResponse = await request(`/classes/${classId}/subjects`, teacherToken);
const subjectId = JSON.parse(new TextDecoder().decode(subjectsResponse.body)).subjects[0]?.id;
if (!subjectId) throw new Error('No subject available for Excel regression');

const suffix = Date.now();
const studentFile = await makeWorkbook('Students', [
  ['Mã học viên', 'Họ và tên', 'Tài khoản', 'Mật khẩu'],
  [`HV${suffix}`, 'Excel Regression Student', `excel${suffix}`, 'Excel@123'],
]);
const studentUpload = await upload(`/classes/${classId}/import-students`, teacherToken, 'students.xlsx', studentFile);
const studentResult = JSON.parse(new TextDecoder().decode(studentUpload.body));
if (studentResult.created !== 1 || studentResult.enrolled !== 1) throw new Error(`Student XLSX import mismatch: ${JSON.stringify(studentResult)}`);

const curriculumFile = await makeWorkbook('Curriculum', [
  ['Week', 'Chapter', 'Topic', 'Periods'],
  [1, 'Excel regression', 'Workbook route import', 2],
]);
const curriculumUpload = await upload(
  `/classes/${classId}/teaching-plans/import-curriculum`,
  teacherToken,
  'curriculum.xlsx',
  curriculumFile,
  { subjectId },
);
const curriculumResult = JSON.parse(new TextDecoder().decode(curriculumUpload.body));
if (curriculumResult.created !== 1 || curriculumResult.totalPeriods !== 2) {
  throw new Error(`Curriculum XLSX import mismatch: ${JSON.stringify(curriculumResult)}`);
}

const template = await request(`/classes/${classId}/teaching-plans/template.xlsx`, teacherToken);
const templateBook = new ExcelJS.Workbook();
await templateBook.xlsx.load(Buffer.from(template.body));
if (templateBook.worksheets[0]?.getRow(1).getCell(1).value !== 'Tuần') throw new Error('Curriculum XLSX template mismatch');

const exported = await request(`/classes/${classId}/export/xlsx`, teacherToken);
const exportBook = new ExcelJS.Workbook();
await exportBook.xlsx.load(Buffer.from(exported.body));
if (exportBook.worksheets[0]?.getRow(1).getCell(1).value !== 'STT') throw new Error('Class XLSX export mismatch');

console.log('Excel route regression PASS (student import, curriculum import/template, class export)');
