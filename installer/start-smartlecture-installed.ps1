[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 4000,
    [ValidateRange(1, 60)]
    [int]$TimeoutSeconds = 20,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$appDir = Join-Path $PSScriptRoot 'app'
$serverDir = Join-Path $appDir 'server'
$serverEntry = Join-Path $serverDir 'dist\index.js'
$webEntry = Join-Path $appDir 'web\dist\index.html'
$node = Join-Path $PSScriptRoot 'runtime\node.exe'
$dataDir = Join-Path $env:LOCALAPPDATA 'SmartLecture\data'
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

if (-not (Test-Path -LiteralPath $node) -or -not (Test-Path -LiteralPath $serverEntry) -or -not (Test-Path -LiteralPath $webEntry)) {
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
