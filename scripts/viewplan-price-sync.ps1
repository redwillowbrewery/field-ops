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
    "Content-Type" = "application/json"
}

function Invoke-SupaGet([string]$path) {
    return Invoke-RestMethod -Method Get -Uri "$baseUrl/rest/v1/$path" -Headers $headers
}
function Invoke-SupaPost([string]$path, $body, [string]$prefer = "return=representation") {
    $h = @{} + $headers
    $h["Prefer"] = $prefer
    $json = $body | ConvertTo-Json -Depth 8 -Compress
    return Invoke-RestMethod -Method Post -Uri "$baseUrl/rest/v1/$path" -Headers $h -Body $json
}
function Invoke-SupaPatch([string]$path, $body) {
    $h = @{} + $headers
    $h["Prefer"] = "return=minimal"
    $json = $body | ConvertTo-Json -Depth 8 -Compress
    Invoke-RestMethod -Method Patch -Uri "$baseUrl/rest/v1/$path" -Headers $h -Body $json | Out-Null
}
function DbValue($recordset, [string]$name) {
    $value = $recordset.Fields.Item($name).Value
    if ($null -eq $value -or $value -is [DBNull]) { return $null }
    return $value
}
function BroadFormat([string]$packageType) {
    $v = $packageType.ToLowerInvariant()
    if ($v -match "can") { return "can" }
    if ($v -match "cask|firkin|pin") { return "cask" }
    if ($v -match "keg|litre steel|liter steel") { return "keg" }
    return "other"
}
function PackageVolume([string]$packageType) {
    if ($packageType -match "(?i)(\d+(?:\.\d+)?)\s*L(?:itre)?") { return [decimal]$matches[1] }
    if ($packageType -match "(?i)Firkin") { return [decimal]41 }
    if ($packageType -match "(?i)Pin") { return [decimal]20.5 }
    if ($packageType -match "(?i)Cans\s*\((\d+)\s*x\s*(\d+)ml\)") { return ([decimal]$matches[1] * [decimal]$matches[2]) / 1000 }
    return $null
}
function PackageCount([string]$packageType) {
    if ($packageType -match "(?i)Cans\s*\((\d+)\s*x") { return [int]$matches[1] }
    return 1
}

Write-Host "Field Ops - ViewPlan canonical commercial sync"
Write-Host "----------------------------------------------"
Write-Host "ViewPlan: READ ONLY"
Write-Host "Supabase: canonical products / variants / price lists"

try {
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application")
}
catch {
    throw "Could not attach to a running Access.Application instance. Open and log into ViewPlan first, then run this script from 32-bit PowerShell."
}

$project = $access.CurrentProject.FullName
if ($project -notmatch "mbms\.accde$|ViewPlan BMS\.accde$") {
    Write-Warning "Attached Access project is '$project'. Confirm this is the ViewPlan instance."
}
$db = $access.CurrentDb()

$sql = @"
SELECT
    bt.brew_type_id,
    bt.brew_product_name,
    bt.brew_abv,
    bt.lud AS brew_lud,
    bp.packaging_type,
    bp.wholesale_price,
    bp.wholesale_price2,
    bp.wholesale_price3,
    bp.wholesale_price4,
    bp.wholesale_price5,
    bp.wholesale_price6,
    bp.wholesale_price7,
    bp.wholesale_price8,
    bp.wholesale_price9,
    bp.wholesale_price10,
    bp.allow_sale
FROM tblBrew_Type AS bt
INNER JOIN tblBrew_Type_Packaging AS bp
    ON bt.brew_type_id = bp.brew_type_id
WHERE bt.allow_sale = True
  AND bp.allow_sale = True
ORDER BY bt.brew_product_name, bp.packaging_type
"@

$rs = $db.OpenRecordset($sql)
$rows = New-Object System.Collections.Generic.List[object]
$syncTime = [DateTime]::UtcNow.ToString("o")
while (-not $rs.EOF) {
    $row = [ordered]@{
        brew_type_id = [int](DbValue $rs "brew_type_id")
        beer_name = [string](DbValue $rs "brew_product_name")
        abv = DbValue $rs "brew_abv"
        brew_lud = DbValue $rs "brew_lud"
        packaging_type = [string](DbValue $rs "packaging_type")
        allow_sale = [bool](DbValue $rs "allow_sale")
    }
    for ($n = 1; $n -le 10; $n++) {
        $field = if ($n -eq 1) { "wholesale_price" } else { "wholesale_price$n" }
        $row["price$n"] = DbValue $rs $field
    }
    $rows.Add([PSCustomObject]$row)
    $rs.MoveNext()
}
$rs.Close()
if ($rows.Count -eq 0) { throw "No saleable ViewPlan product/package rows were returned." }
Write-Host "Saleable product/package rows: $($rows.Count)"

