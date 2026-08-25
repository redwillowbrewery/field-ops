param(
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"
if (-not $SupabaseUrl) { throw "NEXT_PUBLIC_SUPABASE_URL is not set." }
if (-not $ServiceRoleKey) { throw "SUPABASE_SERVICE_ROLE_KEY is not set." }

$baseUrl = $SupabaseUrl.TrimEnd('/')
$headers = @{ apikey=$ServiceRoleKey; "Content-Type"="application/json; charset=utf-8" }

function Invoke-Supa([string]$method,[string]$path,$body=$null,[string]$prefer=$null){
  $h=@{}+$headers; if($prefer){$h["Prefer"]=$prefer}
  $args=@{Method=$method;Uri="$baseUrl/rest/v1/$path";Headers=$h;UserAgent="RedWillow-ViewPlan-Connector/1.0"}
  if($null-ne$body){$json=ConvertTo-Json -InputObject $body -Depth 8 -Compress;$args.Body=[Text.Encoding]::UTF8.GetBytes($json);$args.ContentType="application/json; charset=utf-8"}
  try{return Invoke-RestMethod @args}catch{throw "Supabase $method $path failed:`n$($_.Exception.Message)`n$($_.ErrorDetails.Message)"}
}
function Db($rs,[string]$name){$v=$rs.Fields.Item($name).Value;if($null-eq$v-or$v-is[DBNull]){return $null};return $v}
function IsoDate($v){if($null-eq$v){return $null};return ([datetime]$v).ToString("yyyy-MM-dd")}

Write-Host "Field Ops - ViewPlan container snapshot sync"
Write-Host "-------------------------------------------"
Write-Host "ViewPlan: READ ONLY"

try{$access=[Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application")}catch{throw "Could not attach to running ViewPlan. Open/login first and use 32-bit PowerShell."}
$db=$access.CurrentDb()

$accountMap=@{}
for($from=0;;$from+=1000){
  $page=@(Invoke-Supa "Get" "account_external_ids?system=eq.viewplan&select=external_id,account_id&offset=$from&limit=1000")
  foreach($m in $page){$accountMap[[string]$m.external_id]=[string]$m.account_id}
  if($page.Count-lt1000){break}
}

$classMap=@{}
foreach($c in @(Invoke-Supa "Get" "packaging_type_classification?select=package_type,is_returnable")){$classMap[[string]$c.package_type]=[bool]$c.is_returnable}

$sql=@"
SELECT * FROM qryPackageInventory
WHERE Nz(on_site,False)=False
  AND Nz([tblPackaging_Inventory.is_deleted],False)=False
ORDER BY off_site_days DESC
"@
$rs=$db.OpenRecordset($sql)
$rows=New-Object System.Collections.Generic.List[object]
$unmatched=New-Object System.Collections.Generic.HashSet[string]
while(-not$rs.EOF){
  $customerId=Db $rs "customer_id"
  $accountId=if($null-ne$customerId){$accountMap[[string]$customerId]}else{$null}
  if(-not$accountId){if($null-ne$customerId){[void]$unmatched.Add([string]$customerId)};$rs.MoveNext();continue}
  $package=[string](Db $rs "packaging_type")
  $inventoryId=[int64](Db $rs "packaging_inventory_id")
  $itemNo=[string](Db $rs "packaging_inventory_item_no");if([string]::IsNullOrWhiteSpace($itemNo)){$itemNo=[string]$inventoryId}
  $isReturnable=if($classMap.ContainsKey($package)){$classMap[$package]}else{$false}
  $rows.Add([pscustomobject]@{
    account_id=$accountId
    viewplan_packaging_inventory_id=$inventoryId
    viewplan_customer_id=if($null-ne$customerId){[int64]$customerId}else{$null}
    viewplan_item_no=$itemNo
    container_type=$package
    contents=Db $rs "contents"
    gyle=Db $rs "brew_no"
    package_date=IsoDate (Db $rs "packaging_date")
    best_before=IsoDate (Db $rs "approx_best_before")
    stock_location=Db $rs "stock_loc_name"
    off_site_date=IsoDate (Db $rs "off_site_date")
    off_site_days=Db $rs "off_site_days"
    order_no=Db $rs "order_no_val"
    source_customer_display=Db $rs "customer_name"
    customer_town=Db $rs "customer_address_town"
    customer_postcode=Db $rs "customer_address_postcode"
    delivery_postcode=Db $rs "delivery_postcode"
    customer_class=Db $rs "customer_class"
    location_zone=Db $rs "zone_description"
    dispatched=Db $rs "is_dispatched"
    delivered=Db $rs "is_delivered"
    usage_count=Db $rs "usage_count"
    leased=Db $rs "is_leased"
    lease_expiry=IsoDate (Db $rs "lease_expiry_date")
    serial_no=Db $rs "packaging_inventory_serial_no"
    comment=Db $rs "comment"
    lost=[bool](Db $rs "is_lost")
    on_site=[bool](Db $rs "on_site")
    is_empty=[bool](Db $rs "is_empty")
    blocked=[bool](Db $rs "is_blocked")
    deleted=[bool](Db $rs "tblPackaging_Inventory.is_deleted")
    is_returnable=$isReturnable
    imported_at=[datetime]::UtcNow.ToString("o")
  })
  $rs.MoveNext()
}
$rs.Close()

Write-Host "Off-site rows prepared: $($rows.Count)"
Write-Host "Unmatched ViewPlan customers: $($unmatched.Count)"
Write-Host "Collectible returnables: $(@($rows|Where-Object{$_.is_returnable-and-not$_.lost}).Count)"

# Snapshot replacement only begins after the entire ViewPlan read/mapping phase has succeeded.
Invoke-Supa "Delete" "account_containers_snapshot?id=not.is.null" $null "return=minimal" | Out-Null
$chunkSize=250
for($i=0;$i-lt$rows.Count;$i+=$chunkSize){
  $end=[Math]::Min($i+$chunkSize-1,$rows.Count-1)
  $chunk=@($rows[$i..$end])
  Invoke-Supa "Post" "account_containers_snapshot" $chunk "return=minimal" | Out-Null
  Write-Host "Containers synced: $($end+1)/$($rows.Count)"
}

Write-Host ""
Write-Host "ViewPlan container snapshot sync complete."
Write-Host "Rows synced: $($rows.Count)"
Write-Host "Collectible: $(@($rows|Where-Object{$_.is_returnable-and-not$_.lost}).Count)"
if($unmatched.Count){Write-Warning "Unmatched ViewPlan customer IDs: $([string]::Join(', ',@($unmatched)))"}
