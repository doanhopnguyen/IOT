param()
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$ports = @(1884,8080,8081,8091)
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $ports })
foreach ($processId in ($listeners.OwningProcess | Sort-Object -Unique)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    $command = $process.CommandLine
    $normalized = if ($command) { $command.Replace('/','\') } else { '' }
    if (-not $normalized.ToLowerInvariant().Contains($projectRoot.ToLowerInvariant() + '\')) {
        throw "Port belongs to PID $processId but its command does not identify this project. Inspect it before stopping."
    }
    Stop-Process -Id $processId -Force
    Write-Host "Stopped project process $processId ($($process.Name))."
}
# Camera clients and site gateways can have no listening project port.
Get-CimInstance Win32_Process | Where-Object {
    $_.Name -in @('java.exe','node.exe','python.exe') -and $_.CommandLine -and
    $_.CommandLine.Replace('/','\').ToLowerInvariant().Contains($projectRoot.ToLowerInvariant() + '\')
} | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped project client $($_.ProcessId) ($($_.Name))."
}
$remaining = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $ports })
if ($remaining) { throw 'A project port is still listening; inspect Get-NetTCPConnection.' }
Write-Host 'Project ports 1884, 8080, 8081 and 8091 are closed.'
