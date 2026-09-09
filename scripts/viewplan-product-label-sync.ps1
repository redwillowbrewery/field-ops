param(
 [string]$SupabaseUrl=$env:NEXT_PUBLIC_SUPABASE_URL,
 [string]$ServiceRoleKey=$env:SUPABASE_SERVICE_ROLE_KEY
)
$ErrorActionPreference='Stop'
if(-not $SupabaseUrl -or -not $ServiceRoleKey){throw 'Product label sync requires Supabase connector credentials.'}
if([Environment]::Is64BitProcess){throw 'Product label sync requires 32-bit Windows PowerShell.'}
$started=[DateTime]::UtcNow
$rs=$null
try {
 $access=[Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application')
 $db=$access.CurrentDb()
 $rows=New-Object System.Collections.Generic.List[object]
 $rs=$db.OpenRecordset('SELECT TOP 10001 [brew_type_id],[brew_product_name],[brew_abv],[label_text],[is_vegan],[is_sys],[is_bex],[lud] FROM [tblBrew_Type] ORDER BY [brew_type_id]',4)
 while(-not $rs.EOF){
  if($rows.Count -ge 10000){throw 'Product label snapshot exceeds the row limit.'}
  $row=[ordered]@{}
  foreach($f in $rs.Fields){
   $v=$f.Value
   if($null -eq $v -or $v -is [DBNull]){$v=$null}
   elseif($v -is [DateTime]){$v=$v.ToString('o')}
   $row[[string]$f.Name]=$v
  }
  $rows.Add([pscustomobject]$row);$rs.MoveNext()
 }
 if(-not $rows.Count){throw 'Empty product label snapshot.'}
 $body=ConvertTo-Json -InputObject @{p_rows=@($rows.ToArray());p_observed_at=$started.ToString('o')} -Depth 6 -Compress
 $count=Invoke-RestMethod -Method Post -Uri ($SupabaseUrl.TrimEnd('/')+'/rest/v1/rpc/sync_product_label_observations') -Headers @{apikey=$ServiceRoleKey} -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120
 Write-Host "Product label observations complete: $count rows. Published information unchanged."
} catch {
 throw 'Product label refresh failed. Previous successful observations and reviewed product information retained. Check ViewPlan session, migration and connector credentials.'
} finally {if($null -ne $rs){$rs.Close()}}
