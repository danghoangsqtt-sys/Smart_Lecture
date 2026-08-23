$ErrorActionPreference = "Stop"
$BASE = "http://localhost:4100/api"
$script:pass = 0
$script:fail = 0

function Check($name, $cond) {
  if ($cond) { $script:pass++; Write-Host "  PASS  $name" -ForegroundColor Green }
  else { $script:fail++; Write-Host "  FAIL  $name" -ForegroundColor Red }
}

Add-Type -AssemblyName System.Net.Http
$script:http = New-Object System.Net.Http.HttpClient
$script:http.BaseAddress = "http://localhost:4100"

function Req($method, $url, $token, $body) {
  try {
    $request = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($method)), "/api$url")
    if ($token) { $request.Headers.TryAddWithoutValidation("Authorization", "Bearer $token") | Out-Null }
    if ($null -ne $body) {
      $json = $body | ConvertTo-Json -Depth 6
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
      $request.Content = New-Object System.Net.Http.ByteArrayContent(,$bytes)
      $request.Content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/json")
    }
    $response = $script:http.SendAsync($request).GetAwaiter().GetResult()
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
    return @{ ok = ($status -ge 200 -and $status -lt 300); status = $status; data = $data; code = $code; message = $message }
  } catch {
    return @{ ok = $false; status = 0; code = "CLIENT_ERR"; message = $_.Exception.Message }
  }
}

Write-Host ""
Write-Host "=== SMARTLECTURE E2E SMOKE TEST ===" -ForegroundColor Cyan

# --- Auth ---
$loginAdmin = Req POST "/auth/login" $null @{ username = "admin"; password = "admin123" }
$admin = $loginAdmin.data.token
Check "Admin login" ($admin.Length -gt 50)

$badLogin = Req POST "/auth/login" $null @{ username = "admin"; password = "wrongpass" }
Check ("Wrong password rejected (status={0})" -f $badLogin.status) ($badLogin.ok -eq $false -and $badLogin.status -eq 401)

# --- Users ---
$r1 = Req POST "/users" $admin @{ username = "teacher.hoa"; password = "Gv@123456"; role = "teacher"; displayName = "Co Hoa" }
Check "Create teacher" ($r1.ok -and $r1.data.user.role -eq "teacher")

$tLogin = Req POST "/auth/login" $null @{ username = "teacher.hoa"; password = "Gv@123456" }
$teacherToken = $tLogin.data.token
Check "Teacher login" ($teacherToken.Length -gt 50)

$r2 = Req POST "/users" $teacherToken @{ username = "t2x"; password = "x1234567"; role = "teacher"; displayName = "GV2" }
Check ("Teacher cannot create teacher (status={0} code={1})" -f $r2.status, $r2.code) ($r2.ok -eq $false -and $r2.status -eq 403)

$imp = Req POST "/users/import" $teacherToken @{
  rows = @(
    @{ displayName = "Nguyen Van Anh"; username = "anh" },
    @{ displayName = "Tran Thi Binh"; username = "binh" },
    @{ displayName = "Le Cuong"; username = "cuong" },
    @{ displayName = "Pham Dung"; username = "dung" }
  )
}
if (-not $imp.ok -or $imp.data.createdCount -ne 4) { Write-Host ("   DEBUG import: ok={0} created={1} errors={2}" -f $imp.ok, $imp.data.createdCount, ($imp.data.errors | ConvertTo-Json -Compress)) -ForegroundColor Yellow }
Check "Import 4 students" ($imp.ok -and $imp.data.createdCount -eq 4)

$usersList = Req GET "/users?role=student" $teacherToken
$sids = @($usersList.data.users | ForEach-Object { $_.id })
Check ("Teacher sees own students ({0})" -f $sids.Count) ($sids.Count -ge 4)

# --- Classes & enroll ---
$clsR = Req POST "/classes" $teacherToken @{ name = "Lop A1 Dien"; subject = "Nguon dien an toan"; academicYear = "2026-2027" }
$cid = $clsR.data.class.id
Check "Create class" ($cid.Length -gt 10)

