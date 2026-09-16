param(
    [ValidateSet("all","customers","products","pricing","containers","take-off","orders")]
    [string]$Module = "all",
    [switch]$Full,
    [switch]$Scheduled
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Run-Module([string]$name,[string]$script,[hashtable]$parameters=@{}) {
    Write-Host ""
    Write-Host "=== $name ==="
    $script:stage = $name
    $path = Join-Path $scriptRoot $script
    if (-not (Test-Path $path)) { throw "Connector module script not found: $path" }
    Write-RunEvent "module_started"
    $global:LASTEXITCODE = 0
    & $path @parameters
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "$name module exited with code $LASTEXITCODE" }
    Write-RunEvent "module_completed"
}

$runId = [Guid]::NewGuid().ToString()
$startedAt = [DateTime]::UtcNow.ToString('o')
$stage = 'startup'
$invocation = if ($Scheduled) { 'scheduled' } else { 'manual' }
$logDirectory = Join-Path $scriptRoot 'connector-run-logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory ($runId + '.jsonl')
$remoteStarted = $false
function Write-RunEvent([string]$event, [string]$errorCode=$null) {
    @{run_id=$runId;at=[DateTime]::UtcNow.ToString('o');invocation=$invocation;module=$Module;stage=$stage;event=$event;error_code=$errorCode} |
        ConvertTo-Json -Compress | Add-Content -LiteralPath $logPath -Encoding UTF8
}
function Save-RunState([string]$status,[string]$errorCode=$null) {
    if (-not $env:NEXT_PUBLIC_SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY) { throw 'Runner reporting credentials unavailable' }
    $body=@{id=$runId;source_system='viewplan';invocation=$invocation;requested_module=$Module;status=$status;started_at=$startedAt;stage=$stage;error_code=$errorCode}
    if ($status -ne 'running') { $body.completed_at=[DateTime]::UtcNow.ToString('o') }
    $json=ConvertTo-Json -InputObject $body -Compress
    Invoke-RestMethod -UserAgent "RedWillow-BreweryOps-ViewPlan-Connector/1.2" -Method Post -Uri ($env:NEXT_PUBLIC_SUPABASE_URL.TrimEnd('/')+'/rest/v1/connector_runner_runs?on_conflict=id') -Headers @{apikey=$env:SUPABASE_SERVICE_ROLE_KEY;Prefer='resolution=merge-duplicates,return=minimal'} -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 30 | Out-Null
}
try {
    Write-RunEvent 'started'
    Save-RunState 'running'
    $remoteStarted=$true
    if ([Environment]::Is64BitProcess) { throw 'Use 32-bit Windows PowerShell' }
Write-Host "Brewery Ops - ViewPlan connector runner"
Write-Host "--------------------------------------"
Write-Host "Requested module: $Module"

if ($Module -eq "all" -or $Module -eq "customers") {
    $customerParameters = @{}
    if ($Full) { $customerParameters["Full"] = $true }
    Run-Module "Customers" "viewplan-connector-customers.ps1" $customerParameters
}

if ($Module -eq "all" -or $Module -eq "products") {
    Run-Module "Products / variants / price lists / Sellar mappings" "viewplan-connector-reconcile.ps1" @{
        ModuleName = "products"
        ScriptName = "viewplan-products-sync.ps1"
    }
}

if ($Module -eq "all" -or $Module -eq "pricing") {
    Run-Module "Customer pricing" "viewplan-connector-reconcile.ps1" @{
        ModuleName = "pricing"
        ScriptName = "viewplan-customer-pricing-sync.ps1"
    }
}

if ($Module -eq "all" -or $Module -eq "containers") {
    Run-Module "Returnable containers" "viewplan-connector-reconcile.ps1" @{
        ModuleName = "containers"
        ScriptName = "viewplan-container-sync.ps1"
    }
}

Write-Host ""
if ($Module -eq "all" -or $Module -eq "take-off") {
    Run-Module "Take Off Planning" "viewplan-take-off-sync.ps1"
}
if ($Module -eq "orders") { Run-Module "Order planning" "viewplan-orders-sync.ps1" }
Write-Host "ViewPlan connector runner complete."

    $stage='complete'
    Save-RunState 'completed'
    Write-RunEvent 'completed'
} catch {
    $errorCode=$_.Exception.GetType().FullName
    Write-RunEvent 'failed' $errorCode
    if($remoteStarted){try{Save-RunState 'failed' $errorCode}catch{Write-RunEvent 'failure_reporting_failed' $_.Exception.GetType().FullName}}
    Write-Host "Connector failed at $stage. Diagnostic log: $logPath"
    throw
}
