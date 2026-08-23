# Cai dat khoi dong cung Windows cho SmartLecture Server
# Chay voi quyen thong thuong (khong can admin): tao Scheduled Task cho user hien tai

$projectDir = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $projectDir "server"
$node = (Get-Command node).Source
$taskName = "SmartLectureServer"

$action = New-ScheduledTaskAction -Execute $node -Argument "dist/index.js" -WorkingDirectory $serverDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "SmartLecture LMS server (auto-start at login)" -Force | Out-Null

Write-Host ""
Write-Host "[OK] Da cai dat task '$taskName'" -ForegroundColor Green
Write-Host "     - Tu dong chay moi khi ban dang nhap Windows"
Write-Host "     - Thu muc: $serverDir"
Write-Host ""
Write-Host "Khoi dong ngay bay gio?  Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Xoa autostart:           powershell -File scripts/uninstall-autostart.ps1"
