[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$helper = Join-Path $root 'installer\prepare-smartlecture-data.ps1'
$sandbox = Join-Path ([System.IO.Path]::GetTempPath()) "smartlecture-data-migration-$([guid]::NewGuid().ToString('N'))"
$passed = 0

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "ASSERTION FAILED: $Message" }
}

function Assert-ThrowsLike {
    param([scriptblock]$Action, [string]$Pattern, [string]$Message)
    try {
        & $Action
    } catch {
        if ($_.Exception.Message -match $Pattern) { return }
        throw "ASSERTION FAILED: $Message. Actual error: $($_.Exception.Message)"
    }
    throw "ASSERTION FAILED: $Message. No error was thrown."
}

function Pass {
    param([string]$Message)
    $script:passed += 1
    Write-Host "PASS  $Message" -ForegroundColor Green
}

New-Item -ItemType Directory -Path $sandbox | Out-Null
try {
    $emptyTarget = Join-Path $sandbox 'empty-target'
    $emptyResult = & $helper -TargetDataDir $emptyTarget
    Assert-True ($emptyResult.status -eq 'initialized') 'empty target should be initialized'
    Assert-True (Test-Path -LiteralPath $emptyTarget -PathType Container) 'empty target directory should exist'
    Pass 'initializes a new per-user data root'

    $legacy = Join-Path $sandbox 'legacy\data'
    $target = Join-Path $sandbox 'localappdata\SmartLecture\data'
    New-Item -ItemType Directory -Path (Join-Path $legacy 'media\nested'), (Join-Path $legacy 'backups'), (Join-Path $legacy 'drop') -Force | Out-Null
    $previousTestDb = $env:SMARTLECTURE_TEST_DB
    try {
        $env:SMARTLECTURE_TEST_DB = Join-Path $legacy 'smart-lecture.db'
        & node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.env.SMARTLECTURE_TEST_DB); db.exec('CREATE TABLE migration_sentinel (value TEXT NOT NULL)'); db.prepare('INSERT INTO migration_sentinel VALUES (?)').run('keep-me'); db.close();"
        if ($LASTEXITCODE -ne 0) { throw 'Unable to create the SQLite migration sentinel.' }
    } finally {
        if ($null -eq $previousTestDb) { Remove-Item Env:SMARTLECTURE_TEST_DB -ErrorAction SilentlyContinue } else { $env:SMARTLECTURE_TEST_DB = $previousTestDb }
    }
    Set-Content -LiteralPath (Join-Path $legacy 'smart-lecture.db-wal') -Value 'sentinel-wal' -Encoding utf8
    Set-Content -LiteralPath (Join-Path $legacy 'secret.key') -Value 'sentinel-secret' -Encoding utf8
    Set-Content -LiteralPath (Join-Path $legacy 'media\nested\lesson.bin') -Value 'sentinel-media' -Encoding utf8

    $migration = & $helper -TargetDataDir $target -LegacyDataDirs $legacy
    Assert-True ($migration.status -eq 'migrated') 'legacy data should migrate'
    Assert-True (Test-Path -LiteralPath (Join-Path $target 'smart-lecture.db')) 'database should reach target'
    Assert-True (Test-Path -LiteralPath (Join-Path $target 'smart-lecture.db-wal')) 'WAL should reach target'
    Assert-True (Test-Path -LiteralPath (Join-Path $target 'media\nested\lesson.bin')) 'nested media should reach target'
    Assert-True (Test-Path -LiteralPath (Join-Path $target '.smartlecture-data-migration.json')) 'completion marker should exist'
    Assert-True (Test-Path -LiteralPath (Join-Path $legacy 'smart-lecture.db')) 'legacy source should remain as rollback copy'
    try {
        $env:SMARTLECTURE_TEST_DB = Join-Path $target 'smart-lecture.db'
        $sentinel = & node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.env.SMARTLECTURE_TEST_DB, { readOnly: true }); console.log(db.prepare('SELECT value FROM migration_sentinel').get().value); db.close();"
        if ($LASTEXITCODE -ne 0) { throw 'Unable to read the migrated SQLite sentinel.' }
    } finally {
        if ($null -eq $previousTestDb) { Remove-Item Env:SMARTLECTURE_TEST_DB -ErrorAction SilentlyContinue } else { $env:SMARTLECTURE_TEST_DB = $previousTestDb }
    }
    Assert-True ($sentinel.Trim() -eq 'keep-me') 'SQLite sentinel row should survive migration'
    Pass 'copies and verifies legacy DB/WAL/media while preserving source'

    $retry = & $helper -TargetDataDir $target -LegacyDataDirs $legacy
    Assert-True ($retry.status -eq 'current') 'completed migration should be idempotent'
    Pass 'accepts an unchanged completed migration on retry'

    Add-Content -LiteralPath (Join-Path $legacy 'smart-lecture.db') -Value 'changed-after-migration'
    Assert-ThrowsLike { & $helper -TargetDataDir $target -LegacyDataDirs $legacy } 'changed after migration' 'changed legacy source must not be ignored'
    Pass 'refuses divergent legacy data after migration'

    $collisionLegacy = Join-Path $sandbox 'collision-legacy'
    $collisionTarget = Join-Path $sandbox 'collision-target'
    New-Item -ItemType Directory -Path $collisionLegacy, $collisionTarget | Out-Null
    Set-Content -LiteralPath (Join-Path $collisionLegacy 'smart-lecture.db') -Value 'legacy' -Encoding utf8
    Set-Content -LiteralPath (Join-Path $collisionTarget 'smart-lecture.db') -Value 'target' -Encoding utf8
    Assert-ThrowsLike { & $helper -TargetDataDir $collisionTarget -LegacyDataDirs $collisionLegacy } 'Both the target and legacy' 'two populated roots must not merge'
    Pass 'refuses an unmarked target/legacy collision'

    $interruptedTarget = Join-Path $sandbox 'interrupted-target'
    $staleStage = "$interruptedTarget.migrating-stale"
    New-Item -ItemType Directory -Path $staleStage | Out-Null
    Set-Content -LiteralPath (Join-Path $staleStage 'partial.db') -Value 'partial' -Encoding utf8
    (Get-Item -LiteralPath $staleStage).LastWriteTimeUtc = [DateTime]::UtcNow.AddHours(-1)
    $interruptedResult = & $helper -TargetDataDir $interruptedTarget
    Assert-True ($interruptedResult.status -eq 'initialized') 'interrupted target should initialize after cleanup'
    Assert-True (-not (Test-Path -LiteralPath $staleStage)) 'stale staging directory should be removed'
    Pass 'cleans a scoped interrupted staging directory before retry'

    Write-Host "Installed data migration: $passed/6 passed" -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $sandbox) {
        Remove-Item -LiteralPath $sandbox -Recurse -Force
    }
}
