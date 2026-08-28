[CmdletBinding()]
param(
    [int]$Port = 4000,
    [int]$ExpectedPid = 0,
    [int]$TimeoutSeconds = 10
)

$ErrorActionPreference = 'Stop'

function Fail([string]$message) {
    Write-Host "[FAIL] $message" -ForegroundColor Red
    exit 1
}

if ($ExpectedPid -gt 0) {
    $process = Get-Process -Id $ExpectedPid -ErrorAction SilentlyContinue
    if ($null -eq $process) { Fail "PID $ExpectedPid is stale or has already stopped." }
    if ($process.ProcessName -ne 'node') { Fail "PID $ExpectedPid is '$($process.ProcessName)', expected node." }
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
    if ($listeners.Count -gt 0) { break }
    Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $deadline)

if ($listeners.Count -eq 0) { Fail "No listener found on TCP port $Port within $TimeoutSeconds seconds." }
if ($ExpectedPid -gt 0 -and -not ($listeners | Where-Object { $_.OwningProcess -eq $ExpectedPid })) {
    Fail "PID $ExpectedPid is alive but does not own the listener on port $Port."
}

try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec $TimeoutSeconds
} catch {
    Fail "Health API is not ready on port ${Port}: $($_.Exception.Message)"
}

if ($response.ok -ne $true -or $response.name -ne 'SmartLecture') {
    Fail 'Health API responded, but its SmartLecture contract is invalid.'
}

Write-Host "[PASS] SmartLecture healthy: PID $($listeners[0].OwningProcess), port $Port, API contract OK." -ForegroundColor Green
