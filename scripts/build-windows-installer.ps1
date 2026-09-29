[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$KeepStaging
)

$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $projectDir 'release'
$stageDir = Join-Path $releaseDir 'installer-stage'
$stageAppDir = Join-Path $stageDir 'app'
$stageRuntimeDir = Join-Path $stageDir 'runtime'
$package = Get-Content -Raw -LiteralPath (Join-Path $projectDir 'package.json') | ConvertFrom-Json
$version = $package.version
$expectedStage = [System.IO.Path]::GetFullPath((Join-Path $projectDir 'release\installer-stage'))
$resolvedStage = [System.IO.Path]::GetFullPath($stageDir)

if ($resolvedStage -ne $expectedStage -or -not $resolvedStage.StartsWith([System.IO.Path]::GetFullPath($projectDir), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Invalid staging path: $resolvedStage"
}

$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$node = (Get-Command node.exe -ErrorAction Stop).Source
$isccCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
    (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
)
$iscc = $isccCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $iscc) {
    throw 'Inno Setup 6 not found. Install it with: winget install --id JRSoftware.InnoSetup --exact --source winget'
}

if (-not $SkipBuild) {
    & $npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
}

if (Test-Path -LiteralPath $stageDir) {
    Remove-Item -LiteralPath $stageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stageAppDir, $stageRuntimeDir -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $projectDir 'package.json'), (Join-Path $projectDir 'package-lock.json') -Destination $stageAppDir
New-Item -ItemType Directory -Path (Join-Path $stageAppDir 'server'), (Join-Path $stageAppDir 'web') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectDir 'server\package.json') -Destination (Join-Path $stageAppDir 'server')
Copy-Item -LiteralPath (Join-Path $projectDir 'web\package.json') -Destination (Join-Path $stageAppDir 'web')
Copy-Item -LiteralPath (Join-Path $projectDir 'server\dist') -Destination (Join-Path $stageAppDir 'server') -Recurse
Copy-Item -LiteralPath (Join-Path $projectDir 'web\dist') -Destination (Join-Path $stageAppDir 'web') -Recurse

Push-Location $stageAppDir
try {
    & $npm ci --omit=dev --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Production dependency install failed.' }
} finally {
    Pop-Location
}

Copy-Item -LiteralPath $node -Destination (Join-Path $stageRuntimeDir 'node.exe')
Copy-Item -LiteralPath (Join-Path $projectDir 'installer\start-smartlecture-installed.ps1') -Destination (Join-Path $stageDir 'start-smartlecture.ps1')
Copy-Item -LiteralPath (Join-Path $projectDir 'installer\prepare-smartlecture-data.ps1') -Destination (Join-Path $stageDir 'prepare-smartlecture-data.ps1')
Copy-Item -LiteralPath (Join-Path $projectDir 'installer\recover-admin.ps1') -Destination (Join-Path $stageDir 'recover-admin.ps1')
Copy-Item -LiteralPath (Join-Path $projectDir 'docs\HUONG-DAN-CAI-DAT.md') -Destination (Join-Path $stageDir 'HUONG-DAN-CAI-DAT.md')

$smokeData = Join-Path $stageDir 'smoke-data'
$smokePort = 4399
$previousPort = $env:PORT
$previousDataDir = $env:DATA_DIR
try {
    $env:PORT = "$smokePort"
    $env:DATA_DIR = $smokeData
    $smoke = Start-Process -FilePath (Join-Path $stageRuntimeDir 'node.exe') -ArgumentList 'dist/index.js' -WorkingDirectory (Join-Path $stageAppDir 'server') -WindowStyle Hidden -PassThru
} finally {
    if ($null -eq $previousPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue } else { $env:PORT = $previousPort }
    if ($null -eq $previousDataDir) { Remove-Item Env:DATA_DIR -ErrorAction SilentlyContinue } else { $env:DATA_DIR = $previousDataDir }
}
try {
    $health = $null
    $deadline = (Get-Date).AddSeconds(20)
    do {
        Start-Sleep -Milliseconds 250
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$smokePort/api/health" -TimeoutSec 2
            if ($health.ok -eq $true) { break }
        } catch {}
        $smoke.Refresh()
        if ($smoke.HasExited) { throw 'Staged payload exited before becoming healthy.' }
    } while ((Get-Date) -lt $deadline)
    if (-not $health -or $health.ok -ne $true) { throw 'Staged payload healthcheck timed out.' }
} finally {
    if (-not $smoke.HasExited) {
        Stop-Process -Id $smoke.Id -Force
        Wait-Process -Id $smoke.Id -Timeout 10 -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $smokeData) {
        for ($attempt = 1; $attempt -le 10; $attempt++) {
            try {
                Remove-Item -LiteralPath $smokeData -Recurse -Force
                break
            } catch {
                if ($attempt -eq 10) { throw }
                Start-Sleep -Milliseconds 250
            }
        }
    }
}

& $iscc '/Qp' "/DAppVersion=$version" "/DSourceDir=$stageDir" "/DOutputDir=$releaseDir" (Join-Path $projectDir 'installer\SmartLecture.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }

$installer = Join-Path $releaseDir "SmartLecture-Setup-$version.exe"
if (-not (Test-Path -LiteralPath $installer)) { throw "Installer was not created: $installer" }
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash.ToLowerInvariant()
$checksumPath = "$installer.sha256"
Set-Content -LiteralPath $checksumPath -Value "$hash  $(Split-Path -Leaf $installer)" -Encoding ASCII

if (-not $KeepStaging -and (Test-Path -LiteralPath $stageDir)) {
    Remove-Item -LiteralPath $stageDir -Recurse -Force
}

Write-Host "[OK] Installer: $installer" -ForegroundColor Green
Write-Host "[OK] SHA-256:  $hash" -ForegroundColor Green
