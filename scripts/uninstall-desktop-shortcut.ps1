[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'SmartLecture.lnk'
if (-not (Test-Path -LiteralPath $shortcutPath)) {
    Write-Host '[OK] Khong co icon SmartLecture de go.' -ForegroundColor Yellow
    exit 0
}

Remove-Item -LiteralPath $shortcutPath
Write-Host "[OK] Da go icon SmartLecture: $shortcutPath" -ForegroundColor Green
