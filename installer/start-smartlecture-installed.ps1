[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 4000,
    [ValidateRange(1, 60)]
    [int]$TimeoutSeconds = 20,
    [string]$DataDir,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$appDir = Join-Path $PSScriptRoot 'app'
$serverDir = Join-Path $appDir 'server'
$serverEntry = Join-Path $serverDir 'dist\index.js'
$webEntry = Join-Path $appDir 'web\dist\index.html'
$node = Join-Path $PSScriptRoot 'runtime\node.exe'
$dataDir = if ($DataDir) { [System.IO.Path]::GetFullPath($DataDir) } else { Join-Path $env:LOCALAPPDATA 'SmartLecture\data' }
$prepareData = Join-Path $PSScriptRoot 'prepare-smartlecture-data.ps1'
$url = "http://127.0.0.1:$Port"

function Test-SmartLectureHealth {
    try {
        $response = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 2
        return $response.ok -eq $true -and $response.name -eq 'SmartLecture'
    } catch {
        return $false
    }
}

function Open-SmartLecture {
    if (-not $NoBrowser) {
        Start-Process $url
    }
}

if (-not (Test-Path -LiteralPath $node) -or -not (Test-Path -LiteralPath $serverEntry) -or -not (Test-Path -LiteralPath $webEntry) -or -not (Test-Path -LiteralPath $prepareData)) {
    throw 'Bo cai SmartLecture thieu runtime hoac production build. Hay cai dat lai ung dung.'
}

if (Test-SmartLectureHealth) {
    Open-SmartLecture
    exit 0
}

$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
    throw "Cong $Port dang duoc mot ung dung khac su dung. SmartLecture se khong tu dung ung dung do."
}

$legacyDataDirs = @()
if (-not $DataDir) {
    $legacyDataDirs += Join-Path $appDir 'data'
    if ($env:SMARTLECTURE_LEGACY_DATA_DIR) {
        $legacyDataDirs += $env:SMARTLECTURE_LEGACY_DATA_DIR
    }
    $legacyUninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{BD9F49AD-2D69-4D62-83B1-77C9EB043B17}_is1'
    if (Test-Path -LiteralPath $legacyUninstallKey) {
        $legacyInstallLocation = (Get-ItemProperty -LiteralPath $legacyUninstallKey -Name InstallLocation -ErrorAction SilentlyContinue).InstallLocation
        if ($legacyInstallLocation) {
            $legacyDataDirs += Join-Path $legacyInstallLocation 'app\data'
        }
    }
}
$migration = & $prepareData -TargetDataDir $dataDir -LegacyDataDirs $legacyDataDirs
if ($migration.status -eq 'migrated') {
    Write-Host "[OK] Da sao chep du lieu cu sang $dataDir. Du lieu cu van duoc giu lai de khoi phuc." -ForegroundColor Green
}

$logDir = Join-Path $dataDir 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stdoutLog = Join-Path $logDir 'smartlecture-server.out.log'
$stderrLog = Join-Path $logDir 'smartlecture-server.err.log'

$previousPort = $env:PORT
$previousDataDir = $env:DATA_DIR
try {
    $env:PORT = "$Port"
    $env:DATA_DIR = $dataDir
    $server = Start-Process -FilePath $node -ArgumentList 'dist/index.js' -WorkingDirectory $serverDir -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
} finally {
    if ($null -eq $previousPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue } else { $env:PORT = $previousPort }
    if ($null -eq $previousDataDir) { Remove-Item Env:DATA_DIR -ErrorAction SilentlyContinue } else { $env:DATA_DIR = $previousDataDir }
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
    Start-Sleep -Milliseconds 250
    if (Test-SmartLectureHealth) {
        Open-SmartLecture
        exit 0
    }
    $server.Refresh()
    if ($server.HasExited) {
        throw "SmartLecture khong the khoi dong. Xem log: $stderrLog"
    }
} while ((Get-Date) -lt $deadline)

if (-not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
}
throw "SmartLecture chua san sang sau $TimeoutSeconds giay. Xem log: $stderrLog"
