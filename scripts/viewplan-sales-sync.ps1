param(
    [string]$SupabaseUrl=$env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey=$env:SUPABASE_SERVICE_ROLE_KEY,
    [string]$ExportPath,
    [ValidateRange(1,1000000)][int]$MaxRows=250000,
    [switch]$AllowLargeReduction
)
$ErrorActionPreference='Stop'
if([Environment]::Is64BitProcess){throw 'Use 32-bit Windows PowerShell in the authenticated ViewPlan session.'}
if(-not $ExportPath -and (-not $SupabaseUrl -or -not $ServiceRoleKey)){throw 'Sales connector credentials required.'}
. (Join-Path $PSScriptRoot 'viewplan-sales-source.ps1')
$lock=$null;$runId=$null;$stage='startup'
function Send-Sales([string]$method,[string]$path,$body,[string]$prefer='return=minimal'){
    $timer=[Diagnostics.Stopwatch]::StartNew()
    Write-Host ('Sales: preparing '+$path+' request...')
    $json=ConvertTo-Json -InputObject $body -Depth 12 -Compress
    $bytes=[Text.Encoding]::UTF8.GetBytes($json)
    Write-Host ('Sales: sending {0:n2} MB to {1}; preparation {2:n1}s; HTTP timeout 300s...' -f ($bytes.Length/1MB),$path,$timer.Elapsed.TotalSeconds)
    $response=Invoke-RestMethod -Method $method -Uri ($SupabaseUrl.TrimEnd('/')+'/rest/v1/'+$path) -Headers @{apikey=$ServiceRoleKey;Prefer=$prefer} -UserAgent 'RedWillow-BreweryOps-ViewPlan-Connector/1.2' -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 300
    Write-Host ('Sales: '+$path+' completed after '+[Math]::Round($timer.Elapsed.TotalSeconds,1)+'s.')
    return $response
}
try {
    $lock=[IO.File]::Open((Join-Path $PSScriptRoot 'viewplan-sales-sync.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    if(-not $ExportPath){
        $stage='recording sales attempt'
        $response=Send-Sales 'Post' 'connector_sync_runs' @{source_system='viewplan';module='sales';mode='full';status='running';started_at=[DateTime]::UtcNow.ToString('o')} 'return=representation'
        $runs=@($response);if($runs.Count -ne 1 -or -not $runs[0].id){throw 'Sales run identity unavailable.'};$runId=$runs[0].id
    }
    $stage='reading ViewPlan orders and complete product lines'
    Write-Host 'Sales: attaching to the authenticated ViewPlan session...'
    $access=[Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application')
    $snapshot=Get-ViewPlanSalesSnapshot -db ($access.CurrentDb()) -MaxRows $MaxRows
    if($ExportPath){
        [IO.File]::WriteAllText($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ExportPath),(ConvertTo-Json -InputObject $snapshot -Depth 12),[Text.UTF8Encoding]::new($false))
        Write-Host 'Sales projection exported; no Brewery Ops writes.'
        return
    }
    $stage='saving account order history'
    Write-Host ('Sales: source contains {0:n0} orders. Starting transactional history update...' -f $snapshot.payload.Count)
    $snapshot.allow_large_reduction=[bool]$AllowLargeReduction
    $snapshot.run_id=$runId
    $result=Send-Sales 'Post' 'rpc/sync_viewplan_sales' $snapshot 'return=representation'
    Write-Host ('Account sales refreshed: '+(ConvertTo-Json -InputObject $result -Compress))
} catch {
    if(-not $ExportPath -and $runId){
        # Persist safe stage/error class only, never response bodies or order data.
        $message='Sales refresh failed while '+$stage+'. '+$_.Exception.GetType().FullName
        try {
            Send-Sales 'Post' 'connector_sync_state?on_conflict=source_system,module' @{source_system='viewplan';module='sales';last_error=$message;updated_at=[DateTime]::UtcNow.ToString('o')} 'resolution=merge-duplicates,return=minimal' | Out-Null
            Send-Sales 'Patch' ('connector_sync_runs?id=eq.'+$runId) @{status='failed';notes=$message;completed_at=[DateTime]::UtcNow.ToString('o')} | Out-Null
        }catch{Write-Warning 'Could not record sales failure; inspect last successful sales snapshot time.'}
    }
    throw ('Account sales sync failed at '+$stage+'. Previous history was not cleared by a failed ingestion. Check the sales source and database migration.')
} finally {if($null -ne $lock){$lock.Dispose()}}
