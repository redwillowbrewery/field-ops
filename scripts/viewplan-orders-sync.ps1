param(
 [string]$SupabaseUrl=$env:NEXT_PUBLIC_SUPABASE_URL,
 [string]$ServiceRoleKey=$env:SUPABASE_SERVICE_ROLE_KEY,
 [string]$ExportPath
)
$ErrorActionPreference='Stop'
if([Environment]::Is64BitProcess){throw 'Use 32-bit Windows PowerShell in the authenticated ViewPlan session.'}
. (Join-Path $PSScriptRoot 'viewplan-orders-source.ps1')
$lock=$null
try{
 $lock=[IO.File]::Open((Join-Path $PSScriptRoot 'viewplan-orders-sync.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
}catch{throw 'Another order poll is running or the lock file is inaccessible.'}
function Send-Orders([string]$path,$body){
 Invoke-RestMethod -Method Post -Uri ($SupabaseUrl.TrimEnd('/')+'/rest/v1/'+$path) -Headers @{apikey=$ServiceRoleKey} -UserAgent 'RedWillow-BreweryOps-ViewPlan-Connector/1.2' -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $body -Depth 20 -Compress))) -TimeoutSec 180
}
try{
 if(-not $ExportPath -and (-not $SupabaseUrl -or -not $ServiceRoleKey)){throw 'Order connector credentials required'}
 $tracked=New-Object System.Collections.Generic.List[long]
 if(-not $ExportPath){
  for($offset=0;;$offset+=1000){
   $response=Invoke-RestMethod -Method Get -Uri ($SupabaseUrl.TrimEnd('/')+"/rest/v1/fulfilment_orders?select=source_id&order=source_id&limit=1000&offset=$offset") -Headers @{apikey=$ServiceRoleKey} -UserAgent 'RedWillow-BreweryOps-ViewPlan-Connector/1.2' -TimeoutSec 60
   $rows=@(Get-FulfilmentTrackedIds -Response $response)
   foreach($id in $rows){$tracked.Add($id)}
   if($rows.Count -lt 1000){break}
   if($tracked.Count -ge 10000){throw 'Tracked order limit reached; review archive scope before polling'}
  }
 }
 $access=[Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application');$db=$access.CurrentDb()
 $result=Get-FulfilmentProjection -db $db -TrackedIds ($tracked.ToArray())
 if($ExportPath){
  [IO.File]::WriteAllText($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ExportPath),(ConvertTo-Json -InputObject $result -Depth 20),[Text.UTF8Encoding]::new($false))
  Write-Host 'Read-only order projection exported. No Brewery Ops writes.'
 }else{
  $count=Send-Orders 'rpc/sync_fulfilment_orders' $result
  Write-Host "Orders refreshed: $count. ViewPlan remains read only."
 }
}catch{
 if(-not $ExportPath -and $SupabaseUrl -and $ServiceRoleKey){
  try{Invoke-RestMethod -Method Patch -Uri ($SupabaseUrl.TrimEnd('/')+'/rest/v1/fulfilment_sync?singleton=eq.true') -Headers @{apikey=$ServiceRoleKey} -UserAgent 'RedWillow-BreweryOps-ViewPlan-Connector/1.2' -ContentType 'application/json' -Body '{"last_error":"Order poll failed. Previous snapshots retained."}' -TimeoutSec 30|Out-Null}catch{Write-Warning 'Could not record order failure; check source age.'}
 }
 throw
}finally{if($null -ne $lock){$lock.Dispose()}}
