param([Parameter(Mandatory=$true)][ValidateSet('backend','mqtt','face-api','web','expo','mqtt-gateway','ota-gateway')][string]$Service)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$team=Join-Path $projectRoot '.local\team'
$role=Get-Content -Raw -LiteralPath (Join-Path $team 'role.json') | ConvertFrom-Json
$python=Join-Path $projectRoot '.local\venv\Scripts\python.exe'
if(-not (Test-Path -LiteralPath $python)){throw 'Create .local/venv and install scripts/requirements-local.txt first.'}
$env:PYTHONUTF8='1'
function Load-TeamEnv([string]$Name) {
    Get-Content -LiteralPath (Join-Path $team $Name) | ForEach-Object {
        if($_ -match '^([^#=]+)=(.*)$'){[Environment]::SetEnvironmentVariable($matches[1],$matches[2],'Process')}
    }
}
function Require-Role([string]$Name){if($role.role -ne $Name){throw "Service $Service belongs to role $Name."}}
switch($Service){
    'backend' {
        Require-Role 'cuong';Load-TeamEnv 'backend.env'
        Set-Location (Join-Path $projectRoot 'smart-access-control-backend')
        & java '-Dfile.encoding=UTF-8' '-Dstdout.encoding=UTF-8' '-Dstderr.encoding=UTF-8' -jar target/smart-access-control-backend-0.0.1-SNAPSHOT.jar
    }
    'mqtt' {
        Require-Role 'cuong'
        $broker=& $python (Join-Path $PSScriptRoot 'team_handoff.py') broker-path
        if($LASTEXITCODE -ne 0 -or -not $broker){throw 'Install Mosquitto or set MOSQUITTO_EXE.'}
        & $broker -c (Join-Path $team 'mosquitto\mosquitto.conf')
    }
    'face-api' {
        Require-Role 'cuong';Load-TeamEnv 'face.env'
        $env:FACE_MODEL_ROOT=Join-Path $projectRoot 'face-node\models'
        Set-Location (Join-Path $projectRoot 'face-node')
        & $python -u enrollment_server.py
    }
    'web' {Require-Role 'thuy'; & $python -u (Join-Path $PSScriptRoot 'team_web.py') --listen $role.people.thuy --backend "http://$($role.people.cuong):8080"}
    'expo' {Require-Role 'thuy'; & (Join-Path $PSScriptRoot 'start-expo-go.ps1') -PackagerAddress $role.people.thuy}
    'mqtt-gateway' {Require-Role 'hop'; & $python -u (Join-Path $PSScriptRoot 'mqtt_gateway.py') --listen $role.lan --server $role.people.cuong}
    'ota-gateway' {Require-Role 'hop'; & $python -u (Join-Path $PSScriptRoot 'mqtt_gateway.py') --listen $role.lan --listen-port 8080 --server $role.people.cuong --server-port 8080}
}
if($LASTEXITCODE -ne 0){throw "Service $Service exited with error $LASTEXITCODE."}
