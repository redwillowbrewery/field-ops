param(
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
)
$ErrorActionPreference = 'Stop'
if (-not $SupabaseUrl -or -not $ServiceRoleKey) { throw 'Supabase connector credentials are required.' }
. (Join-Path $PSScriptRoot 'viewplan-account-commercial-source.ps1')
$baseUrl = $SupabaseUrl.TrimEnd('/')
$headers = @{ apikey=$ServiceRoleKey; 'Content-Type'='application/json; charset=utf-8' }
$userAgent = 'RedWillow-BreweryOps-ViewPlan-Connector/1.0'
function Send-CommercialRequest([string]$method, [string]$path, $body, [string]$prefer='return=minimal') {
    $h = @{} + $headers
    $h.Prefer = $prefer
    $json = ConvertTo-Json -InputObject $body -Depth 10 -Compress
    Invoke-RestMethod -Method $method -Uri "$baseUrl/rest/v1/$path" -Headers $h -UserAgent $userAgent -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 120
}
$runId = $null
$stage = 'recording the commercial sync run'
try {
    $run = @(Send-CommercialRequest 'Post' 'connector_sync_runs' @{
        source_system='viewplan'; module='account_commercial'; mode='full'; status='running'; started_at=[DateTime]::UtcNow.ToString('o')
    } 'return=representation')
    if ($run.Count) { $runId = $run[0].id }
    $stage = 'connecting to the ViewPlan session'
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application')
    $db = $access.CurrentDb()
    # Record read start, conservatively: no later attempt may make these facts look newer.
    $snapshotAt = [DateTime]::UtcNow.ToString('o')
    $stage = 'reading the ViewPlan commercial query'
    $rows = @(Get-ViewPlanCommercialRows $db)
    $stage = 'saving the commercial snapshot'
    $written = Send-CommercialRequest 'Post' 'rpc/sync_viewplan_account_commercial' @{
        payload=$rows; snapshot_at=$snapshotAt; currency_code='GBP'
    } 'return=representation'
    if ($runId) {
        $stage = 'recording sync completion'
        Send-CommercialRequest 'Patch' "connector_sync_runs?id=eq.$runId" @{
            status='completed'; rows_read=$rows.Count; rows_written=[int]$written; completed_at=[DateTime]::UtcNow.ToString('o')
        } | Out-Null
    }
    Write-Host "Commercial snapshot complete: $written Accounts; source ViewPlan; snapshot $snapshotAt"
} catch {
    # Omit credentials/HTTP response bodies from persisted errors and console output.
    $status = if ($_.Exception.Response) { ' HTTP ' + [int]$_.Exception.Response.StatusCode + '.' } else { '' }
    $message = "Commercial refresh failed while $stage.$status Existing snapshot data has not been cleared."
    try {
        Send-CommercialRequest 'Post' 'connector_sync_state?on_conflict=source_system%2Cmodule' @{
            source_system='viewplan'; module='account_commercial'; last_error=$message; updated_at=[DateTime]::UtcNow.ToString('o')
        } 'resolution=merge-duplicates,return=minimal' | Out-Null
        if ($runId) { Send-CommercialRequest 'Patch' "connector_sync_runs?id=eq.$runId" @{
            status='failed'; notes=$message; completed_at=[DateTime]::UtcNow.ToString('o')
        } | Out-Null }
    } catch {
        $recordStatus = if ($_.Exception.Response) { ' HTTP ' + [int]$_.Exception.Response.StatusCode + '.' } else { '' }
        Write-Warning "Could not record commercial connector failure.$recordStatus Existing snapshot timestamps are unchanged."
    }
    throw $message
}
