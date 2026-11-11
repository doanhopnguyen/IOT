param(
    # esp32-s3-connected (bản cơ sở), esp32-s3-funnel (broker mặc định là Tailscale Funnel), hoặc các env OTA demo.
    [string]$Environment = 'esp32-s3-connected',
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$platformioHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.platformio'
$pioCommand = Get-Command pio.exe,platformio.exe -ErrorAction SilentlyContinue | Select-Object -First 1
$pioExecutable = if ($pioCommand) { $pioCommand.Source } else { Join-Path $platformioHome 'penv\Scripts\platformio.exe' }
if (-not (Test-Path -LiteralPath $pioExecutable)) { throw 'Install PlatformIO first.' }
$firmware = Join-Path $projectRoot 'firmware'
$ini = Join-Path $firmware 'platformio.connected.ini'
if (-not (Select-String -LiteralPath $ini -SimpleMatch "[env:$Environment]" -Quiet)) { throw "Unknown environment $Environment in platformio.connected.ini." }
if (-not $SkipBuild) {
    Push-Location $firmware
    try {
        & $pioExecutable run -c platformio.connected.ini -e $Environment
        if ($LASTEXITCODE -ne 0) { throw "Firmware build failed (exit $LASTEXITCODE)." }
    } finally { Pop-Location }
}

# Phiên bản: lấy từ build_flags của env (nếu có), nếu không thì từ mặc định trong main.cpp.
$section = ((Get-Content -Raw -LiteralPath $ini) -split '(?m)^\[') | Where-Object { $_ -like "env:$Environment]*" } | Select-Object -First 1
$flag = [regex]::Match($section, 'FIRMWARE_VERSION=\\"([^"\\]+)\\"')
if ($flag.Success) { $version = $flag.Groups[1].Value } else {
    $match = Select-String -Path (Join-Path $firmware 'connected_door\main.cpp') -Pattern '#define FIRMWARE_VERSION "([^"]+)"' | Select-Object -First 1
    if (-not $match) { throw 'FIRMWARE_VERSION not found.' }
    $version = $match.Matches[0].Groups[1].Value
}

# Factory image để web admin nạp chip trắng (ghi ở 0x0). App nằm ở 0x10000 và phải trùng firmware.bin phát hành.
# Không ép --flash_mode: header bootloader phải giữ DIO như PlatformIO, ép QIO làm ESP32-S3 kẹt vòng reset.
$build = Join-Path $firmware ".pio\connected-door-build\$Environment"
$bootApp0 = Join-Path $platformioHome 'packages\framework-arduinoespressif32\tools\partitions\boot_app0.bin'
$esptool = Join-Path $platformioHome 'packages\tool-esptoolpy\esptool.py'
$python = Join-Path $platformioHome 'penv\Scripts\python.exe'
foreach ($required in @($bootApp0, $esptool, $python, (Join-Path $build 'bootloader.bin'), (Join-Path $build 'partitions.bin'), (Join-Path $build 'firmware.bin'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Missing $required" }
}
$releases = Join-Path $projectRoot '.local\releases'
New-Item -ItemType Directory -Force $releases | Out-Null
$output = Join-Path $releases "factory-$version.bin"
& $python $esptool --chip esp32s3 merge_bin -o $output --flash_size 16MB `
    0x0 (Join-Path $build 'bootloader.bin') 0x8000 (Join-Path $build 'partitions.bin') `
    0xe000 $bootApp0 0x10000 (Join-Path $build 'firmware.bin')
if ($LASTEXITCODE -ne 0) { throw "merge_bin failed (exit $LASTEXITCODE)." }
$header = [IO.File]::ReadAllBytes($output)[2]
if ($header -ne 2 -and $header -ne 3) { throw "Factory image header is not DIO/DOUT ($header); ESP32-S3 would not boot." }
Copy-Item -LiteralPath (Join-Path $build 'firmware.bin') -Destination (Join-Path $releases "firmware-$version.bin") -Force
Write-Host "Environment: $Environment  Version: $version"
Write-Host "Factory image: $output"
Write-Host "Upload firmware-$version.bin (OTA) together with factory-$version.bin in admin Cap nhat firmware."
