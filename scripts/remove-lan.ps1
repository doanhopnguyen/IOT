$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$statusFile = Join-Path $projectRoot '.local\firewall-status.txt'
try {
    $rules = @(Get-NetFirewallRule -DisplayName 'Smart Access local development' -ErrorAction SilentlyContinue)
    foreach ($rule in $rules) {
        $ports = @($rule | Get-NetFirewallPortFilter | Select-Object -ExpandProperty LocalPort) | Sort-Object
        if (($ports -join ',') -ne '1884,8080,8081' -or $rule.Direction -ne 'Inbound' -or $rule.Action -ne 'Allow') {
            throw 'Rule differs from the project LAN rule; no changes made.'
        }
    }
    foreach ($rule in $rules) { Remove-NetFirewallRule -Name $rule.Name }
    if (Get-NetFirewallRule -DisplayName 'Smart Access local development' -ErrorAction SilentlyContinue) {
        throw 'Project rule still exists.'
    }
    'REMOVED: project LAN firewall allowance for1884/8080/8081. Other firewall rules unchanged.' |
        Set-Content -Encoding UTF8 -LiteralPath $statusFile
} catch {
    ('FAILED: ' + $_.Exception.Message) | Set-Content -Encoding UTF8 -LiteralPath $statusFile
    exit 1
}
