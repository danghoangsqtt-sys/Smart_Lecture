[CmdletBinding()]
param(
    [string]$DataDir = (Join-Path $env:LOCALAPPDATA 'SmartLecture\data'),
    [string]$Username
)

$ErrorActionPreference = 'Stop'
$node = Join-Path $PSScriptRoot 'runtime\node.exe'
$cli = Join-Path $PSScriptRoot 'app\server\dist\cli\recoverAdmin.js'
if (-not (Test-Path -LiteralPath $node)) { $node = (Get-Command node.exe -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $cli)) {
    $cli = Join-Path (Split-Path -Parent $PSScriptRoot) 'server\dist\cli\recoverAdmin.js'
}
if (-not (Test-Path -LiteralPath $cli)) { throw 'Khong tim thay recovery CLI. Hay build/cai dat lai SmartLecture.' }

$resolvedData = [System.IO.Path]::GetFullPath($DataDir)
Write-Host "Data directory: $resolvedData" -ForegroundColor Yellow
if (-not $Username) { $Username = Read-Host 'Ten dang nhap admin can khoi phuc' }
if (-not $Username) { throw 'Phai nhap ten dang nhap admin de xac nhan ro tai khoan dich.' }
$confirmation = Read-Host "Nhap lai chinh xac ten admin '$Username' de xac nhan"
$arguments = @($cli, '--data-dir', $resolvedData)
if ($Username) { $arguments += @('--username', $Username) }
$arguments += @('--confirm', $confirmation)
& $node $arguments
if ($LASTEXITCODE -ne 0) { throw "Khoi phuc admin that bai (exit code $LASTEXITCODE)." }
