export interface OneTimeCredential {
  id: string;
  username: string;
  temporaryPassword: string;
}

function csvCell(value: string): string {
  const formulaSafe = /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
  return /[",\r\n]/u.test(formulaSafe) ? `"${formulaSafe.replace(/"/gu, '""')}"` : formulaSafe;
}

export function downloadCredentialCsv(credentials: OneTimeCredential[], filename: string): void {
  const rows = [
    ['Tài khoản', 'Mật khẩu tạm'],
    ...credentials.map((item) => [item.username, item.temporaryPassword]),
  ];
  const contents = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
