$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pioCommand = Get-Command pio.exe,platformio.exe -ErrorAction SilentlyContinue | Select-Object -First 1
$pioExecutable = if ($pioCommand) { $pioCommand.Source } else {
    Join-Path ([Environment]::GetFolderPath('UserProfile')) '.platformio\penv\Scripts\platformio.exe'
}
if (-not (Test-Path -LiteralPath $pioExecutable)) { throw 'Install PlatformIO first.' }
Push-Location (Join-Path $projectRoot 'firmware')
try {
    & $pioExecutable run -c platformio.connected.ini
    if ($LASTEXITCODE -ne 0) { throw "Firmware build failed (exit $LASTEXITCODE)." }
} finally { Pop-Location }
