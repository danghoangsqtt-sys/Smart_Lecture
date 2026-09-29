# Huong dan cai dat SmartLecture

## Cai dat

1. Nhan file `SmartLecture-Setup-<phien-ban>.exe` tu nguoi quan ly.
2. Bam dup file, chon **Install**, sau do chon **Finish**.
3. Khong can cai Node.js, Git, hay mo terminal.

Sau khi cai dat, icon **SmartLecture** xuat hien tren Desktop va Start Menu.

## Su dung hang ngay

1. Bam dup icon **SmartLecture**.
2. Doi trinh duyet mo tai `http://localhost:4000`.
3. Dang nhap lan dau bang `admin` / `admin123`, sau do doi mat khau ngay.
4. Cho hoc vien ket noi cung Wi-Fi/LAN. Lay QR hoac dia chi LAN tren Dashboard de hoc vien truy cap bang trinh duyet.

## Du lieu va sao luu

Du lieu lop hoc, hoc lieu va ban sao luu duoc luu rieng tai:

```text
%LOCALAPPDATA%\SmartLecture\data
```

Go cai dat SmartLecture khong xoa thu muc nay. De sao luu thu cong, dung muc **Cai dat -> He thong & sao luu** trong ung dung.

Khi nang cap tu ban cu tung luu du lieu trong thu muc cai dat, launcher chi di chuyen du lieu khi SmartLecture da dung. Du lieu duoc sao chep qua thu muc tam, doi chieu SHA-256 roi moi cong bo tai duong dan tren; thu muc cu van duoc giu lam ban khoi phuc.

Launcher tu tim ban cai legacy cung tai khoan Windows. Neu ban cu la ban portable hoac da bi go, co the dat bien `SMARTLECTURE_LEGACY_DATA_DIR` thanh duong dan thu muc `data` cu truoc khi mo launcher moi.

Neu ca thu muc cu va `%LOCALAPPDATA%\SmartLecture\data` deu co du lieu ma khong co dau xac nhan migration hop le, launcher se dung va hien hai duong dan. Khong xoa hoac tron hai thu muc. Hay sao luu ca hai truoc khi chon ban du lieu can giu.

## Cap nhat

Khi nhan file `SmartLecture-Setup-<phien-ban-moi>.exe`, dong SmartLecture, chay file moi va cai de len ban cu. Du lieu lop hoc van duoc giu nguyen.

## Xu ly su co

### Quen mat khau admin

SmartLecture khong mo endpoint "quen mat khau" tren LAN vi he thong hoat dong offline va khong co email da xac minh. Chu may co the khoi phuc an toan tai chinh may cai dat:

1. Dong SmartLecture hoan toan.
2. Mo PowerShell trong thu muc cai dat va chay `powershell -ExecutionPolicy Bypass -File .\recover-admin.ps1`.
3. Kiem tra duong dan data va nhap lai dung username admin de xac nhan.
4. Ghi lai mat khau tam chi hien mot lan, dang nhap va doi mat khau ngay.

Lenh tao backup trong `data\backups\owner-recovery-*`, mo khoa admin, bat buoc doi mat khau va xoay khoa JWT de huy cac phien cu. Neu thay file `smart-lecture.db-wal`/`smart-lecture.db-shm`, lenh se tu choi; khong tu xoa cac file nay khi ung dung con chay.

- Neu icon thong bao cong 4000 dang duoc su dung, khoi dong lai may tinh roi mo lai SmartLecture.
- Neu trinh duyet khong tu mo, truy cap `http://localhost:4000`.
- Nhat ky khoi dong nam trong `%LOCALAPPDATA%\SmartLecture\data\logs`.
- Neu launcher bao du lieu cu da thay doi sau migration, hay dong SmartLecture, sao luu ca thu muc cu va thu muc LocalAppData, sau do lien he nguoi quan ly de doi chieu.

> Windows co the hien canh bao voi phan mem chua ky so. Hay chi cai file nhan tu nguoi quan ly cua SmartLecture.
