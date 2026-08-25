param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("products","pricing","containers")]
    [string]$ModuleName,
    [Parameter(Mandatory=$true)]
    [string]$ScriptName,
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"
if (-not $SupabaseUrl) { throw "NEXT_PUBLIC_SUPABASE_URL is not set." }
if (-not $ServiceRoleKey) { throw "SUPABASE_SERVICE_ROLE_KEY is not set." }

$baseUrl = $SupabaseUrl.TrimEnd('/')
$headers = @{ apikey = $ServiceRoleKey; "Content-Type" = "application/json; charset=utf-8" }
$userAgent = "RedWillow-BreweryOps-ViewPlan-Connector/1.1"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$childPath = Join-Path $scriptRoot $ScriptName
$startedAt = [DateTime]::UtcNow

if (-not (Test-Path $childPath)) { throw "Connector reconciliation script not found: $childPath" }

function Invoke-SupaRequest([string]$method,[string]$path,$body=$null,[string]$prefer=$null){
    $h=@{}+$headers
    if($prefer){$h["Prefer"]=$prefer}
    $args=@{Method=$method;Uri="$baseUrl/rest/v1/$path";Headers=$h;UserAgent=$userAgent}
    if($null-ne$body){
        $json=ConvertTo-Json -InputObject $body -Depth 8 -Compress
        $args["Body"]=[Text.Encoding]::UTF8.GetBytes($json)
        $args["ContentType"]="application/json; charset=utf-8"
    }
    try{return Invoke-RestMethod @args}catch{
        $parts=@();if($_.Exception.Message){$parts+=$_.Exception.Message};if($_.ErrorDetails-and$_.ErrorDetails.Message){$parts+=$_.ErrorDetails.Message}
        throw "Supabase $method $path failed:`n$(($parts|Select-Object -Unique)-join "`n")"
    }
}
function Invoke-SupaPost([string]$path,$body,[string]$prefer="return=minimal"){return Invoke-SupaRequest "Post" $path $body $prefer}
function Invoke-SupaPatch([string]$path,$body){return Invoke-SupaRequest "Patch" $path $body "return=minimal"}

Write-Host "Brewery Ops - ViewPlan connector"
Write-Host "--------------------------------"
Write-Host "Module:   $ModuleName"
Write-Host "ViewPlan: READ ONLY"
Write-Host "Mode:     FULL RECONCILIATION"

$run=@(Invoke-SupaPost "connector_sync_runs" @{
    source_system="viewplan";module=$ModuleName;mode="full";status="running";started_at=$startedAt.ToString("o")
} "return=representation")
$runId=if($run.Count){[string]$run[0].id}else{$null}

try {
    & $childPath
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "$ScriptName exited with code $LASTEXITCODE" }

    $completedAt=[DateTime]::UtcNow
    $state=@{
        source_system="viewplan";module=$ModuleName;last_source_lud=$null
        last_success_at=$completedAt.ToString("o");last_full_sync_at=$completedAt.ToString("o")
        last_row_count=0;last_error=$null;updated_at=$completedAt.ToString("o")
    }
    Invoke-SupaPost "connector_sync_state?on_conflict=source_system%2Cmodule" $state "resolution=merge-duplicates,return=minimal" | Out-Null
    if($runId){Invoke-SupaPatch "connector_sync_runs?id=eq.$runId" @{status="completed";completed_at=$completedAt.ToString("o");notes="Full reconciliation completed. Source tables do not expose a reliable module-wide LUD."}|Out-Null}

    Write-Host "Connector state recorded for $ModuleName."
}
catch {
    $failedAt=[DateTime]::UtcNow
    $message=$_.Exception.Message
    try{Invoke-SupaPost "connector_sync_state?on_conflict=source_system%2Cmodule" @{
        source_system="viewplan";module=$ModuleName;last_source_lud=$null;last_row_count=0;last_error=$message;updated_at=$failedAt.ToString("o")
    } "resolution=merge-duplicates,return=minimal"|Out-Null}catch{}
    try{if($runId){Invoke-SupaPatch "connector_sync_runs?id=eq.$runId" @{status="failed";notes=$message;completed_at=$failedAt.ToString("o")}|Out-Null}}catch{}
    throw
}