$enroll = Req POST "/classes/$cid/enroll" $teacherToken @{ studentIds = $sids }
Check ("Enroll students ({0})" -f $enroll.data.added) ($enroll.ok -and $enroll.data.added -eq $sids.Count)

$detail = Req GET "/classes/$cid" $teacherToken
Check ("Class has {0} students" -f $detail.data.students.Count) ($detail.data.students.Count -ge 4)

# --- Lectures ---
$lecR = Req POST "/classes/$cid/lectures" $teacherToken @{ chapter = "Chuong 1"; title = "Khai niem dong dien"; description = "" }
$lid = $lecR.data.id
Check "Create lecture" ($lid.Length -gt 10)

$linkMat = Req POST "/lectures/$lid/materials/link" $teacherToken @{ title = "Video minh hoa"; linkUrl = "https://youtube.com/watch?v=abc" }
Check "Add link material" ($linkMat.data.id.Length -gt 10)

$lects = Req GET "/classes/$cid/lectures" $teacherToken
$matCount = 0
if ($lects.ok -and $lects.data.lectures.Count -gt 0) { $matCount = $lects.data.lectures[0].materials.Count }
Check "Lecture listed with material ($matCount)" ($matCount -eq 1)

# --- Questions ---
function NewQ($content, $options, $answer, $bloom) {
  $body = @{ type = "mcq"; content = $content; options = $options; correctAnswer = $answer; explanation = "Giai thich"; bloomLevel = $bloom; category = "Dien co ban"; folderId = $null }
  return (Req POST "/questions" $teacherToken $body).data.question.id
}
$q1 = NewQ "Don vi do cuong do dong dien la gi?" @("A. Ampe", "B. Von", "C. Oat", "D. Om") "A" "Nhan biet"
$q2 = NewQ "Cong thuc dinh luat Om?" @("A. U = I/R", "B. U = I x R", "C. I = U x R", "D. R = U x I") "B" "Thong hieu"
$q3 = NewQ "Khi tang dien tro, dong dien se?" @("A. Tang", "B. Giam", "C. Khong doi", "D. Bang 0") "B" "Van dung"
Check "Create 3 MCQ questions" ($q1.Length -gt 10 -and $q2.Length -gt 10 -and $q3.Length -gt 10)

$qeBody = @{ type = "essay"; content = "Trinh bay cac bien phap an toan khi lam viec voi dien ap thap."; correctAnswer = "Cat nguon, dung dung cu cach dien, co nguoi giam sat."; explanation = ""; bloomLevel = "Van dung cao"; folderId = $null }
$qe = Req POST "/questions" $teacherToken $qeBody
$essayId = $qe.data.question.id
Check "Create essay question" ($essayId.Length -gt 10)

$fld = Req POST "/questions/folders" $teacherToken @{ name = "De giua ky" }
Check "Create folder" ($fld.data.id.Length -gt 10)

$listF = Req GET "/questions?type=mcq&bloom=Nhan%20biet" $teacherToken
Check "Filter type+bloom works" ($listF.data.questions.Count -ge 1)

# --- Import text ---
$mauText = "PHAN I. TRAC NGHIEM`nCau 1: Thiet bi nao dung de do dien ap?`nA. Ampe ke`nB. Von ke`nC. Om ke`nD. Watt ke`nDap an: *B. Von ke do dien ap.`nCau 2: Dong dien mot chieu co chieu?`nA. Thay doi theo thoi gian`nB. Khong doi theo thoi gian`nC. Sinh hinh sin`nD. Ngau nhien`n`nBANG DAP AN`n1B 2B"
$imported = Req POST "/questions/import-text" $teacherToken @{ text = $mauText }
if ($imported.data.imported -ne 2) { Write-Host ("   DEBUG import-text: imported={0} warnings={1}" -f $imported.data.imported, ($imported.data.warnings -join "; ")) -ForegroundColor Yellow }
Check "Import text parsed 2 questions" ($imported.ok -and $imported.data.imported -eq 2)

