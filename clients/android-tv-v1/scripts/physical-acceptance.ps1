param(
    [Parameter(Mandatory = $true)]
    [string]$ApkPath,
    [string]$PackageId = "com.boltbytes.boltbytes_media.tv",
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$resolvedApk = (Resolve-Path -LiteralPath $ApkPath).Path
$adbCommand = Get-Command adb -ErrorAction SilentlyContinue
$adbCandidates = @()
if ($null -ne $adbCommand) { $adbCandidates += $adbCommand.Source }
if ($env:ANDROID_HOME) { $adbCandidates += (Join-Path $env:ANDROID_HOME "platform-tools\adb.exe") }
$adbCandidates += (Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe")
$adb = $adbCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $adb) {
    throw "ADB blev ikke fundet på PATH, ANDROID_HOME eller i den lokale Android SDK."
}

$devices = & $adb devices -l
$connected = @($devices | Select-String -Pattern "\sdevice\s")
if ($connected.Count -ne 1) {
    throw "Acceptance kræver præcis én autoriseret ADB-enhed. Fundet: $($connected.Count)."
}

$hash = (Get-FileHash -LiteralPath $resolvedApk -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "APK: $resolvedApk"
Write-Host "SHA256: $hash"
Write-Host ($devices -join [Environment]::NewLine)

if (-not $Install) {
    Write-Host "Read-only gate bestået. Kør igen med -Install efter eksplicit godkendelse til installation."
    exit 0
}

& $adb install -r -- $resolvedApk
& $adb shell monkey -p $PackageId -c android.intent.category.LEANBACK_LAUNCHER 1
Start-Sleep -Seconds 10
& $adb shell pidof $PackageId
& $adb logcat -d -t 1500 | Select-String -Pattern "FATAL EXCEPTION|ANR in|$PackageId"
