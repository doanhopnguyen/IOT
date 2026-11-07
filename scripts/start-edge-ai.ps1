param([switch]$NoBrowser, [ValidateRange(1024,65535)][int]$Port=8092)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$python=Join-Path $projectRoot '.local\venv\Scripts\python.exe'
if(-not (Test-Path -LiteralPath $python)) { throw 'Chua co Python AI. Tao .local\venv va cai face-node\requirements.txt theo docs\DEMO_AI_TREN_LAPTOP.md.' }
$address="http://127.0.0.1:$Port"
$ready=$false
try { $ready=(Invoke-RestMethod "$address/health" -TimeoutSec 2).application -eq 'smartdoor-edge-ai' } catch {}
if(-not $ready){
    $logDir=Join-Path $projectRoot '.local\edge-ai'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $script=Join-Path $projectRoot 'face-node\desktop_setup.py'
    Start-Process -FilePath $python -ArgumentList @('-u',('"'+$script+'"'),'--port',"$Port",'--no-browser') `
        -WorkingDirectory (Join-Path $projectRoot 'face-node') -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir 'portal.out.log') -RedirectStandardError (Join-Path $logDir 'portal.err.log') | Out-Null
    for($attempt=0;$attempt -lt 30 -and -not $ready;$attempt++){
        Start-Sleep -Milliseconds 250
        try { $ready=(Invoke-RestMethod "$address/health" -TimeoutSec 1).application -eq 'smartdoor-edge-ai' } catch {}
    }
}
if(-not $ready){throw 'Smart Door AI chua khoi dong. Xem .local\edge-ai\portal.err.log.'}
Write-Output "Smart Door AI: $address"
if(-not $NoBrowser){Start-Process $address}
