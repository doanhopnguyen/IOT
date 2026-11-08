param([Parameter(Mandatory=$true)][ValidateSet('cuong','thuy','hop')][string]$Role,[string]$HopLan='10.18.0.194')
$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if(-not ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
    throw 'Run in an Administrator PowerShell to add the project firewall rule.'
}
$address=switch($Role){'cuong'{'100.95.248.100'} 'thuy'{'100.109.158.8'} 'hop'{$HopLan}}
if(-not (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -eq $address})){throw 'The selected address is not assigned to this laptop.'}
$ports=switch($Role){'cuong'{@(8080,1884)} 'thuy'{@(8080,8081)} 'hop'{@(1884,8080)}}
$remote=if($Role -eq 'hop'){'LocalSubnet'}else{'100.64.0.0/10'}
$name="SmartDoor Team $Role"
Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol TCP -LocalAddress $address -LocalPort $ports -RemoteAddress $remote -Profile Any | Out-Null
Write-Host "Configured $name on $address, TCP $($ports -join ',')."
