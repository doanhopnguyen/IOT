$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pio = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.platformio\penv\Scripts\platformio.exe'
if (-not (Test-Path -LiteralPath $pio)) { throw 'Install PlatformIO before building firmware.' }
$releases = Join-Path $projectRoot '.local\releases'
New-Item -ItemType Directory -Path $releases -Force | Out-Null
$builds = @(
    @{ Environment='esp32-s3-connected'; Version='1.18.0'; File='firmware-base-1.18.0.bin' },
    @{ Environment='esp32-s3-ota-demo'; Version='2.0.5-demo'; File='firmware-v2.0.5-demo.bin' },
    @{ Environment='esp32-s3-ota-red'; Version='2.0.6-demo'; File='firmware-v2.0.6-demo.bin' },
    @{ Environment='esp32-s3-ota-black'; Version='2.0.7-demo'; File='firmware-v2.0.7-demo.bin' }
)
$manifest = @()
Push-Location (Join-Path $projectRoot 'firmware')
try {
    foreach ($build in $builds) {
        & $pio run -c platformio.connected.ini -e $build.Environment
        if ($LASTEXITCODE -ne 0) { throw "Build failed for $($build.Environment)." }
        $source = Join-Path ".pio\connected-door-build\$($build.Environment)" 'firmware.bin'
        $destination = Join-Path $releases $build.File
        $bytes = [IO.File]::ReadAllBytes((Join-Path (Get-Location).Path $source))
        $identity = 'SMARTDOOR_OTA_V1|' + $build.Version + [char]0
        if (-not [Text.Encoding]::ASCII.GetString($bytes).Contains($identity)) { throw 'Firmware version does not match release metadata.' }
        Copy-Item -LiteralPath $source -Destination $destination
        $manifest += [ordered]@{ file=$build.File; version=$build.Version; hardwareVersion='esp32s3-n16r8'; size=$bytes.Length; sha256=(Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
} finally { Pop-Location }
[IO.File]::WriteAllText((Join-Path $releases 'firmware-manifest.json'), ($manifest | ConvertTo-Json -Depth 3), [Text.UTF8Encoding]::new($false))
Write-Host "OTA binaries and SHA-256 manifest: $releases"
Write-Host 'Upload firmware-v2.0.7-demo.bin through admin > Cap nhat firmware. This script does not flash USB or modify device data.'
