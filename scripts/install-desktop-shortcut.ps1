[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $PSScriptRoot
$launcherPath = Join-Path $PSScriptRoot 'start-smartlecture.ps1'
$iconPath = Join-Path $projectDir 'docs\icon\Icon_sm.ico'
$desktopDir = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopDir 'SmartLecture.lnk'
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

if (-not (Test-Path -LiteralPath $launcherPath)) {
    throw "Khong tim thay launcher: $launcherPath"
}
if (-not (Test-Path -LiteralPath $iconPath)) {
    throw "Khong tim thay icon: $iconPath"
}

$shell = New-Object -ComObject WScript.Shell
try {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $powershellPath
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcherPath`""
    $shortcut.WorkingDirectory = $projectDir
    $shortcut.Description = 'Mo SmartLecture tren may giao vien'
    $shortcut.IconLocation = $iconPath
    $shortcut.Save()
} finally {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
}

Write-Host "[OK] Da tao icon SmartLecture: $shortcutPath" -ForegroundColor Green
Write-Host '     Bam dup icon de mo ung dung. Server se tu khoi dong neu chua chay.'
