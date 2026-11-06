$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pioExecutable = Join-Path $projectRoot '.local\venv\Scripts\pio.exe'
if (-not (Test-Path -LiteralPath $pioExecutable)) { throw 'Install PlatformIO in .local/venv first.' }
$env:PLATFORMIO_CORE_DIR = Join-Path $projectRoot '.local\platformio'
Push-Location (Join-Path $projectRoot 'firmware')
try {
    & $pioExecutable run -c platformio.connected.ini
    if ($LASTEXITCODE -ne 0) { throw "Firmware build failed (exit $LASTEXITCODE)." }
} finally { Pop-Location }
