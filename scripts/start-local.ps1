param([ValidateSet('backend','mobile','broker','face','face-api')][string]$Component)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $projectRoot '.local'
switch ($Component) {
    'backend' {
        Get-Content -LiteralPath (Join-Path $projectRoot 'smart-access-control-backend\.env') | ForEach-Object {
            if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') }
        }
        if (-not $env:USB_ENABLED) {
            $platformioRoot = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.platformio'
            $usbPython = Join-Path $platformioRoot 'penv\Scripts\python.exe'
            $usbEsptool = Join-Path $platformioRoot 'packages\tool-esptoolpy\esptool.py'
            if ((Test-Path -LiteralPath $usbPython) -and (Test-Path -LiteralPath $usbEsptool)) {
                $env:USB_ENABLED = 'true'
                $env:USB_PYTHON_EXECUTABLE = $usbPython
                $env:USB_ESPTOOL_SCRIPT = $usbEsptool
            }
        }
        Set-Location (Join-Path $projectRoot 'smart-access-control-backend')
        $runtimeJar = Join-Path $runtime ('backend-' + [DateTime]::Now.ToString('yyyyMMddHHmmss') + '.jar')
        Copy-Item -LiteralPath 'target\smart-access-control-backend-0.0.1-SNAPSHOT.jar' -Destination $runtimeJar
        & java '-Dfile.encoding=UTF-8' -jar $runtimeJar `
            '--debug=false' '--logging.level.root=INFO' '--logging.level.org.springframework=INFO' '--logging.level.org.hibernate=INFO'
    }
    'mobile' {
        & (Join-Path $PSScriptRoot 'start-expo-go.ps1')
    }
    'broker' { & 'D:\ACER\Mosquitto\mosquitto.exe' -c (Join-Path $runtime 'mosquitto\mosquitto.conf') }
    'face-api' {
        Set-Location (Join-Path $projectRoot 'face-node')
        & (Join-Path $runtime 'venv\Scripts\python.exe') -u enrollment_server.py
    }
    'face' {
        Set-Location (Join-Path $projectRoot 'face-node')
        & (Join-Path $runtime 'venv\Scripts\python.exe') -u node.py --camera --no-preview
    }
}
