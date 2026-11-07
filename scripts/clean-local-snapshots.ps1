param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$localRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot '.local')).Path
if (Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(1884,8080,8081,8091) }) {
    throw 'Stop project services before removing private snapshots and runtime archives.'
}
# These are generated snapshots inspected during the 2026-11-07 reset, not source/dependencies.
$relativePaths = @(
    'before-buyer-reset-flash.bin', 'buyer-reset-restore.bin', 'esp32-cleanup\blank-16mb.bin',
    'display-rotation-20261106\firmware-before.bin', 'factory-reset-20261106\firmware-before.bin',
    'offline-servo-guide-20261106\firmware-before.bin', 'offline-servo-guide-20261106\nvs-before.bin',
    'onboarding-20261106\firmware-before.bin', 'onboarding-20261106\nvs-before.bin',
    'servo-startup-20261106\firmware-before.bin', 'servo-angles-20261106\firmware-before.bin',
    'servo-angles-20261106\nvs-before.bin', 'servo-angles-20261106\nvs-after.bin',
    'servo-app-20261106\firmware-before.bin', 'servo-app-20261106\nvs-before.bin',
    'session-20261106\before-reset-flash.bin', 'session-20261106\database-before-reset.json',
    'session-20261106\runtime.json.backup', 'session-20261106\FACTORY_ESP32-80B54EC8149C.json.backup',
    'session-20261106\FACTORY_CONNECTION.json.backup', 'retest-20261106\nvs-before.bin',
    'retest-20261106\hardware-connection.json', 'retest-20261106\camera-identity.env',
    'face-registration-old.txt', 'admin-overview.png', 'admin-register.png', 'admin-usb-mac.png',
    'mobile-login.png', 'product-mobile-onboarding.png', 'product-setup-portal.png',
    'session-20261106\admin.png', 'session-20261106\mobile.png'
    'fingerprint-check\before-4mb.bin', 'fingerprint-check\restore-runtime.bin',
    'fingerprint-check\partitions.bin', 'edge-ai\connections.json', 'camera.identity.env',
    'qr-ai-20261107\issued-private.json',
    'system-review-20261107\state.json', 'system-review-20261107\admin-accounts.png',
    'system-review-20261107\mobile-settings.png'
)
$targets = @($relativePaths | ForEach-Object { Join-Path $localRoot $_ } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
$targets += @(Get-ChildItem -LiteralPath $localRoot -Filter 'backend-*.jar' -File | Select-Object -ExpandProperty FullName)
$targets = @($targets | Sort-Object -Unique)
$bytes = 0L
foreach ($target in $targets) {
    $absolute = (Resolve-Path -LiteralPath $target).Path
    if (-not $absolute.StartsWith($localRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unexpected cleanup target outside .local: $absolute"
    }
    $bytes += (Get-Item -LiteralPath $absolute).Length
    if ($Apply) { Remove-Item -LiteralPath $absolute -Force }
}
Write-Host "$($targets.Count) generated private snapshots/archives; $([Math]::Round($bytes/1MB,1)) MiB."
if (-not $Apply) { Write-Host 'Preview only. Run with -Apply to remove the listed generated artifacts.'; return }
$utf8 = [System.Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $localRoot 'README.md'), "# Local runtime`n`nCurrent admin: ADMIN_ACCESS.txt. Run guide: ../docs/CHAY_TU_DAU_TAILSCALE.md.`nBusiness data was reset; register each chip again.`n", $utf8)
[IO.File]::WriteAllText((Join-Path $localRoot 'ACCESS.txt'), "Current admin: .local/ADMIN_ACCESS.txt`nGuide: docs/CHAY_TU_DAU_TAILSCALE.md`n", $utf8)
[IO.File]::WriteAllText((Join-Path $localRoot 'BUYER_RESET_STATUS.md'), "See ../docs/KIEM_THU_LAI_2026-11-07.md for the current verified reset state.`n", $utf8)
[IO.File]::WriteAllText((Join-Path $localRoot 'processes.json'), "{}`n", $utf8)
$templatePath = Join-Path $projectRoot 'face-node\.env.example'
$template = [IO.File]::ReadAllText($templatePath)
$configuration = Get-Content -Raw -LiteralPath (Join-Path $localRoot 'runtime.json') | ConvertFrom-Json
$server = $configuration.tailscale_ip
$template = $template.Replace('FACE_API_URL=http://localhost:8080', "FACE_API_URL=http://${server}:8080").Replace('MQTT_HOST=127.0.0.1', "MQTT_HOST=$server").Replace('MQTT_PORT=1883', 'MQTT_PORT=1884')
[IO.File]::WriteAllText((Join-Path $projectRoot 'face-node\.env'), $template, $utf8)
Write-Host 'Old snapshots and obsolete credential notes removed. Current infrastructure config and bootstrap admin retained.'
