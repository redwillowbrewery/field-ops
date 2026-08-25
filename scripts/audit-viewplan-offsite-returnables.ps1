$ErrorActionPreference = "Stop"

Write-Host "Brewery Ops - ViewPlan off-site returnables audit"
Write-Host "-----------------------------------------------"
Write-Host "ViewPlan: READ ONLY"
Write-Host "Source: qryPackageInventory"
Write-Host "Goal: confirm the exact flags that define a collectible returnable"
Write-Host ""

try {
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application")
}
catch {
    throw "Could not attach to a running Access.Application instance. Open and log into ViewPlan first, then run this script from 32-bit PowerShell."
}

$db = $access.CurrentDb()

$sql = @"
SELECT TOP 30
    packaging_inventory_id,
    packaging_type,
    packaging_inventory_item_no,
    packaging_inventory_serial_no,
    on_site,
    on_site_date,
    is_empty,
    is_blocked,
    [tblPackaging_Inventory.is_deleted] AS is_deleted,
    is_leased,
    lease_expiry_date,
    is_lost,
    is_clean,
    is_dispatched,
    is_delivered,
    off_site_date,
    off_site_days,
    customer_id,
    customer_name,
    customer_address_town,
    customer_address_postcode,
    delivery_postcode,
    order_no_val,
    contents,
    stock_loc_id,
    stock_loc_name
FROM qryPackageInventory
WHERE Nz(on_site,False)=False
  AND Nz([tblPackaging_Inventory.is_deleted],False)=False
ORDER BY off_site_days DESC, customer_name, packaging_type;
"@

$rs = $db.OpenRecordset($sql)
$count = 0
while (-not $rs.EOF) {
    $count++
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($field in $rs.Fields) {
        $value = $field.Value
        if ($null -eq $value -or $value -is [DBNull]) { $value = "" }
        $parts.Add("$($field.Name)=$value")
    }
    Write-Host "row $count | $(($parts.ToArray()) -join ' | ')"
    $rs.MoveNext()
}
$rs.Close()

Write-Host ""
Write-Host "Package-type summary for all current off-site records"
Write-Host "-----------------------------------------------------"
$summarySql = @"
SELECT packaging_type,
       Count(*) AS qty,
       Sum(IIf(Nz(is_lost,False)=True,1,0)) AS lost_qty,
       Sum(IIf(Nz(is_leased,False)=True,1,0)) AS leased_qty,
       Sum(IIf(Nz(is_dispatched,False)=True,1,0)) AS dispatched_qty,
       Sum(IIf(Nz(is_delivered,False)=True,1,0)) AS delivered_qty
FROM qryPackageInventory
WHERE Nz(on_site,False)=False
  AND Nz([tblPackaging_Inventory.is_deleted],False)=False
GROUP BY packaging_type
ORDER BY Count(*) DESC, packaging_type;
"@
$rs = $db.OpenRecordset($summarySql)
while (-not $rs.EOF) {
    Write-Host ("{0} | qty={1} | lost={2} | leased={3} | dispatched={4} | delivered={5}" -f `
        $rs.Fields.Item("packaging_type").Value,
        $rs.Fields.Item("qty").Value,
        $rs.Fields.Item("lost_qty").Value,
        $rs.Fields.Item("leased_qty").Value,
        $rs.Fields.Item("dispatched_qty").Value,
        $rs.Fields.Item("delivered_qty").Value)
    $rs.MoveNext()
}
$rs.Close()

Write-Host ""
Write-Host "Customer examples with most off-site physical packages"
Write-Host "------------------------------------------------------"
$customerSql = @"
SELECT TOP 15 customer_id, customer_name, customer_address_town, customer_address_postcode, Count(*) AS qty, Max(off_site_days) AS oldest_days
FROM qryPackageInventory
WHERE Nz(on_site,False)=False
  AND Nz([tblPackaging_Inventory.is_deleted],False)=False
  AND Nz(is_lost,False)=False
  AND customer_id Is Not Null
GROUP BY customer_id, customer_name, customer_address_town, customer_address_postcode
ORDER BY Count(*) DESC, Max(off_site_days) DESC;
"@
$rs = $db.OpenRecordset($customerSql)
while (-not $rs.EOF) {
    Write-Host ("customer_id={0} | {1} | {2} | {3} | qty={4} | oldest={5}d" -f `
        $rs.Fields.Item("customer_id").Value,
        $rs.Fields.Item("customer_name").Value,
        $rs.Fields.Item("customer_address_town").Value,
        $rs.Fields.Item("customer_address_postcode").Value,
        $rs.Fields.Item("qty").Value,
        $rs.Fields.Item("oldest_days").Value)
    $rs.MoveNext()
}
$rs.Close()

Write-Host ""
Write-Host "Audit complete. Paste the sample rows and both summaries back into ChatGPT."