# --- Exam ---
$examR = Req POST "/exams" $teacherToken @{
  title = "KT 15 phut Chuong 1"
  durationMin = 15
  questionIds = @($q1, $q2, $q3, $essayId)
  config = @{ purpose = "online_test"; class_id = $cid; shuffle_questions = $true; shuffle_options = $true; max_attempts = 1; password = "123" }
}
$eid = $examR.data.id
Check "Create exam" ($eid.Length -gt 10)

# --- Student flow ---
$anLogin = Req POST "/auth/login" $null @{ username = "anh"; password = "Hocvien@123" }
$anToken = $anLogin.data.token
if (-not $anLogin.ok) { Write-Host ("   DEBUG student login: status={0} code={1} msg={2}" -f $anLogin.status, $anLogin.code, $anLogin.message) -ForegroundColor Yellow }
Check "Student login temp password" ($anToken.Length -gt 50)

$avail = Req GET "/exams/available" $anToken
if (-not $avail.ok -or $avail.data.exams.Count -lt 1) { Write-Host ("   DEBUG available: ok={0} status={1} count={2}" -f $avail.ok, $avail.status, $avail.data.exams.Count) -ForegroundColor Yellow }
Check "Student sees available exam" ($avail.ok -and $avail.data.exams.Count -eq 1)

$wpw = Req POST "/exams/$eid/attempts" $anToken @{ password = "wrong" }
Check "Wrong exam password rejected" ($wpw.ok -eq $false -and $wpw.status -eq 403)

$attempt = Req POST "/exams/$eid/attempts" $anToken @{ password = "123" }
$aid = $attempt.data.attempt.id
Check ("Attempt created with {0}-question paper" -f $attempt.data.questions.Count) ($attempt.data.questions.Count -eq 4)
if ($attempt.ok) { $pj = ($attempt.data.questions | ConvertTo-Json -Depth 5 -Compress) } else { $pj = "" }
Check "Paper hides answers/correctAnswer" ((-not $pj.Contains("correctIdx")) -and (-not $pj.ToLower().Contains("correctanswer")))

# Build answers: match original option text in shuffled options
$answers = @{}
foreach ($pq in $attempt.data.questions) {
  if ($pq.type -eq "essay") { $answers[$pq.id] = "Cat nguon truoc khi lam viec."; continue }
  $target = $null
  if ($pq.content -like "*Ampe*") { $target = "^A[.\):]?\s*Ampe$" }
  elseif ($pq.content -like "*Om?*" -or $pq.content -like "*dinh luat*") { $target = "^B[.\):]?\s*U = I x R$" }
  elseif ($pq.content -like "*dien tro*") { $target = "^B[.\):]?\s*Giam$" }
  $idx = 0
  for ($i = 0; $i -lt $pq.options.Count; $i++) {
    if ($pq.options[$i] -match $target) { $idx = $i; break }
  }
  $answers[$pq.id] = [string][char](65 + $idx)
}

$save = Req PUT "/attempts/$aid/answers" $anToken @{ answers = $answers }
Check "Autosave answers OK" ($save.ok)

Req POST "/attempts/$aid/redflag" $anToken | Out-Null
Req POST "/attempts/$aid/redflag" $anToken | Out-Null

$submit = Req POST "/attempts/$aid/submit" $anToken @{ answers = $answers }
if ([Math]::Abs($submit.data.provisionalScore - 7.5) -gt 0.01) { Write-Host ("   DEBUG submit: provisional={0} full={1}" -f $submit.data.provisionalScore, $submit.data.fullyGraded) -ForegroundColor Yellow }
Check ("Provisional score = {0} (expect 10)" -f $submit.data.provisionalScore) ([Math]::Abs($submit.data.provisionalScore - 10) -lt 0.01)
Check "Essay pending -> not fully graded" ($submit.data.fullyGraded -eq $false)

