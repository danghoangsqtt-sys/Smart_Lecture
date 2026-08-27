<#
.SYNOPSIS
    Tạo hàng loạt tài khoản: 5 Giáo viên, 60 Học viên, phân chia vào các lớp học
.DESCRIPTION
    Script sử dụng API của SmartLecture để:
    1. Đăng nhập admin
    2. Tạo 5 tài khoản Giáo viên
    3. Tạo 4 lớp học (mỗi lớp 15 học viên)
    4. Tạo 60 tài khoản Học viên và ghi danh vào lớp tương ứng qua import Excel
.NOTES
    Yêu cầu: Server đang chạy tại http://localhost:4000
    Admin mặc định: admin / admin123
#>

$ErrorActionPreference = "Stop"

# ========== CẤU HÌNH ==========
$BASE_URL = "http://localhost:4000/api"
$ADMIN_USER = "admin"
$ADMIN_PASS = "admin123"

# Thông tin 5 Giáo viên
$TEACHERS = @(
    @{ username = "gv_nguyenvanA";  password = "Gv@123456"; displayName = "Nguyễn Văn An";     subject = "Toán học" },
    @{ username = "gv_tranthiB";    password = "Gv@123456"; displayName = "Trần Thị Bình";    subject = "Vật lý" },
    @{ username = "gv_levanC";      password = "Gv@123456"; displayName = "Lê Văn Cường";     subject = "Hóa học" },
    @{ username = "gv_phamthiD";    password = "Gv@123456"; displayName = "Phạm Thị Dung";    subject = "Sinh học" },
    @{ username = "gv_hoangvanE";   password = "Gv@123456"; displayName = "Hoàng Văn Em";     subject = "Tin học" }
)

# Thông tin 4 Lớp học (mỗi lớp 15 học viên = 60 học viên)
$CLASSES = @(
    @{ name = "12A1"; subject = "Toán học";       teacherIndex = 0; academicYear = "2025-2026"; totalPeriods = 35 },
    @{ name = "12A2"; subject = "Vật lý";         teacherIndex = 1; academicYear = "2025-2026"; totalPeriods = 35 },
    @{ name = "12A3"; subject = "Hóa học";        teacherIndex = 2; academicYear = "2025-2026"; totalPeriods = 35 },
    @{ name = "12A4"; subject = "Sinh học";       teacherIndex = 3; academicYear = "2025-2026"; totalPeriods = 35 }
)

# Tổng 60 học viên (15 per class)
$STUDENTS_PER_CLASS = 15
$TOTAL_STUDENTS = $CLASSES.Count * $STUDENTS_PER_CLASS  # 60

# ========== HÀM TIỆN ÍCH ==========
Add-Type -AssemblyName System.Net.Http
$http = New-Object System.Net.Http.HttpClient
$http.BaseAddress = $BASE_URL

function Invoke-Api($method, $url, $token, $body) {
    try {
        $request = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($method)), $url)
        if ($token) { $request.Headers.TryAddWithoutValidation("Authorization", "Bearer $token") | Out-Null }
        if ($null -ne $body) {
            $json = $body | ConvertTo-Json -Depth 6
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $request.Content = New-Object System.Net.Http.ByteArrayContent(,$bytes)
            $request.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/json")
        }
        $response = $http.SendAsync($request).GetAwaiter().GetResult()
        $raw = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $status = [int]$response.StatusCode
        $data = $null; $code = ""; $message = ""
        if ($raw) {
            try {
                $parsed = $raw | ConvertFrom-Json
                if ($parsed.error) { $code = $parsed.error.code; $message = $parsed.error.message }
                else { $data = $parsed }
            } catch { $data = $raw }
        }
        return @{ ok = ($status -ge 200 -and $status -lt 300); status = $status; data = $data; code = $code; message = $message; raw = $raw }
    } catch {
        return @{ ok = $false; status = 0; code = "CLIENT_ERR"; message = $_.Exception.Message }
    }
}

function Check($name, $cond) {
    if ($cond) { Write-Host "  ✓ PASS: $name" -ForegroundColor Green; return $true }
    else { Write-Host "  ✗ FAIL: $name" -ForegroundColor Red; return $false }
}

# ========== BẮT ĐẦU ==========
Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  SEED BULK USERS - SMARTLECTURE" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Đăng nhập Admin ---
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Đăng nhập Admin..." -ForegroundColor Yellow
$login = Invoke-Api "POST" "/auth/login" $null @{ username = $ADMIN_USER; password = $ADMIN_PASS }
if (-not $login.ok) { throw "Đăng nhập admin thất bại: $($login.message) (status $($login.status))" }
$adminToken = $login.data.token
Check "Admin login" ($adminToken.Length -gt 50)

