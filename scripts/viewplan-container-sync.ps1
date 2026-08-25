param(
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"
if (-not $SupabaseUrl) { throw "NEXT_PUBLIC_SUPABASE_URL is not set." }
if (-not $ServiceRoleKey) { throw "SUPABASE_SERVICE_ROLE_KEY is not set." }

$baseUrl = $SupabaseUrl.TrimEnd('/')
$headers = @{
    apikey = $ServiceRoleKey
    Authorization = "Bearer $ServiceRoleKey"
    "Content-Type" = "application/json; charset=utf-8"
}

function Invoke-Supa([string]$method, [string]$path, $body = $null, [string]$prefer = $null) {
    $h = @{} + $headers
    if ($prefer) { $h["Prefer"] = $prefer }
    $args = @{ Method = $method; Uri = "$baseUrl/rest/v1/$path"; Headers = $h; UserAgent = "RedWillow-ViewPlan-Connector/1.0" }
    if ($null -ne $body) {
        $json = ConvertTo-Json -InputObject $body -Depth 10 -Compress
        $args["Body"] = [Text.Encoding]::UTF8.GetBytes($json)
        $args["ContentType"] = "application/json; charset=utf-8"
    }
    try { return Invoke-RestMethod @args }
    catch {
        $parts = @()
        if ($_.Exception.Message) { $parts += $_.Exception.Message }
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $parts += $_.ErrorDetails.Message }
        throw "Supabase $method $path failed:`n$(($parts | Select-Object -Unique) -join "`n")"
    }
}
function Db($rs, [string]$name) {
    $v = $rs.Fields.Item($name).Value
    if ($null -eq $v -or $v -is [DBNull]) { return $null }
    return $v
}
function IsoDate($v) {
    if ($null -eq $v) { return $null }
    return ([datetime]$v).ToString("yyyy-MM-dd")
}
function BoolValue($v) {
    if ($null -eq $v) { return $false }
    return [bool]$v
}

Write-Host "Field Ops - ViewPlan container snapshot sync"
Write-Host "-------------------------------------------"
Write-Host "ViewPlan: READ ONLY"
Write-Host "Account resolution: Supabase server-side"

try { $access = [Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application") }
catch { throw "Could not attach to running ViewPlan. Open/login first and use 32-bit PowerShell." }
$db = $access.CurrentDb()

$sql = @"
SELECT * FROM qryPackageInventory
WHERE Nz(on_site,False)=False
  AND Nz([tblPackaging_Inventory.is_deleted],False)=False
ORDER BY off_site_days DESC
"@
$rs = $db.OpenRecordset($sql)
$rows = New-Object System.Collections.Generic.List[object]
while (-not $rs.EOF) {
    $customerId = Db $rs "customer_id"
    $inventoryId = [int64](Db $rs "packaging_inventory_id")
    $itemNo = [string](Db $rs "packaging_inventory_item_no")
    if ([string]::IsNullOrWhiteSpace($itemNo)) { $itemNo = [string]$inventoryId }
    $importedAt = [datetime]::UtcNow.ToString("o")

    $rows.Add([pscustomobject]@{
        viewplan_packaging_inventory_id = $inventoryId
        viewplan_customer_id = if ($null -ne $customerId) { [int64]$customerId } else { $null }
        viewplan_item_no = $itemNo
        container_type = [string](Db $rs "packaging_type")
        contents = Db $rs "contents"
        gyle = Db $rs "brew_no"
        package_date = IsoDate (Db $rs "packaging_date")
        best_before = IsoDate (Db $rs "approx_best_before")
        stock_location = Db $rs "stock_loc_name"
        off_site_date = IsoDate (Db $rs "off_site_date")
        off_site_days = Db $rs "off_site_days"
        order_no = Db $rs "order_no_val"
        source_customer_display = Db $rs "customer_name"
        customer_town = Db $rs "customer_address_town"
        customer_postcode = Db $rs "customer_address_postcode"
        delivery_postcode = Db $rs "delivery_postcode"
        customer_class = Db $rs "customer_class"
        location_zone = Db $rs "zone_description"
        dispatched = BoolValue (Db $rs "is_dispatched")
        delivered = BoolValue (Db $rs "is_delivered")
        usage_count = Db $rs "usage_count"
        leased = BoolValue (Db $rs "is_leased")
        lease_expiry = IsoDate (Db $rs "lease_expiry_date")
        serial_no = Db $rs "packaging_inventory_serial_no"
        comment = Db $rs "comment"
        lost = BoolValue (Db $rs "is_lost")
        on_site = BoolValue (Db $rs "on_site")
        is_empty = BoolValue (Db $rs "is_empty")
        blocked = BoolValue (Db $rs "is_blocked")
        deleted = BoolValue (Db $rs "tblPackaging_Inventory.is_deleted")
        imported_at = $importedAt
    })
    $rs.MoveNext()
}
$rs.Close()

$rowArray = @($rows | ForEach-Object { $_ })
Write-Host "ViewPlan off-site source rows: $($rowArray.Count)"
if ($rowArray.Count -eq 0) {
    Write-Warning "ViewPlan returned no off-site container rows. Snapshot has NOT been replaced."
    exit 0
}

Write-Host "Sending snapshot to Brewery Ops for server-side account resolution..."
$result = @(Invoke-Supa "Post" "rpc/sync_viewplan_containers" @{ payload = $rowArray } "return=representation")
if (-not $result.Count) { throw "Container sync RPC returned no result." }

$stats = $result[0]
Write-Host "Mapped rows:             $($stats.mapped_rows)/$($stats.source_rows)"
Write-Host "Unmatched customers:     $($stats.unmatched_customers)"
Write-Host "Collectible returnables: $($stats.collectible_rows)"
Write-Host ""
Write-Host "ViewPlan container snapshot sync complete."
Write-Host "Rows synced: $($stats.mapped_rows)"
Write-Host "Collectible: $($stats.collectible_rows)"
