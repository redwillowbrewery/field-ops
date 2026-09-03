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
        $parts = New-Object System.Collections.Generic.List[string]
        if ($_.Exception.Message) { $parts.Add($_.Exception.Message) }
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $parts.Add($_.ErrorDetails.Message) }
        try {
            if ($_.Exception.Response) {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $responseBody = $reader.ReadToEnd()
                    if ($responseBody) { $parts.Add($responseBody) }
                }
            }
        } catch {}
        $detail = ($parts | Select-Object -Unique) -join "`n"
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
function DbValueAny($recordset, [string[]]$names, $default = $null) {
    foreach ($name in $names) {
        try { return DbValue $recordset $name } catch {}
    }
    return $default
}
function RequireDbValueAny($recordset, [string[]]$names, [string]$meaning) {
    foreach ($name in $names) {
        try {
            $recordset.Fields.Item($name) | Out-Null
            return DbValue $recordset $name
        } catch {}
    }
    throw "ViewPlan Product source does not expose $meaning. Expected one of: $($names -join ', '). Run scripts/audit-viewplan-product-state.ps1."
}
function DbBool($value, [bool]$default = $false) {
    if ($null -eq $value -or $value -is [DBNull]) { return $default }
    if ($value -is [bool]) { return $value }
    $text = ([string]$value).Trim().ToLowerInvariant()
    if ($text -in @("true", "yes", "y", "1", "-1")) { return $true }
    if ($text -in @("false", "no", "n", "0", "")) { return $false }
    return [bool]$value
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

function Get-ExistingProductMapping([string]$externalId) {
    $encoded = UrlEncode $externalId
    $found = @(Invoke-SupaGet "product_external_ids?system=eq.viewplan&external_id=eq.$encoded&select=product_id")
    if ($found.Count -gt 0) { return [string]$found[0].product_id }
    return $null
}
function Get-ExistingVariantMapping([string]$externalId) {
    $encoded = UrlEncode $externalId
    $found = @(Invoke-SupaGet "product_variant_external_ids?system=eq.viewplan&external_id=eq.$encoded&select=product_variant_id")
    if ($found.Count -gt 0) { return [string]$found[0].product_variant_id }
    return $null
}
function Get-CanonicalVariantId([string]$productId, [string]$packageType) {
    $pkg = UrlEncode $packageType
    $found = @(Invoke-SupaGet "product_variants?product_id=eq.$productId&package_type=eq.$pkg&select=id")
    if ($found.Count -gt 0) { return [string]$found[0].id }
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

$productNameRs = $db.OpenRecordset(@"
SELECT internal_id, product_name, is_available
FROM tblBrew_Product_Names_List
ORDER BY product_name, internal_id
"@)
$productNameState = @{}
while (-not $productNameRs.EOF) {
    $productName = ([string](DbValue $productNameRs "product_name")).Trim()
    if (-not [string]::IsNullOrWhiteSpace($productName)) {
        $available = DbBool (DbValue $productNameRs "is_available") $false
        if ($productNameState.ContainsKey($productName) -and $productNameState[$productName].available -ne $available) {
            throw "ViewPlan Product Names contains contradictory Available values for exact name '$productName'; no reconciliation was attempted."
        }
        $productNameState[$productName] = [PSCustomObject]@{
            internal_id = DbValue $productNameRs "internal_id"
            available = $available
        }
    }
    $productNameRs.MoveNext()
}
$productNameRs.Close()
if (-not $productNameState.Count) { throw "No ViewPlan Product Names were returned; refusing to reconcile an empty catalogue." }
Write-Host "ViewPlan Product Names: $($productNameState.Count)"

$productSql = @"
SELECT bt.*
FROM tblBrew_Type AS bt
ORDER BY bt.brew_product_name
"@

$productRs = $db.OpenRecordset($productSql)
$productRows = New-Object System.Collections.Generic.List[object]
$syncTime = [DateTime]::UtcNow.ToString("o")
while (-not $productRs.EOF) {
    $beerName = ([string](DbValue $productRs "brew_product_name")).Trim()
    if (-not $productNameState.ContainsKey($beerName)) {
        throw "ViewPlan Brew Type '$beerName' has no exact Product Names row; no reconciliation was attempted."
    }
    $sourceAvailable = $productNameState[$beerName].available
    $sourceSellable = RequireDbValueAny $productRs @("allow_sale", "isAvailableForSale", "is_available_for_sale") "sellable state"
    $sourceBusinessExchange = RequireDbValueAny $productRs @("is_bex", "BeX", "bex", "business_exchange") "Business Exchange state"
    $productRows.Add([PSCustomObject][ordered]@{
        brew_type_id = [int](DbValue $productRs "brew_type_id")
        beer_name = $beerName
        abv = DbValue $productRs "brew_abv"
        brew_lud = DbValueAny $productRs @("lud") $null
        active = DbBool $sourceAvailable $true
        sellable = DbBool $sourceSellable $true
        business_exchange = DbBool $sourceBusinessExchange $false
    })
    $productRs.MoveNext()
}
$productRs.Close()
if ($productRows.Count -eq 0) { throw "No ViewPlan Products were returned; refusing to reconcile an empty catalogue." }
Write-Host "ViewPlan Products: $($productRows.Count)"
$activeProductCount = @($productRows | Where-Object { $_.active -and -not $_.business_exchange }).Count
$inactiveProductCount = @($productRows | Where-Object { -not $_.active }).Count
$businessExchangeCount = @($productRows | Where-Object { $_.business_exchange }).Count
Write-Host "Current RedWillow catalogue: $activeProductCount"
Write-Host "Inactive historical Products: $inactiveProductCount"
Write-Host "Business Exchange Products retained: $businessExchangeCount"

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
ORDER BY bt.brew_product_name, bp.packaging_type
"@

$rs = $db.OpenRecordset($sql)
$rows = New-Object System.Collections.Generic.List[object]
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
if ($rows.Count -eq 0) { throw "No ViewPlan product/package rows were returned; refusing to reconcile an empty variant catalogue." }
Write-Host "Product/package rows: $($rows.Count)"

$productMap = @{}
$productIndex = 0
foreach ($sourceProduct in $productRows) {
    $productIndex++
    $externalId = [string]$sourceProduct.brew_type_id
    $productId = Get-ExistingProductMapping $externalId
    $sourceUpdated = if ($sourceProduct.brew_lud) { ([DateTime]$sourceProduct.brew_lud).ToUniversalTime().ToString("o") } else { $syncTime }
    $canonicalStatus = if ($sourceProduct.active) { "active" } else { "inactive" }

    if (-not $productId) {
        $created = @(Invoke-SupaPost "products" @{
            name = $sourceProduct.beer_name
            abv = $sourceProduct.abv
            status = $canonicalStatus
            active = $sourceProduct.active
            sellable = $sourceProduct.sellable
            business_exchange = $sourceProduct.business_exchange
            source_updated_at = $sourceUpdated
        })
        if ($created.Count -ne 1) { throw "Could not create canonical product for ViewPlan brew_type_id $externalId" }
        $candidateProductId = [string]$created[0].id

        try {
            Invoke-SupaPost "product_external_ids?on_conflict=system%2Cexternal_id" @{
                product_id = $candidateProductId
                system = "viewplan"
                external_id = $externalId
            } "resolution=ignore-duplicates,return=minimal" | Out-Null
        }
        catch {
            throw "Could not map ViewPlan product $externalId after creating candidate product $candidateProductId.`n$($_.Exception.Message)"
        }

        $productId = Get-ExistingProductMapping $externalId
        if (-not $productId) { throw "ViewPlan product mapping $externalId was not readable after insert." }
    }

    Invoke-SupaPatch "products?id=eq.$productId" @{
        name = $sourceProduct.beer_name
        abv = $sourceProduct.abv
        status = $canonicalStatus
        active = $sourceProduct.active
        sellable = $sourceProduct.sellable
        business_exchange = $sourceProduct.business_exchange
        source_updated_at = $sourceUpdated
        updated_at = $syncTime
    }

    $productMap[$externalId] = $productId
    if (($productIndex % 100) -eq 0) { Write-Host "Products resolved: $productIndex/$($productRows.Count)" }
}
Write-Host "Canonical products resolved: $($productMap.Count)"

$variantMap = @{}
$variantIndex = 0
foreach ($row in $rows) {
    $variantIndex++
    $variantExternalId = "$($row.brew_type_id)|$($row.packaging_type)"
    $variantId = Get-ExistingVariantMapping $variantExternalId
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
        $candidateVariantId = Get-CanonicalVariantId $productId $row.packaging_type

        if (-not $candidateVariantId) {
            Invoke-SupaPost "product_variants" $variantBody "return=minimal" | Out-Null
            $candidateVariantId = Get-CanonicalVariantId $productId $row.packaging_type
            if (-not $candidateVariantId) {
                throw "Canonical variant '$variantExternalId' was not readable after insert."
            }
        }

        try {
            Invoke-SupaPost "product_variant_external_ids?on_conflict=system%2Cexternal_id" @{
                product_variant_id = $candidateVariantId
                system = "viewplan"
                external_id = $variantExternalId
            } "resolution=ignore-duplicates,return=minimal" | Out-Null
        }
        catch {
            throw "Variant mapping failed at row $variantIndex/$($rows.Count) for '$variantExternalId' (variant $candidateVariantId).`n$($_.Exception.Message)"
        }

        $variantId = Get-ExistingVariantMapping $variantExternalId
        if (-not $variantId) { throw "ViewPlan variant mapping '$variantExternalId' was not readable after insert." }
    }

    Invoke-SupaPatch "product_variants?id=eq.$variantId" $variantBody
    $variantMap[$variantExternalId] = $variantId
    if (($variantIndex % 250) -eq 0) { Write-Host "Variants resolved: $variantIndex/$($rows.Count)" }
}
Write-Host "Canonical variants resolved: $($variantMap.Count)"

$priceListMap = @{}
for ($n = 1; $n -le 10; $n++) {
    $pl = @(Invoke-SupaGet "price_lists?source_system=eq.viewplan&source_external_id=eq.$n&select=id")
    if ($pl.Count -eq 0) { throw "Wholesale price list $n is missing. Apply the canonical commercial model migration first." }
    $priceListMap[[string]$n] = [string]$pl[0].id
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
Write-Host "Products: $($productRows.Count)"
Write-Host "Variants: $($rows.Count)"
Write-Host "Price rows: $($priceRows.Count)"
