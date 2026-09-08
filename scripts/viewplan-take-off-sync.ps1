param(
 [string]$SupabaseUrl=$env:NEXT_PUBLIC_SUPABASE_URL,
 [string]$ServiceRoleKey=$env:SUPABASE_SERVICE_ROLE_KEY,
 [string]$ExportPath
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'viewplan-take-off-source.ps1')
function Send-TakeOff([string]$path,$body,[string]$method='Post'){
 $json=ConvertTo-Json -InputObject $body -Depth 18 -Compress
 Invoke-RestMethod -Method $method -Uri ($SupabaseUrl.TrimEnd('/')+'/rest/v1/'+$path) -Headers @{apikey=$ServiceRoleKey;Prefer='resolution=merge-duplicates,return=representation'} -UserAgent 'RedWillow-BreweryOps-ViewPlan-Connector/1.0' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 180
}
if(-not $ExportPath -and (-not $SupabaseUrl -or -not $ServiceRoleKey)){throw 'Connector credentials are required'}
$stage='opening ViewPlan'
try{
 $access=[Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application')
 $db=$access.CurrentDb()
 $stage='reading full planning and tank snapshots'
 $snapshot=Get-ViewPlanTakeOffSnapshot $db
 $rows=@(Convert-ViewPlanTakeOffProjection $snapshot)
 if($ExportPath){
  [IO.File]::WriteAllText($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ExportPath),(ConvertTo-Json -InputObject @{snapshot_at=$snapshot.snapshot_at;rows=$rows} -Depth 18),[Text.UTF8Encoding]::new($false))
  Write-Host "Read-only projection exported; no application writes"
  return
 }
 $stage='saving planning snapshot'
 $count=Send-TakeOff 'rpc/sync_take_off' @{payload=$rows;observed_at=$snapshot.snapshot_at}
 Write-Host "Take Off snapshot complete: $count planning/batch records; ViewPlan remains read only."
}catch{
 $diagnostic=Get-TakeOffHttpDiagnostic $_
 if($_.Exception.Message -like 'Projection validation:*'){$diagnostic=$_.Exception.Message}
 $message="Take Off refresh failed while $stage. $diagnostic. Previous snapshot retained."
 if(-not $ExportPath){
  try{Send-TakeOff 'take_off_sync?singleton=eq.true' @{last_error=$message;updated_at=[DateTime]::UtcNow.ToString('o')} 'Patch' | Out-Null}catch{Write-Warning 'Could not record refresh failure; check snapshot age.'}
 }
 throw $message
}
