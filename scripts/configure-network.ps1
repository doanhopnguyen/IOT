param(
    [ValidateSet('server','site')][string]$Role = 'server',
    [string]$LanAddress = '',
    [switch]$Firewall
)
$ErrorActionPreference = 'Stop'
if ($Firewall) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this command in an Administrator PowerShell to update Windows Firewall.'
    }
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$tailscale = (& tailscale ip -4 | Select-Object -First 1).Trim()
if ($LASTEXITCODE -ne 0 -or $tailscale -notmatch '^100\.') { throw 'Connect Tailscale before configuring the project.' }
if (-not $LanAddress) {
    $addresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and
        $_.InterfaceAlias -notmatch 'vEthernet|VMware|Loopback'
    })
    if ($addresses.Count -ne 1) { throw 'Choose the Wi-Fi/Ethernet IPv4 explicitly with -LanAddress.' }
    $LanAddress = $addresses[0].IPAddress
}
if (-not (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -eq $LanAddress })) {
    throw 'LanAddress must belong to this PC.'
}
if ($Role -eq 'server') {
    $runtimePath = Join-Path $projectRoot '.local\runtime.json'
    $cfg = Get-Content -Raw -LiteralPath $runtimePath | ConvertFrom-Json
    $cfg | Add-Member -NotePropertyName tailscale_ip -NotePropertyValue $tailscale -Force
    $cfg.lan_ip = $LanAddress
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($runtimePath, ($cfg | ConvertTo-Json), $utf8)
    $mobileEnv = Join-Path $projectRoot 'IOT_mobile\.env'
    $lines = @(Get-Content -LiteralPath $mobileEnv -ErrorAction SilentlyContinue | Where-Object { $_ -notmatch '^EXPO_PUBLIC_API_BASE_URL=' })
    [System.IO.File]::WriteAllLines($mobileEnv, @($lines; "EXPO_PUBLIC_API_BASE_URL=http://${tailscale}:8080"), $utf8)
    $backendEnv = Join-Path $projectRoot 'smart-access-control-backend\.env'
    $lines = @(Get-Content -LiteralPath $backendEnv | Where-Object { $_ -notmatch '^(CORS_ALLOWED_ORIGINS|APP_DEVICE_BASE_URL)=' })
    [System.IO.File]::WriteAllLines($backendEnv,
        @($lines; "CORS_ALLOWED_ORIGINS=http://localhost:8081,http://127.0.0.1:8081,http://${tailscale}:8081,http://${LanAddress}:8081"; "APP_DEVICE_BASE_URL=http://${LanAddress}:8080"), $utf8)
    Write-Host "Backend/admin: http://${tailscale}:8080; Expo: exp://${tailscale}:8081"
}
if ($Firewall) {
    # Run this option in an Administrator PowerShell. Rules permit only LAN or tailnet sources.
    $rule = "Smart Door $Role LAN"
    Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    $lanPorts = if ($Role -eq 'server') { @(1884,8080,8081) } else { @(1884) }
    New-NetFirewallRule -DisplayName $rule -Direction Inbound -Action Allow -Protocol TCP `
        -LocalAddress $LanAddress -LocalPort $lanPorts -RemoteAddress LocalSubnet -Profile Any | Out-Null
    if ($Role -eq 'server') {
        $rule = 'Smart Door server Tailscale'
        Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
        New-NetFirewallRule -DisplayName $rule -Direction Inbound -Action Allow -Protocol TCP `
            -LocalAddress $tailscale -LocalPort 1884,8080,8081 -RemoteAddress '100.64.0.0/10' -Profile Any | Out-Null
    }
    Write-Host 'Project firewall rules configured.'
}
Write-Host "Site gateway address for local ESP32s: ${LanAddress}:1884"
