param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$platformioHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.platformio'
$pioCommand = Get-Command pio.exe,platformio.exe -ErrorAction SilentlyContinue | Select-Object -First 1
$pioExecutable = if ($pioCommand) { $pioCommand.Source } else { Join-Path $platformioHome 'penv\Scripts\platformio.exe' }
if (-not (Test-Path -LiteralPath $pioExecutable)) { throw 'Install PlatformIO first.' }
$firmware = Join-Path $projectRoot 'firmware'
if (-not $SkipBuild) {
    Push-Location $firmware
    try {
        & $pioExecutable run -c platformio.connected.ini
        if ($LASTEXITCODE -ne 0) { throw "Firmware build failed (exit $LASTEXITCODE)." }
    } finally { Pop-Location }
}

# Factory image để web admin nạp chip trắng (ghi ở 0x0). App nằm ở 0x10000 và phải trùng firmware.bin phát hành.
$build = Join-Path $firmware '.pio\connected-door-build\esp32-s3-connected'
$match = Select-String -Path (Join-Path $firmware 'connected_door\main.cpp') -Pattern '#define FIRMWARE_VERSION "([^"]+)"' | Select-Object -First 1
if (-not $match) { throw 'FIRMWARE_VERSION not found in connected_door/main.cpp.' }
$version = $match.Matches[0].Groups[1].Value
$bootApp0 = Join-Path $platformioHome 'packages\framework-arduinoespressif32\tools\partitions\boot_app0.bin'
$esptool = Join-Path $platformioHome 'packages\tool-esptoolpy\esptool.py'
$python = Join-Path $platformioHome 'penv\Scripts\python.exe'
foreach ($required in @($bootApp0, $esptool, $python, (Join-Path $build 'firmware.bin'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing $required" }
}
$releases = Join-Path $projectRoot '.local\releases'
New-Item -ItemType Directory -Force $releases | Out-Null
$output = Join-Path $releases "factory-$version.bin"
& $python $esptool --chip esp32s3 merge_bin -o $output --flash_mode qio --flash_size 16MB `
    0x0 (Join-Path $build 'bootloader.bin') 0x8000 (Join-Path $build 'partitions.bin') `
    0xe000 $bootApp0 0x10000 (Join-Path $build 'firmware.bin')
if ($LASTEXITCODE -ne 0) { throw "merge_bin failed (exit $LASTEXITCODE)." }
Copy-Item -LiteralPath (Join-Path $build 'firmware.bin') -Destination (Join-Path $releases "firmware-$version.bin") -Force
Write-Host "Factory image: $output"
Write-Host "Upload firmware-$version.bin (OTA) together with factory-$version.bin in admin Cap nhat firmware."