# --- 2. Tạo 5 Giáo viên ---
Write-Host ""
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Tạo 5 tài khoản Giáo viên..." -ForegroundColor Yellow
$teacherTokens = @{}
$teacherIds = @{}
foreach ($t in $TEACHERS) {
    $res = Invoke-Api "POST" "/users" $adminToken @{
        username    = $t.username
        password    = $t.password
        role        = "teacher"
        displayName = $t.displayName
    }
    if ($res.ok) {
        $tid = $res.data.user.id
        $teacherIds[$t.username] = $tid
        Check "Tạo GV: $($t.displayName) ($($t.username))" $true
        # Đăng nhập để lấy token
        $tLogin = Invoke-Api "POST" "/auth/login" $null @{ username = $t.username; password = $t.password }
        if ($tLogin.ok) { $teacherTokens[$t.username] = $tLogin.data.token }
    } else {
        Check "Tạo GV: $($t.displayName) ($($t.username)) - $($res.message)" $false
    }
}

# --- 3. Tạo 4 Lớp học ---
Write-Host ""
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Tạo 4 Lớp học..." -ForegroundColor Yellow
$classIds = @{}
for ($i = 0; $i -lt $CLASSES.Count; $i++) {
    $c = $CLASSES[$i]
    $teacherUser = $TEACHERS[$c.teacherIndex].username
    $teacherToken = $teacherTokens[$teacherUser]

    $res = Invoke-Api "POST" "/classes" $teacherToken @{
        name          = $c.name
        subject       = $c.subject
        academicYear  = $c.academicYear
        totalPeriods  = $c.totalPeriods
    }
    if ($res.ok) {
        $cid = $res.data.class.id
        $classIds[$c.name] = $cid
        Check "Tạo lớp: $($c.name) ($($c.subject)) - GV: $($TEACHERS[$c.teacherIndex].displayName)" $true
    } else {
        Check "Tạo lớp: $($c.name) - $($res.message)" $false
    }
}

# --- 4. Tạo 60 Học viên và Import vào từng lớp ---
Write-Host ""
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Tạo $TOTAL_STUDENTS học viên và import vào lớp..." -ForegroundColor Yellow

# Load xlsx library để tạo file Excel
Add-Type -Path "E:\data\2.MyProject\2026\Smart_Lecture\node_modules\xlsx\xlsx.full.min.js" -ErrorAction SilentlyContinue
# Thay vào đó dùng PowerShell tạo CSV rồi convert, hoặc dùng COM Excel nếu có
# Cách đơn giản: dùng .NET tạo file Excel qua EPPlus không có sẵn.
# Ta sẽ tạo file CSV và convert qua xlsx qua node -e inline.

function New-StudentExcel($className, $classInfo, $startIndex) {
    $headers = @('STT','Mã học viên','Họ và tên','Ngày sinh','Giới tính','Lớp','Quê quán','Tài khoản user','Mật khẩu')
    $rows = @($headers -join ',')

    $hoList = @("Nguyễn","Trần","Lê","Phạm","Hoàng","Huỳnh","Võ","Đặng","Bùi","Đỗ","Hồ","Ngô","Dương","Lý")
    $tenList = @("An","Bình","Cường","Dũng","Em","Phương","Hùng","Khánh","Lan","Minh","Nam","Oanh","Phúc","Quang","Sơn","Thảo","Uyên","Vinh","Xuân","Yến")
    $gioiTinh = @("Nam","Nữ")
    $queQuan = @("Hà Nội","Hải Phòng","Đà Nẵng","TP.HCM","Cần Thơ","Bình Dương","Đồng Nai","Bà Rịa","Vũng Tàu","Quảng Ninh")

    for ($j = 0; $j -lt $STUDENTS_PER_CLASS; $j++) {
        $idx = $startIndex + $j
        $stt = $j + 1
        $maHV = "HV{0:D4}" -f ($idx + 1)
        $ho = $hoList[Get-Random -Maximum $hoList.Count]
        $ten = $tenList[Get-Random -Maximum $tenList.Count]
        $dem = $tenList[Get-Random -Maximum $tenList.Count]
        $hoTen = "$ho $dem $ten"
        $namSinh = Get-Random -Minimum 2006 -Maximum 2009
        $thang = Get-Random -Minimum 1 -Maximum 12
        $ngay = Get-Random -Minimum 1 -Maximum 28
        $ngaySinh = "{0:D2}/{1:D2}/{2}" -f $ngay, $thang, $namSinh
        $gt = $gioiTinh[Get-Random -Maximum $gioiTinh.Count]
        $qq = $queQuan[Get-Random -Maximum $queQuan.Count]
        $tk = "hv{0:D4}" -f ($idx + 1)
        $mk = "Hv@12345"

        # Escape CSV
        $row = @($stt, $maHV, "`"$hoTen`"", $ngaySinh, $gt, "`"$className`"", "`"$qq`"", $tk, $mk) -join ','
        $rows += $row
    }

    $csvContent = $rows -join "`r`n"
    $csvPath = "$env:TEMP\students_$className.csv"
    [System.IO.File]::WriteAllText($csvPath, $csvContent, [System.Text.Encoding]::UTF8)

    # Convert CSV -> XLSX qua node (xlsx package đã có)
    $xlsxPath = "$env:TEMP\students_$className.xlsx"
    $nodeScript = @"
const XLSX = require('xlsx');
const fs = require('fs');
const csv = fs.readFileSync('$csvPath', 'utf8');
const workbook = XLSX.utils.book_new();
const sheet = XLSX.utils.csv_to_sheet(csv);
XLSX.utils.book_append_sheet(workbook, sheet, 'Danh sach');
const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
fs.writeFileSync('$xlsxPath', buf);
console.log('Done');
"@
    $nodeScript | Out-File "$env:TEMP\convert_$className.js" -Encoding utf8
    node "$env:TEMP\convert_$className.js" | Out-Null

    return $xlsxPath
}

