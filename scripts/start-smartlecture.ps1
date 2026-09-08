[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 4000,
    [string]$DataDir,
    [ValidateRange(1, 60)]
    [int]$TimeoutSeconds = 20,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $projectDir 'server'
$serverEntry = Join-Path $serverDir 'dist\index.js'
$webEntry = Join-Path $projectDir 'web\dist\index.html'
$url = "http://127.0.0.1:$Port"

function Test-SmartLectureHealth {
    param([int]$HealthPort)

    try {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:$HealthPort/api/health" -TimeoutSec 2
        return $response.ok -eq $true -and $response.name -eq 'SmartLecture'
    } catch {
        return $false
    }
}

function Get-PortListener {
    param([int]$ListenerPort)

    return @(Get-NetTCPConnection -State Listen -LocalPort $ListenerPort -ErrorAction SilentlyContinue)
}

function Open-SmartLecture {
    if (-not $NoBrowser) {
        Start-Process $url
    }
}

if (-not (Test-Path -LiteralPath $serverEntry) -or -not (Test-Path -LiteralPath $webEntry)) {
    throw 'Chua co production build. Hay chay "npm run build" sau khi cap nhat ma nguon, roi mo lai SmartLecture.'
}

if (Test-SmartLectureHealth -HealthPort $Port) {
    Write-Host "[OK] SmartLecture dang san sang tai $url" -ForegroundColor Green
    Open-SmartLecture
    exit 0
}

$listeners = Get-PortListener -ListenerPort $Port
if ($listeners.Count -gt 0) {
    $deadline = (Get-Date).AddSeconds(5)
    do {
        Start-Sleep -Milliseconds 250
        if (Test-SmartLectureHealth -HealthPort $Port) {
            Write-Host "[OK] SmartLecture da san sang tai $url" -ForegroundColor Green
            Open-SmartLecture
            exit 0
        }
    } while ((Get-Date) -lt $deadline)

    $ownerPid = $listeners[0].OwningProcess
    throw "Cong $Port dang do tien trinh PID $ownerPid su dung nhung khong phai SmartLecture. Launcher se khong tu dung tien trinh nay."
}

$bundledNode = Join-Path $projectDir 'node\node.exe'
$node = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node -ErrorAction Stop).Source }
$runtimeDir = if ($DataDir) {
    [System.IO.Path]::GetFullPath($DataDir)
} elseif (Test-Path -LiteralPath $bundledNode) {
    Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'SmartLecture\data'
} else {
    Join-Path $projectDir 'data'
}
$logDir = Join-Path $runtimeDir 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stdoutLog = Join-Path $logDir 'smartlecture-server.out.log'
$stderrLog = Join-Path $logDir 'smartlecture-server.err.log'

$previousPort = $env:PORT
$previousDataDir = $env:DATA_DIR
try {
    $env:PORT = "$Port"
    if ($DataDir) {
        $env:DATA_DIR = $runtimeDir
    }

    $server = Start-Process -FilePath $node -ArgumentList 'dist/index.js' -WorkingDirectory $serverDir -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
} finally {
    if ($null -eq $previousPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue } else { $env:PORT = $previousPort }
    if ($null -eq $previousDataDir) { Remove-Item Env:DATA_DIR -ErrorAction SilentlyContinue } else { $env:DATA_DIR = $previousDataDir }
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
    Start-Sleep -Milliseconds 250
    if (Test-SmartLectureHealth -HealthPort $Port) {
        Write-Host "[OK] SmartLecture da khoi dong tai $url" -ForegroundColor Green
        Open-SmartLecture
        exit 0
    }

    $server.Refresh()
    if ($server.HasExited) {
        throw "SmartLecture khong the khoi dong (exit code $($server.ExitCode)). Xem log: $stderrLog"
    }
} while ((Get-Date) -lt $deadline)

if (-not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
}
throw "SmartLecture chua san sang sau $TimeoutSeconds giay. Tien trinh vua khoi tao da duoc dung; xem log: $stderrLog"