# Existing ViewPlan product mappings.
$productMap = @{}
$existingProductMappings = @(Invoke-SupaGet "product_external_ids?system=eq.viewplan&select=external_id,product_id")
foreach ($m in $existingProductMappings) { $productMap[[string]$m.external_id] = [string]$m.product_id }

$distinctProducts = $rows | Group-Object brew_type_id
foreach ($group in $distinctProducts) {
    $sample = $group.Group[0]
    $externalId = [string]$sample.brew_type_id
    $productId = $productMap[$externalId]
    $sourceUpdated = if ($sample.brew_lud) { ([DateTime]$sample.brew_lud).ToUniversalTime().ToString("o") } else { $syncTime }

    if (-not $productId) {
        $created = @(Invoke-SupaPost "products" @{
            name = $sample.beer_name
            abv = $sample.abv
            status = "active"
            source_updated_at = $sourceUpdated
        })
        if ($created.Count -ne 1) { throw "Could not create canonical product for ViewPlan brew_type_id $externalId" }
        $productId = [string]$created[0].id
        Invoke-SupaPost "product_external_ids" @{
            product_id = $productId
            system = "viewplan"
            external_id = $externalId
        } "return=minimal" | Out-Null
        $productMap[$externalId] = $productId
    }
    else {
        Invoke-SupaPatch "products?id=eq.$productId" @{
            name = $sample.beer_name
            abv = $sample.abv
            status = "active"
            source_updated_at = $sourceUpdated
            updated_at = $syncTime
        }
    }
}
Write-Host "Canonical products resolved: $($productMap.Count)"

# Existing ViewPlan variant mappings, keyed as brew_type_id|packaging_type.
$variantMap = @{}
$existingVariantMappings = @(Invoke-SupaGet "product_variant_external_ids?system=eq.viewplan&select=external_id,product_variant_id")
foreach ($m in $existingVariantMappings) { $variantMap[[string]$m.external_id] = [string]$m.product_variant_id }

foreach ($row in $rows) {
    $variantExternalId = "$($row.brew_type_id)|$($row.packaging_type)"
    $variantId = $variantMap[$variantExternalId]
    $productId = $productMap[[string]$row.brew_type_id]
    $variantBody = @{
        product_id = $productId
        broad_format = BroadFormat $row.packaging_type
        package_type = $row.packaging_type
        volume_litres = PackageVolume $row.packaging_type
        pack_quantity = PackageCount $row.packaging_type
        allow_sale = $row.allow_sale
        source_updated_at = $syncTime
        updated_at = $syncTime
    }
    if (-not $variantId) {
        $created = @(Invoke-SupaPost "product_variants" $variantBody)
        if ($created.Count -ne 1) { throw "Could not create variant $variantExternalId" }
        $variantId = [string]$created[0].id
        Invoke-SupaPost "product_variant_external_ids" @{
            product_variant_id = $variantId
            system = "viewplan"
            external_id = $variantExternalId
        } "return=minimal" | Out-Null
        $variantMap[$variantExternalId] = $variantId
    }
    else {
        Invoke-SupaPatch "product_variants?id=eq.$variantId" $variantBody
    }
}
Write-Host "Canonical variants resolved: $($variantMap.Count)"

$priceListMap = @{}
$priceLists = @(Invoke-SupaGet "price_lists?source_system=eq.viewplan&select=id,source_external_id")
foreach ($p in $priceLists) { $priceListMap[[string]$p.source_external_id] = [string]$p.id }
for ($n = 1; $n -le 10; $n++) {
    if (-not $priceListMap[[string]$n]) { throw "Wholesale price list $n is missing. Apply the canonical commercial model migration first." }
}

$priceRows = New-Object System.Collections.Generic.List[object]
foreach ($row in $rows) {
    $variantId = $variantMap["$($row.brew_type_id)|$($row.packaging_type)"]
    for ($n = 1; $n -le 10; $n++) {
        $price = $row."price$n"
        if ($null -eq $price) { continue }
        $priceRows.Add([PSCustomObject]@{
            product_variant_id = $variantId
            price_list_id = $priceListMap[[string]$n]
            price = $price
            source_system = "viewplan"
            source_updated_at = $syncTime
            updated_at = $syncTime
        })
    }
}

$chunkSize = 250
for ($i = 0; $i -lt $priceRows.Count; $i += $chunkSize) {
    $end = [Math]::Min($i + $chunkSize - 1, $priceRows.Count - 1)
    $chunk = @($priceRows[$i..$end])
    Invoke-SupaPost "product_prices?on_conflict=product_variant_id,price_list_id" $chunk "resolution=merge-duplicates,return=minimal" | Out-Null
    Write-Host "Prices synced: $($end + 1)/$($priceRows.Count)"
}

Write-Host ""
Write-Host "ViewPlan canonical commercial sync complete."
Write-Host "Products: $($distinctProducts.Count)"
Write-Host "Variants: $($rows.Count)"
Write-Host "Price rows: $($priceRows.Count)"
