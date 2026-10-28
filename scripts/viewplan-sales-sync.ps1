param(
    [string]$SupabaseUrl=$env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey=$env:SUPABASE_SERVICE_ROLE_KEY,
    [string]$ExportPath,
    [ValidateRange(1,1000000)][int]$MaxRows=250000,
    [ValidateRange(1,2000)][int]$BatchOrders=500,
    [switch]$Full
)
$ErrorActionPreference='Stop'
if([Environment]::Is64BitProcess){throw 'Use 32-bit Windows PowerShell in the authenticated ViewPlan session.'}
if(-not $ExportPath -and (-not $SupabaseUrl -or -not $ServiceRoleKey)){throw 'Sales connector credentials required.'}
. (Join-Path $PSScriptRoot 'viewplan-sales-source.ps1')
$lock=$null;$runId=$null;$stage='startup'
function Read-SalesRows([string]$path){
    Write-Host ('Sales: reading '+$path.Split('?')[0]+'...')
    $response=Invoke-RestMethod -Method Get -Uri ($SupabaseUrl.TrimEnd('/')+'/rest/v1/'+$path) -Headers @{apikey=$ServiceRoleKey} -UserAgent 'RedWillow-BreweryOps-ViewPlan-Connector/1.2' -TimeoutSec 60
    if($response -isnot [array]){throw 'Invalid sales checkpoint response.'}
    foreach($row in $response){$row}
}
function Send-Sales([string]$method,[string]$path,$body,[string]$prefer='return=minimal'){
    $timer=[Diagnostics.Stopwatch]::StartNew()
    Write-Host ('Sales: preparing '+$path+' request...')
    $bytes=[Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $body -Depth 15 -Compress))
    Write-Host ('Sales: sending {0:n2} MB to {1}; HTTP timeout 300s...' -f ($bytes.Length/1MB),$path)
    $response=Invoke-RestMethod -Method $method -Uri ($SupabaseUrl.TrimEnd('/')+'/rest/v1/'+$path) -Headers @{apikey=$ServiceRoleKey;Prefer=$prefer} -UserAgent 'RedWillow-BreweryOps-ViewPlan-Connector/1.2' -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 300
    Write-Host ('Sales: '+$path+' completed after '+[Math]::Round($timer.Elapsed.TotalSeconds,1)+'s.')
    return $response
}
try {
    $lock=[IO.File]::Open((Join-Path $PSScriptRoot 'viewplan-sales-sync.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    $access=[Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application')
    $db=$access.CurrentDb()
    if($ExportPath){
        $snapshot=Get-ViewPlanSalesSnapshot -db $db -MaxRows $MaxRows -BatchOrders $BatchOrders
        [IO.File]::WriteAllText($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ExportPath),(ConvertTo-Json -InputObject $snapshot -Depth 15),[Text.UTF8Encoding]::new($false))
        Write-Host 'First dispatched-history batch exported; no Brewery Ops writes.'
        return
    }
    $restart=[bool]$Full
    while($true){
        $stage='reading dispatched-sales checkpoint'
        $rows=@(Read-SalesRows 'viewplan_sales_checkpoint?select=revision,state&singleton=eq.true')
        if($rows.Count -gt 1){throw 'Ambiguous sales checkpoint.'}
        $revision=if($rows.Count){[long]$rows[0].revision}else{0L}
        $saved=if($rows.Count){$rows[0].state}else{$null}
        $meta=@{expected_revision=$revision;scan_mode='backfill';scan_from=$null;scan_through=$null;scan_started_at=$null;cursor=0L;high_id=0L;restart_full=$restart;bootstrap_success_at=$null}
        if(-not $restart -and $saved){
            if($saved.mode -eq 'idle'){
                $meta.scan_mode='incremental';$meta.scan_from=$saved.through;$meta.high_id=[long]$saved.last_source_order_id
            }else{
                $meta.scan_mode=$saved.mode;$meta.scan_from=$saved.scan_from;$meta.scan_through=$saved.scan_through
                $meta.scan_started_at=$saved.scan_started_at;$meta.cursor=[long]$saved.cursor;$meta.high_id=[long]$saved.high_id
                Write-Host ('Sales: resuming committed checkpoint after source order ID '+$meta.cursor+'.')
            }
        }elseif(-not $restart -and -not $saved){
            $states=@(Read-SalesRows 'connector_sync_state?source_system=eq.viewplan&module=eq.sales&select=last_success_at')
            $known=@(Read-SalesRows 'sales_orders?viewplan_source_order_id=not.is.null&dispatched=eq.true&select=viewplan_source_order_id&order=viewplan_source_order_id.desc&limit=1')
            if($states.Count -eq 1 -and $states[0].last_success_at -and $known.Count){
                $meta.bootstrap_success_at=$states[0].last_success_at
                $meta.scan_mode='incremental'
                $meta.scan_from=([DateTimeOffset]::Parse($meta.bootstrap_success_at)).LocalDateTime.ToString('yyyy-MM-ddTHH:mm:ss')
                $meta.high_id=[long]$known[0].viewplan_source_order_id
                Write-Host 'Sales: reusing the successful previous full import; historical reload unnecessary.'
            }
        }
        if(-not $runId){
            $stage='recording sales attempt'
            $mode=if($meta.scan_mode -eq 'incremental'){'incremental'}else{'full'}
            $response=Send-Sales 'Post' 'connector_sync_runs' @{source_system='viewplan';module='sales';mode=$mode;status='running';started_at=[DateTime]::UtcNow.ToString('o')} 'return=representation'
            $runs=@($response);if($runs.Count -ne 1 -or -not $runs[0].id){throw 'Sales run identity unavailable.'};$runId=$runs[0].id
        }
        $stage='reading dispatched ViewPlan orders and complete product lines'
        $since=if($meta.scan_from){[DateTime]::Parse($meta.scan_from,[Globalization.CultureInfo]::InvariantCulture)}else{$null}
        $snapshot=Get-ViewPlanSalesSnapshot -db $db -MaxRows $MaxRows -Since $since -AfterOrderId $meta.high_id -Cursor $meta.cursor -BatchOrders $BatchOrders
        if(-not $meta.scan_through){$meta.scan_through=$snapshot.source_through;$meta.scan_started_at=$snapshot.snapshot_at}
        $meta.next_cursor=$snapshot.next_cursor;$meta.has_more=$snapshot.has_more
        $stage='committing dispatched history batch and checkpoint'
        $result=Send-Sales 'Post' 'rpc/sync_viewplan_dispatched_sales' @{payload=$snapshot.payload;snapshot_at=$snapshot.snapshot_at;complete=$true;run_id=$runId;checkpoint=$meta} 'return=representation'
        if($null -eq $result.done){throw 'Dispatched-sales RPC returned no checkpoint result.'}
        Write-Host ('Sales: batch committed: '+(ConvertTo-Json -InputObject $result -Compress))
        if($result.done){Write-Host ('Account sales refreshed: '+(ConvertTo-Json -InputObject $result -Compress));break}
        $restart=$false
    }
} catch {
    $original=$_
    # Print known validation messages, never arbitrary HTTP/driver response bodies.
    $detail=$original.Exception.GetType().FullName+' (HRESULT '+$original.Exception.HResult+')'
    if($original.Exception.Message -match '^(Missing sales source field: [a-z0-9_]+|Invalid or duplicate source order line\.|Invalid source order identity\.|Sales snapshot exceeds row limit; previous history retained\.|Undispatched order returned by history source\.|ViewPlan clock is earlier than the saved checkpoint\.)$'){$detail=$original.Exception.Message}
    $message='Sales refresh failed while '+$stage+'. '+$detail+'. Already committed batches and their resume checkpoint are retained.'
    if($runId){
        try {
            Send-Sales 'Post' 'connector_sync_state?on_conflict=source_system,module' @{source_system='viewplan';module='sales';last_error=$message;updated_at=[DateTime]::UtcNow.ToString('o')} 'resolution=merge-duplicates,return=minimal' | Out-Null
            Send-Sales 'Patch' ('connector_sync_runs?id=eq.'+$runId) @{status='failed';notes=$message;completed_at=[DateTime]::UtcNow.ToString('o')} | Out-Null
        }catch{Write-Warning 'Could not record sales failure; check checkpoint and last successful source time.'}
    }
    throw $message
} finally {if($null -ne $lock){$lock.Dispose()}}