# Import cho từng lớp
$studentCount = 0
foreach ($c in $CLASSES) {
    $cid = $classIds[$c.name]
    $teacherUser = $TEACHERS[$c.teacherIndex].username
    $teacherToken = $teacherTokens[$teacherUser]

    Write-Host "  → Tạo file Excel cho lớp $($c.name) (học viên $($studentCount+1) - $($studentCount+$STUDENTS_PER_CLASS))..." -ForegroundColor Gray
    $xlsxFile = New-StudentExcel $c.name $c $studentCount
    $studentCount += $STUDENTS_PER_CLASS

    Write-Host "  → Import vào lớp $($c.name)..." -ForegroundColor Gray
    # Upload file qua multipart
    $bytes = [System.IO.File]::ReadAllBytes($xlsxFile)
    $content = New-Object System.Net.Http.MultipartFormDataContent
    $fileContent = New-Object System.Net.Http.ByteArrayContent(,$bytes)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    $content.Add($fileContent, "file", "students_$($c.name).xlsx")

    $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, "$BASE_URL/classes/$cid/import-students")
    $request.Headers.TryAddWithoutValidation("Authorization", "Bearer $teacherToken") | Out-Null
    $request.Content = $content

    $response = $http.SendAsync($request).GetAwaiter().GetResult()
    $raw = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $status = [int]$response.StatusCode

    if ($status -ge 200 -and $status -lt 300) {
        $data = $raw | ConvertFrom-Json
        Check "Import lớp $($c.name): tạo $($data.created) mới, ghi danh $($data.enrolled), bỏ qua $($data.skipped)" ($data.created -eq $STUDENTS_PER_CLASS -and $data.enrolled -eq $STUDENTS_PER_CLASS)
    } else {
        Check "Import lớp $($c.name) - Status $status: $raw" $false
    }

    # Cleanup
    Remove-Item $xlsxFile -ErrorAction SilentlyContinue
    Remove-Item "$env:TEMP\students_$($c.name).csv" -ErrorAction SilentlyContinue
    Remove-Item "$env:TEMP\convert_$($c.name).js" -ErrorAction SilentlyContinue
}

# --- 5. Kiểm tra kết quả ---
Write-Host ""
Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Kiểm tra kết quả..." -ForegroundColor Yellow

# Đếm số học viên trong mỗi lớp
foreach ($c in $CLASSES) {
    $cid = $classIds[$c.name]
    $teacherUser = $TEACHERS[$c.teacherIndex].username
    $teacherToken = $teacherTokens[$teacherUser]

    $detail = Invoke-Api "GET" "/classes/$cid" $teacherToken
    if ($detail.ok) {
        $count = $detail.data.students.Count
        Check "Lớp $($c.name): $count học viên" ($count -eq $STUDENTS_PER_CLASS)
    }
}

# Tổng hợp
Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  HOÀN TẤT SEED DỮ LIỆU" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  Giáo viên: 5 tài khoản" -ForegroundColor Green
Write-Host "  Lớp học: 4 lớp (12A1, 12A2, 12A3, 12A4)" -ForegroundColor Green
Write-Host "  Học viên: 60 tài khoản (15/lớp)" -ForegroundColor Green
Write-Host ""
Write-Host "Thông tin đăng nhập:" -ForegroundColor Yellow
Write-Host "  Admin:  $ADMIN_USER / $ADMIN_PASS" -ForegroundColor Gray
$TEACHERS | ForEach-Object { Write-Host "  GV:     $($_.username) / $($_.password)  [$($_.displayName) - $($_.subject)]" -ForegroundColor Gray }
Write-Host "  HV:     hv0001..hv0060 / Hv@12345" -ForegroundColor Gray
Write-Host ""
Write-Host "Mở http://localhost:5173 để kiểm tra" -ForegroundColor Cyan