$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localIp = (Get-Content -Raw -LiteralPath (Join-Path $projectRoot '.local\runtime.json') | ConvertFrom-Json).lan_ip
try {
    if (-not (Get-NetFirewallRule -DisplayName 'Smart Access local development' -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName 'Smart Access local development' -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort 1884,8080,8081 -LocalAddress $localIp -RemoteAddress LocalSubnet -Profile Any | Out-Null
    }
    'OK: LAN-only firewall rule enabled for MQTT1884, backend8080 and Expo8081.' |
        Set-Content -Encoding UTF8 -LiteralPath (Join-Path $projectRoot '.local\firewall-status.txt')
} catch {
    'FAILED: Windows did not allow the firewall rule.' |
        Set-Content -Encoding UTF8 -LiteralPath (Join-Path $projectRoot '.local\firewall-status.txt')
    exit 1
}
