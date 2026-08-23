param(
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"
if (-not $SupabaseUrl) { throw "NEXT_PUBLIC_SUPABASE_URL is not set." }
if (-not $ServiceRoleKey) { throw "SUPABASE_SERVICE_ROLE_KEY is not set." }

$baseUrl = $SupabaseUrl.TrimEnd('/')
$userAgent = "RedWillow-ViewPlan-Sync/1.0"
$headers = @{
    apikey = $ServiceRoleKey
    "Content-Type" = "application/json; charset=utf-8"
}

function Invoke-SupaRequest([string]$method, [string]$path, $body = $null, [string]$prefer = $null) {
    $h = @{} + $headers
    if ($prefer) { $h["Prefer"] = $prefer }
    $args = @{
        Method = $method
        Uri = "$baseUrl/rest/v1/$path"
        Headers = $h
        UserAgent = $userAgent
    }
    if ($null -ne $body) {
        $json = ConvertTo-Json -InputObject $body -Depth 8 -Compress
        $args["Body"] = [System.Text.Encoding]::UTF8.GetBytes($json)
        $args["ContentType"] = "application/json; charset=utf-8"
    }
    try {
        return Invoke-RestMethod @args
    }
    catch {
        $detail = $_.Exception.Message
        try {
            if ($_.Exception.Response) {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $responseBody = $reader.ReadToEnd()
                    if ($responseBody) { $detail = "$detail`n$responseBody" }
                }
            }
        } catch {}
        throw "Supabase $method $path failed:`n$detail"
    }
}
function Invoke-SupaGet([string]$path) { return Invoke-SupaRequest "Get" $path }
function Invoke-SupaPost([string]$path, $body, [string]$prefer = "return=representation") { return Invoke-SupaRequest "Post" $path $body $prefer }
function Invoke-SupaPatch([string]$path, $body) { Invoke-SupaRequest "Patch" $path $body "return=minimal" | Out-Null }
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
function UrlEncode([string]$value) { return [uri]::EscapeDataString($value) }

function Get-ProductMapping([string]$externalId) {
    $encoded = UrlEncode $externalId
    $rows = @(Invoke-SupaGet "product_external_ids?system=eq.viewplan&external_id=eq.$encoded&select=product_id")
    if ($rows.Count -gt 0) { return [string]$rows[0].product_id }
    return $null
}
function Get-VariantMapping([string]$externalId) {
    $encoded = UrlEncode $externalId
    $rows = @(Invoke-SupaGet "product_variant_external_ids?system=eq.viewplan&external_id=eq.$encoded&select=product_variant_id")
    if ($rows.Count -gt 0) { return [string]$rows[0].product_variant_id }
    return $null
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

$productMap = @{}
$distinctProducts = $rows | Group-Object brew_type_id
$productIndex = 0
foreach ($group in $distinctProducts) {
    $productIndex++
    $sample = $group.Group[0]
    $externalId = [string]$sample.brew_type_id
    $productId = Get-ProductMapping $externalId
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
    $productMap[$externalId] = $productId
    if (($productIndex % 100) -eq 0) { Write-Host "Products resolved: $productIndex/$($distinctProducts.Count)" }
}
Write-Host "Canonical products resolved: $($productMap.Count)"

$variantMap = @{}
$variantIndex = 0
foreach ($row in $rows) {
    $variantIndex++
    $variantExternalId = "$($row.brew_type_id)|$($row.packaging_type)"
    $variantId = Get-VariantMapping $variantExternalId
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
        # A previous partial run may have created the canonical variant before writing
        # its external-ID mapping. Recover that row using the canonical unique key.
        $pkg = UrlEncode $row.packaging_type
        $existing = @(Invoke-SupaGet "product_variants?product_id=eq.$productId&package_type=eq.$pkg&select=id")
        if ($existing.Count -gt 0) {
            $variantId = [string]$existing[0].id
        }
        else {
            $created = @(Invoke-SupaPost "product_variants" $variantBody)
            if ($created.Count -ne 1) { throw "Could not create variant $variantExternalId" }
            $variantId = [string]$created[0].id
        }

        # We already queried this exact external ID and know it is absent, so a normal
        # insert is safer than an upsert and avoids PostgREST on_conflict ambiguity.
        Invoke-SupaPost "product_variant_external_ids" @{
            product_variant_id = $variantId
            system = "viewplan"
            external_id = $variantExternalId
        } "return=minimal" | Out-Null
    }
    else {
        Invoke-SupaPatch "product_variants?id=eq.$variantId" $variantBody
    }
    $variantMap[$variantExternalId] = $variantId
    if (($variantIndex % 250) -eq 0) { Write-Host "Variants resolved: $variantIndex/$($rows.Count)" }
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
    Invoke-SupaPost "product_prices?on_conflict=product_variant_id%2Cprice_list_id" $chunk "resolution=merge-duplicates,return=minimal" | Out-Null
    Write-Host "Prices synced: $($end + 1)/$($priceRows.Count)"
}

Write-Host ""
Write-Host "ViewPlan canonical commercial sync complete."
Write-Host "Products: $($distinctProducts.Count)"
Write-Host "Variants: $($rows.Count)"
Write-Host "Price rows: $($priceRows.Count)"