$retry = Req POST "/exams/$eid/attempts" $anToken @{ password = "123" }
Check ("Max attempts enforced (code={0})" -f $retry.code) ($retry.ok -eq $false -and $retry.code -eq "MAX_ATTEMPTS")

# --- Teacher grading ---
$results = Req GET "/exams/$eid/results" $teacherToken
$row = $results.data.results | Where-Object { $_.resultId -eq $aid }
Check ("Red flags recorded = {0}" -f $row.redFlags) ($row.redFlags -eq 2)
Check "Essay question exposed for grading" ($results.data.essayQuestions.Count -eq 1)

$eqid = $results.data.essayQuestions[0].id
$graded = Req PUT "/results/$aid/essay-scores" $teacherToken @{ scores = @{ "$eqid" = 8 } }
Check ("Final score after essay=8 -> {0} (expect 9.5)" -f $graded.data.score) ([Math]::Abs($graded.data.score - 9.5) -lt 0.01)

$stats = Req GET "/exams/$eid/stats" $teacherToken
Check "Stats submittedCount >= 1" ($stats.data.submittedCount -ge 1)

$myres = Req GET "/my-results" $anToken
Check ("My-results score = {0}" -f $myres.data.results[0].score) ($myres.data.results[0].score -eq 9.5)

# --- Games ---
$game = Req POST "/games" $teacherToken @{ gameType = "quick_quiz"; questionIds = @($q1, $q2); secondsPerQuestion = 20 }
Check ("Game room code {0}" -f $game.data.roomCode) ($game.data.roomCode -match '^\d{6}$')

$pick1 = Req POST "/games/random-pick" $teacherToken @{ classId = $cid; count = 1 }
Check "Random pick 1 student" ($pick1.data.picked.Count -eq 1)
$pick2 = Req POST "/games/random-pick" $teacherToken @{ classId = $cid; count = 2 }
Check "Random pick 2 students" ($pick2.data.picked.Count -eq 2)

# --- Grades ---
$gid = $sids[0]
Req PUT "/classes/$cid/grades/$gid" $teacherToken @{ kttx = 8.5; process1 = 7; finalExam = $null } | Out-Null
$gb = Req GET "/classes/$cid/gradebook" $teacherToken
$gbRow = $gb.data.rows | Where-Object { $_.studentId -eq $gid }
Check ("Gradebook KTTX = {0}" -f $gbRow.kttx) ($gbRow.kttx -eq 8.5)

# --- Attendance ---
$sessR = Req POST "/classes/$cid/attendance/sessions" $teacherToken @{ date = "2026-08-23"; periodsTotal = 4; note = "Bai 1" }
$sessId = $sessR.data.id
$recs = @()
for ($i = 0; $i -lt $sids.Count; $i++) {
  $st = "present"; $ab = 0; $rs = ""
  if ($i -eq 1) { $st = "absent"; $ab = 2; $rs = "Om" }
  if ($i -eq 2) { $st = "late" }
  $recs += @{ studentId = $sids[$i]; status = $st; periodsAbsent = $ab; reason = $rs }
}
$attSave = Req PUT "/attendance/sessions/$sessId/records" $teacherToken @{ records = $recs }
Check "Attendance saved" ($attSave.ok)

$gb2 = Req GET "/classes/$cid/gradebook" $teacherToken
$absRow = $gb2.data.rows | Where-Object { $_.studentId -eq $sids[1] }
Check ("Absent summary: count={0} periods={1}" -f $absRow.absentCount, $absRow.periodsAbsent) ($absRow.absentCount -eq 1 -and $absRow.periodsAbsent -eq 2)

# --- Security ---
$sec1 = Req GET "/settings/gemini-key" $anToken
Check "Student blocked from AI settings" ($sec1.ok -eq $false -and $sec1.status -eq 403)
$sec2 = Req GET "/exams/$eid/results" $anToken
Check "Student blocked from results mgmt" ($sec2.ok -eq $false -and $sec2.status -eq 403)
$sec3 = Req GET "/users?role=admin" $anToken
Check "Student blocked from user list" ($sec3.ok -eq $false)

