[CmdletBinding()]
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $projectDir 'release'
$stagingDir = Join-Path $releaseDir 'staging'
$appDir = Join-Path $stagingDir 'app'
$package = Get-Content -Raw (Join-Path $projectDir 'package.json') | ConvertFrom-Json
$version = $package.version

function Copy-ReleaseDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    & robocopy $Source $Destination /E /COPY:DAT /DCOPY:DAT /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -gt 7) {
        throw "robocopy failed while staging $Source (exit code $LASTEXITCODE)."
    }
}

function Find-InnoCompiler {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
        'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
        'C:\Program Files\Inno Setup 6\ISCC.exe'
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }

    throw 'Inno Setup 6 was not found. Install it with: winget install --exact --id JRSoftware.InnoSetup'
}

if (-not $SkipBuild) {
    Push-Location $projectDir
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
    } finally {
        Pop-Location
    }
}

$requiredFiles = @(
    (Join-Path $projectDir 'server\dist\index.js'),
    (Join-Path $projectDir 'web\dist\index.html'),
    (Join-Path $projectDir 'node_modules'),
    (Get-Command node -ErrorAction Stop).Source
)
foreach ($requiredFile in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $requiredFile)) {
        throw "Release prerequisite is missing: $requiredFile"
    }
}

if (Test-Path -LiteralPath $stagingDir) {
    Remove-Item -LiteralPath $stagingDir -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $appDir 'server'), (Join-Path $appDir 'web'), (Join-Path $appDir 'node'), (Join-Path $appDir 'scripts'), (Join-Path $appDir 'docs') -Force | Out-Null

Copy-ReleaseDirectory -Source (Join-Path $projectDir 'server\dist') -Destination (Join-Path $appDir 'server\dist')
Copy-ReleaseDirectory -Source (Join-Path $projectDir 'web\dist') -Destination (Join-Path $appDir 'web\dist')
Copy-ReleaseDirectory -Source (Join-Path $projectDir 'node_modules') -Destination (Join-Path $appDir 'node_modules')
Copy-Item -LiteralPath (Get-Command node -ErrorAction Stop).Source -Destination (Join-Path $appDir 'node\node.exe') -Force
Copy-Item -LiteralPath (Join-Path $projectDir 'scripts\start-smartlecture.ps1') -Destination (Join-Path $appDir 'scripts\start-smartlecture.ps1') -Force
Copy-Item -LiteralPath (Join-Path $projectDir 'docs\HUONG-DAN-CAI-DAT.md') -Destination (Join-Path $appDir 'docs\HUONG-DAN-CAI-DAT.md') -Force

$forbiddenPaths = @('.git', 'data', '.env', 'server\src', 'web\src')
foreach ($forbiddenPath in $forbiddenPaths) {
    if (Test-Path -LiteralPath (Join-Path $appDir $forbiddenPath)) {
        throw "Forbidden release content found: $forbiddenPath"
    }
}

$iscc = Find-InnoCompiler
$installerScript = Join-Path $projectDir 'installer\SmartLecture.iss'
& $iscc "/DAppVersion=$version" $installerScript
if ($LASTEXITCODE -ne 0) {
    throw "Inno Setup compilation failed (exit code $LASTEXITCODE)."
}

$installerPath = Join-Path $releaseDir "SmartLecture-Setup-$version.exe"
if (-not (Test-Path -LiteralPath $installerPath)) {
    throw "Inno Setup completed but did not create $installerPath"
}

Write-Host "[OK] Windows installer created: $installerPath" -ForegroundColor Green
