[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$TargetDataDir,
    [string[]]$LegacyDataDirs = @()
)

$ErrorActionPreference = 'Stop'
$markerName = '.smartlecture-data-migration.json'

function Resolve-AbsolutePath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
}

function Get-DataFiles {
    param([Parameter(Mandatory = $true)][string]$Root)

    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return @() }
    return @(Get-ChildItem -LiteralPath $Root -File -Recurse -Force | Where-Object { $_.Name -ne $markerName })
}

function Get-DataManifest {
    param([Parameter(Mandatory = $true)][string]$Root)

    $absoluteRoot = Resolve-AbsolutePath -Path $Root
    return @(Get-DataFiles -Root $absoluteRoot | ForEach-Object {
        $relativePath = $_.FullName.Substring($absoluteRoot.Length).TrimStart('\', '/').Replace('\', '/')
        [pscustomobject]@{
            path = $relativePath
            length = $_.Length
            sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
        }
    } | Sort-Object path)
}

function Get-ManifestFingerprint {
    param([Parameter(Mandatory = $true)][object[]]$Manifest)

    $lines = @($Manifest | ForEach-Object { "$($_.path)|$($_.length)|$($_.sha256)" })
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha.ComputeHash($bytes)
        return (($hash | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally {
        $sha.Dispose()
    }
}

function Assert-ManifestsMatch {
    param(
        [Parameter(Mandatory = $true)][object[]]$Source,
        [Parameter(Mandatory = $true)][object[]]$Destination
    )

    $sourceJson = ConvertTo-Json -InputObject @($Source) -Compress
    $destinationJson = ConvertTo-Json -InputObject @($Destination) -Compress
    if ($sourceJson -cne $destinationJson) {
        throw 'Legacy data copy verification failed. The source was preserved; remove the incomplete staging directory and retry.'
    }
}

function Remove-StaleMigrationDirectories {
    param([Parameter(Mandatory = $true)][string]$Target)

    $parent = Split-Path -Parent $Target
    $leaf = Split-Path -Leaf $Target
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) { return }

    $expectedParent = Resolve-AbsolutePath -Path $parent
    $staleBefore = [DateTime]::UtcNow.AddMinutes(-15)
    Get-ChildItem -LiteralPath $parent -Directory -Force -Filter "$leaf.migrating-*" | Where-Object {
        $_.LastWriteTimeUtc -lt $staleBefore
    } | ForEach-Object {
        $candidateParent = Resolve-AbsolutePath -Path $_.Parent.FullName
        if ($candidateParent -ne $expectedParent -or -not $_.Name.StartsWith("$leaf.migrating-", [System.StringComparison]::Ordinal)) {
            throw "Refusing to remove unexpected migration path: $($_.FullName)"
        }
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }
}

$target = Resolve-AbsolutePath -Path $TargetDataDir
$targetParent = Split-Path -Parent $target
New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
Remove-StaleMigrationDirectories -Target $target

$legacyCandidates = @($LegacyDataDirs | Where-Object { $_ } | ForEach-Object { Resolve-AbsolutePath -Path $_ } | Select-Object -Unique)
$legacyWithData = @($legacyCandidates | Where-Object { $_ -ne $target -and (Get-DataFiles -Root $_).Count -gt 0 })
if ($legacyWithData.Count -gt 1) {
    throw "Multiple legacy SmartLecture data roots contain files: $($legacyWithData -join ', '). Select and migrate one root manually."
}

$targetFiles = @(Get-DataFiles -Root $target)
$markerPath = Join-Path $target $markerName
$source = if ($legacyWithData.Count -eq 1) { $legacyWithData[0] } else { $null }

if ($targetFiles.Count -gt 0 -or (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
    if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
        if ($source) {
            throw "Both the target and legacy SmartLecture data roots contain files. Target: $target. Legacy: $source. Refusing to merge automatically."
        }
        return [pscustomobject]@{ status = 'current'; target = $target; source = $null; fileCount = $targetFiles.Count }
    }

    $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
    if ($marker.version -ne 1 -or $marker.status -ne 'complete') {
        throw "The data migration marker is invalid or incomplete: $markerPath"
    }
    if ($source) {
        $markerSource = Resolve-AbsolutePath -Path ([string]$marker.sourcePath)
        if ($markerSource -ne $source) {
            throw "Both roots contain data but the migration marker references a different source. Target: $target. Legacy: $source."
        }
        $currentFingerprint = Get-ManifestFingerprint -Manifest (Get-DataManifest -Root $source)
        if ($currentFingerprint -ne [string]$marker.sourceManifestSha256) {
            throw "Legacy data changed after migration. Keep both roots and reconcile them manually before starting SmartLecture. Legacy: $source"
        }
    }
    return [pscustomobject]@{ status = 'current'; target = $target; source = $source; fileCount = $targetFiles.Count }
}

if (-not $source) {
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    return [pscustomobject]@{ status = 'initialized'; target = $target; source = $null; fileCount = 0 }
}

if (Test-Path -LiteralPath $target) {
    $remainingItems = @(Get-ChildItem -LiteralPath $target -Force)
    if ($remainingItems.Count -gt 0) {
        throw "Target data root is not empty: $target"
    }
    Remove-Item -LiteralPath $target -Force
}

$stage = "$target.migrating-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    Get-ChildItem -LiteralPath $source -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $stage -Recurse -Force
    }

    $sourceManifest = @(Get-DataManifest -Root $source)
    $stageManifest = @(Get-DataManifest -Root $stage)
    Assert-ManifestsMatch -Source $sourceManifest -Destination $stageManifest

    $marker = [ordered]@{
        version = 1
        status = 'complete'
        sourcePath = $source
        targetPath = $target
        migratedAtUtc = [DateTime]::UtcNow.ToString('o')
        fileCount = $sourceManifest.Count
        sourceManifestSha256 = Get-ManifestFingerprint -Manifest $sourceManifest
    }
    Set-Content -LiteralPath (Join-Path $stage $markerName) -Value ($marker | ConvertTo-Json) -Encoding utf8
    Move-Item -LiteralPath $stage -Destination $target
} catch {
    if (Test-Path -LiteralPath $stage) {
        Remove-Item -LiteralPath $stage -Recurse -Force
    }
    throw
}

return [pscustomobject]@{ status = 'migrated'; target = $target; source = $source; fileCount = $sourceManifest.Count }