# --- P2: Fill question + auto grading ---
$fillR = Req POST "/questions" $teacherToken @{ type = "fill"; content = "Don vi do dien the la ___."; correctAnswer = "von"; explanation = ""; bloomLevel = "Nhan biet"; folderId = $null; options = @() }
Check "Create fill question" ($fillR.ok -and $fillR.data.question.id.Length -gt 10)

# --- P2: RAG upload txt -> ready (keyword mode, khong can API key) ---
$ragTxt = @"
Chuong 1: Nguon dien
Nguon dien la thiet bi tao ra dong dien trong mach dien. Pin va may phat dien la cac nguon dien thong dung.
An toan dien yeu cau cat nguon truoc khi thao tac.
"@
$tmpFile = "$env:TEMP\rag-test-$([guid]::NewGuid().ToString('N').Substring(0,6)).txt"
[System.IO.File]::WriteAllText($tmpFile, $ragTxt, (New-Object System.Text.UTF8Encoding $false))

$boundary = [guid]::NewGuid().ToString()
$hc = New-Object System.Net.Http.HttpClient
$hc.BaseAddress = "http://localhost:4100"
$hc.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $teacherToken)
$content = New-Object System.Net.Http.MultipartFormDataContent
$fileBytes = [System.IO.File]::ReadAllBytes($tmpFile)
$fileContent = New-Object System.Net.Http.ByteArrayContent(,$fileBytes)
$content.Add($fileContent, "file", "chuong1.txt")
$upResp = $hc.PostAsync("/api/rag/documents", $content).GetAwaiter().GetResult()
$ragOk = [int]$upResp.StatusCode -eq 201
$ragBody = $upResp.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
$ragId = $ragBody.id
Check "RAG upload txt (201)" $ragOk

Start-Sleep -Seconds 2
$docs = Req GET "/rag/documents" $teacherToken
$docRow = $docs.data.documents | Where-Object { $_.id -eq $ragId }
Check ("RAG doc status = {0}" -f $docRow.status) ($docRow.status -eq "ready")

$chat = Req POST "/rag/chat" $teacherToken @{ question = "Nguon dien la gi? Cac loai nao thong dung?" }
if (-not $chat.ok) { Write-Host ("   DEBUG chat: status={0} msg={1}" -f $chat.status, $chat.message) -ForegroundColor Yellow }
Check "RAG chat returns answer with source" ($chat.ok -and $chat.data.answer.Length -gt 10 -and $chat.data.sources.Count -ge 1)

$delDoc = Req DELETE "/rag/documents/$ragId" $teacherToken
Check "RAG delete doc" ($delDoc.ok)

# --- P2: new game types REST creation ---
$tugGame = Req POST "/games" $teacherToken @{ gameType = "tug_of_war"; questionIds = @($q1); secondsPerQuestion = 15 }
Check "Tug of war room created" ($tugGame.ok -and $tugGame.data.roomCode -match '^\d{6}$')
$mathGame = Req POST "/games" $teacherToken @{ gameType = "math_race"; durationSec = 90; difficulty = 2 }
Check "Math race room created" ($mathGame.ok -and $mathGame.data.roomCode -match '^\d{6}$')
# --- Lockout ---
for ($i = 0; $i -lt 10; $i++) { Req POST "/auth/login" $null @{ username = "cuong"; password = "saibietnaodo" } | Out-Null }
$cuongLocked = Req POST "/auth/login" $null @{ username = "cuong"; password = "Hocvien@123" }
Check ("Lockout after 10 fails (status={0})" -f $cuongLocked.status) ($cuongLocked.ok -eq $false -and $cuongLocked.status -eq 403)

Write-Host ""
Write-Host "==============================="
Write-Host (" RESULTS: {0} passed / {1} failed" -f $script:pass, $script:fail) -ForegroundColor $(if ($script:fail -eq 0) { "Green" } else { "Red" })
Write-Host "==============================="
