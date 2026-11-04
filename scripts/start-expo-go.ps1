param(
    [string]$PackagerAddress = '',
    [ValidateRange(1024,65535)][int]$Port = 8081,
    [switch]$NonInteractive
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $PackagerAddress) {
    $runtimePath = Join-Path $projectRoot '.local\runtime.json'
    if (Test-Path -LiteralPath $runtimePath) {
        $configuration = Get-Content -Raw -LiteralPath $runtimePath | ConvertFrom-Json
        $PackagerAddress = $configuration.tailscale_ip
        if (-not $PackagerAddress) { $PackagerAddress = $configuration.lan_ip }
    }
}
$parsedAddress = $null
if (-not [System.Net.IPAddress]::TryParse($PackagerAddress, [ref]$parsedAddress) -or
    $parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
    throw 'Provide the PC Tailscale or Wi-Fi IPv4 address with -PackagerAddress.'
}
# Pin the packager host so VPN/VM adapters cannot win LAN discovery.
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $PackagerAddress
if ($NonInteractive) { $env:CI = '1' }
else { Remove-Item Env:CI -ErrorAction SilentlyContinue }
Set-Location (Join-Path $projectRoot 'IOT_mobile')
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$projectNode = Join-Path $projectRoot '.local\node-runtime\node_modules\node\bin\node.exe'
if (Test-Path -LiteralPath $projectNode) { $nodeExecutable = $projectNode }
$nodeVersion = [Version]((& $nodeExecutable --version).TrimStart('v'))
if (-not (($nodeVersion.Major -eq 22 -and $nodeVersion -ge [Version]'22.13.0') -or
          ($nodeVersion.Major -eq 24 -and $nodeVersion -ge [Version]'24.3.0') -or $nodeVersion.Major -ge 26)) {
    throw 'Expo SDK 58 requires Node 22.13+, 24.3+, or 26+. Node 25 is unsupported.'
}
$env:Path = (Split-Path -Parent $nodeExecutable) + ';' + $env:Path
Write-Host "Using Node $nodeVersion for Expo SDK 58"
Write-Host "Open in Expo Go: exp://${PackagerAddress}:$Port"
Write-Host 'Service address is preconfigured. Sign in or register in the app.'
& $nodeExecutable 'node_modules\expo\bin\cli' start --go --lan --port $Port
exit $LASTEXITCODE
