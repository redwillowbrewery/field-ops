param(
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"
if (-not $SupabaseUrl) { throw "NEXT_PUBLIC_SUPABASE_URL is not set." }
if (-not $ServiceRoleKey) { throw "SUPABASE_SERVICE_ROLE_KEY is not set." }

$baseUrl = $SupabaseUrl.TrimEnd('/')
$headers = @{ apikey = $ServiceRoleKey; "Content-Type" = "application/json; charset=utf-8" }

function Invoke-SupaRequest([string]$method,[string]$path,$body=$null,[string]$prefer=$null) {
    $h = @{} + $headers
    if ($prefer) { $h["Prefer"] = $prefer }
    $args = @{ Method=$method; Uri="$baseUrl/rest/v1/$path"; Headers=$h; UserAgent="RedWillow-ViewPlan-Sync/1.0" }
    if ($null -ne $body) {
        $json = ConvertTo-Json -InputObject $body -Depth 8 -Compress
        $args["Body"] = [System.Text.Encoding]::UTF8.GetBytes($json)
        $args["ContentType"] = "application/json; charset=utf-8"
    }
    try { return Invoke-RestMethod @args }
    catch {
        $parts = New-Object System.Collections.Generic.List[string]
        if ($_.Exception.Message) { $parts.Add($_.Exception.Message) }
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $parts.Add($_.ErrorDetails.Message) }
        throw "Supabase $method $path failed:`n$(($parts | Select-Object -Unique) -join "`n")"
    }
}
function Invoke-SupaGet([string]$path) { Invoke-SupaRequest "Get" $path }
function Invoke-SupaPost([string]$path,$body,[string]$prefer="return=representation") { Invoke-SupaRequest "Post" $path $body $prefer }
function Invoke-SupaPatch([string]$path,$body) { Invoke-SupaRequest "Patch" $path $body "return=minimal" | Out-Null }
function UrlEncode([string]$value) { [uri]::EscapeDataString($value) }
function DbValue($rs,[string]$name) {
    $value = $rs.Fields.Item($name).Value
    if ($null -eq $value -or $value -is [DBNull]) { return $null }
    $value
}

function Canonical-Semantics([string]$name) {
    switch -Regex ($name) {
        '^Firkin$'               { return @{ broad_format='cask'; package_system='Firkin'; lifecycle='brewery_returnable'; procurement_mode='reusable_asset'; draught=$true } }
        '^Backfill Firkin$'      { return @{ broad_format='cask'; package_system='Firkin'; lifecycle='brewery_returnable'; procurement_mode='reusable_asset'; draught=$true } }
        '^Wooden Firkin$'        { return @{ broad_format='cask'; package_system='Wooden Firkin'; lifecycle='brewery_returnable'; procurement_mode='reusable_asset'; draught=$true } }
        '^Pin$'                  { return @{ broad_format='cask'; package_system='Pin'; lifecycle='brewery_returnable'; procurement_mode='reusable_asset'; draught=$true } }
        '^Pin \(Flat Bottom\)$' { return @{ broad_format='cask'; package_system='Pin'; lifecycle='brewery_returnable'; procurement_mode='reusable_asset'; draught=$true } }
        '^Backfill Pin$'         { return @{ broad_format='cask'; package_system='Pin'; lifecycle='brewery_returnable'; procurement_mode='reusable_asset'; draught=$true } }
        '^Kilderkin$'            { return @{ broad_format='cask'; package_system='Kilderkin'; lifecycle='brewery_returnable'; procurement_mode='reusable_asset'; draught=$true } }
        '^Barrel$'               { return @{ broad_format='cask'; package_system='Barrel'; lifecycle='brewery_returnable'; procurement_mode='reusable_asset'; draught=$true } }
        '^36G Cask$'             { return @{ broad_format='cask'; package_system='36G Cask'; lifecycle='brewery_returnable'; procurement_mode='reusable_asset'; draught=$true } }
        '^E-Cask$'               { return @{ broad_format='cask'; package_system='E-Cask'; lifecycle='one_way'; procurement_mode='consumable'; draught=$true } }
        '^10L Poly pin$'         { return @{ broad_format='cask'; package_system='Polypin'; lifecycle='one_way'; procurement_mode='consumable'; draught=$true } }
        '^20L polypin$'          { return @{ broad_format='cask'; package_system='Polypin'; lifecycle='one_way'; procurement_mode='consumable'; draught=$true } }
        '^30 Litre Steel$'       { return @{ broad_format='keg'; package_system='Steel'; lifecycle='brewery_returnable'; procurement_mode='reusable_asset'; draught=$true } }
        '^50 Litre Keg$'         { return @{ broad_format='keg'; package_system='Steel'; lifecycle='brewery_returnable'; procurement_mode='reusable_asset'; draught=$true } }
        '^50L E-Keg$'            { return @{ broad_format='keg'; package_system='E-Keg'; lifecycle='one_way'; procurement_mode='consumable'; draught=$true } }
        '^E-Keg$'                { return @{ broad_format='keg'; package_system='E-Keg'; lifecycle='one_way'; procurement_mode='consumable'; draught=$true } }
        '^20L Key Keg$'          { return @{ broad_format='keg'; package_system='Key Keg'; lifecycle='one_way'; procurement_mode='consumable'; draught=$true } }
        '^Key Keg$'              { return @{ broad_format='keg'; package_system='Key Keg'; lifecycle='one_way'; procurement_mode='consumable'; draught=$true } }
        '^Key Keg Perception$'   { return @{ broad_format='keg'; package_system='Key Keg'; lifecycle='one_way'; procurement_mode='consumable'; draught=$true } }
        '^20L Poly Keg$'         { return @{ broad_format='keg'; package_system='Poly Keg'; lifecycle='one_way'; procurement_mode='consumable'; draught=$true } }
        '^Poly Keg'              { return @{ broad_format='keg'; package_system='Poly Keg'; lifecycle='one_way'; procurement_mode='consumable'; draught=$true } }
        '^20L KegStar$'          { return @{ broad_format='keg'; package_system='Kegstar'; lifecycle='third_party_returnable'; procurement_mode='externally_supplied'; draught=$true } }
        '^30L Kegstar$'          { return @{ broad_format='keg'; package_system='Kegstar'; lifecycle='third_party_returnable'; procurement_mode='externally_supplied'; draught=$true } }
        '^50L Kegstar$'          { return @{ broad_format='keg'; package_system='Kegstar'; lifecycle='third_party_returnable'; procurement_mode='externally_supplied'; draught=$true } }
        '^Kegstar'               { return @{ broad_format='keg'; package_system='Kegstar'; lifecycle='third_party_returnable'; procurement_mode='externally_supplied'; draught=$true } }
        '^5L Mini Keg$'          { return @{ broad_format='keg'; package_system='Mini Keg'; lifecycle='one_way'; procurement_mode='consumable'; draught=$true } }
        '^Mini Keg$'             { return @{ broad_format='keg'; package_system='Mini Keg'; lifecycle='one_way'; procurement_mode='consumable'; draught=$true } }
        '^Robinsons Tanker$'     { return @{ broad_format='other'; package_system='Bulk Tanker'; lifecycle='one_way'; procurement_mode='none'; draught=$true } }
        '^Case \(12x330ml\)$'   { return @{ broad_format='bottle'; package_system='Case'; lifecycle='non_container'; procurement_mode='consumable'; draught=$false } }
        '^Case \(12x500ml\)$'   { return @{ broad_format='bottle'; package_system='Case'; lifecycle='non_container'; procurement_mode='consumable'; draught=$false } }
        '^Case \(6x750ml\)$'    { return @{ broad_format='bottle'; package_system='Case'; lifecycle='non_container'; procurement_mode='consumable'; draught=$false } }
        'Can'                    { return @{ broad_format='can'; package_system='Can'; lifecycle='non_container'; procurement_mode='consumable'; draught=$false } }
        'Bottle'                 { return @{ broad_format='bottle'; package_system='Bottle'; lifecycle='non_container'; procurement_mode='consumable'; draught=$false } }
        default                  { return $null }
    }
}

Write-Host "Field Ops - ViewPlan canonical package sync"
Write-Host "-------------------------------------------"
Write-Host "ViewPlan: READ ONLY"
Write-Host "Authority: Brewery Ops canonical lifecycle/procurement semantics"

try { $access = [Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application") }
catch { throw "Could not attach to ViewPlan. Open/log into ViewPlan and run from 32-bit PowerShell." }
$db = $access.CurrentDb()

$sql = @"
SELECT DISTINCT
    bp.packaging_type,
    ptl.litre_capacity
FROM
    (tblBrew_Type AS bt
    INNER JOIN tblBrew_Type_Packaging AS bp
        ON bt.brew_type_id = bp.brew_type_id)
    LEFT JOIN tblPackaging_Type_List AS ptl
        ON bp.packaging_type = ptl.packaging_type
WHERE bt.allow_sale = True
  AND bp.allow_sale = True
ORDER BY bp.packaging_type
"@

$rs = $db.OpenRecordset($sql)
$rows = New-Object System.Collections.Generic.List[object]
while (-not $rs.EOF) {
    $rows.Add([PSCustomObject]@{
        name = [string](DbValue $rs 'packaging_type')
        capacity = DbValue $rs 'litre_capacity'
    })
    $rs.MoveNext()
}
$rs.Close()
if ($rows.Count -eq 0) { throw "No active ViewPlan package types were returned." }

$resolved = 0
$unmapped = New-Object System.Collections.Generic.List[string]
foreach ($row in $rows) {
    $sem = Canonical-Semantics $row.name
    if ($null -eq $sem) {
        $unmapped.Add($row.name)
        Write-Warning "No canonical package semantics for '$($row.name)'"
        continue
    }

    $body = @{
        name = $row.name
        broad_format = $sem.broad_format
        package_system = $sem.package_system
        capacity_litres = $row.capacity
        lifecycle = $sem.lifecycle
        procurement_mode = $sem.procurement_mode
        draught = $sem.draught
        active = $true
        source_system = 'viewplan'
        source_reference = $row.name
        updated_at = [DateTime]::UtcNow.ToString('o')
    }
    Invoke-SupaPost "packages?on_conflict=source_system%2Csource_reference" $body "resolution=merge-duplicates,return=minimal" | Out-Null

    $pkgName = UrlEncode $row.name
    $pkg = @(Invoke-SupaGet "packages?source_system=eq.viewplan&source_reference=eq.$pkgName&select=id")
    if ($pkg.Count -ne 1) { throw "Canonical Package '$($row.name)' did not resolve uniquely after upsert." }
    $packageId = [string]$pkg[0].id

    Invoke-SupaPatch "product_variants?package_type=ilike.$pkgName" @{ package_id = $packageId }
    $resolved++
}

Write-Host "Active package types read: $($rows.Count)"
Write-Host "Canonical packages resolved: $resolved"
Write-Host "Unmapped package types: $($unmapped.Count)"
if ($unmapped.Count -gt 0) {
    Write-Host "Unmapped: $($unmapped -join ', ')"
    throw "Package sync incomplete: $($unmapped.Count) active package type(s) need explicit canonical semantics. No name-based fallback was applied."
}

# Query the canonical table directly rather than relying on the migration-time diagnostic view.
$missingResult = Invoke-SupaGet "product_variants?package_id=is.null&allow_sale=eq.true&select=id%2Cproduct_id%2Cpackage_type%2Cbroad_format%2Callow_sale%2Csource_system%2Csource_reference"
$missing = @()
if ($null -ne $missingResult) { $missing = @($missingResult) }
Write-Host "Live variants without canonical Package: $($missing.Count)"
if ($missing.Count -gt 0) {
    Write-Host "Unresolved live variants:"
    foreach ($variant in $missing) {
        $productName = '<no product link>'
        $sourceRef = ''
        $productId = if ($null -eq $variant.product_id) { '' } else { ([string]$variant.product_id).Trim() }
        if (-not [string]::IsNullOrWhiteSpace($productId)) {
            $encodedProductId = UrlEncode $productId
            $product = @(Invoke-SupaGet "products?id=eq.$encodedProductId&select=id%2Cname%2Csource_system%2Csource_reference")
            if ($product.Count -eq 1) {
                $productName = [string]$product[0].name
                $sourceRef = [string]$product[0].source_reference
            } else {
                $productName = '<product not resolved>'
            }
        }
        $packageText = if ($null -eq $variant.package_type -or [string]::IsNullOrWhiteSpace([string]$variant.package_type)) { '<blank>' } else { [string]$variant.package_type }
        $variantId = if ($null -eq $variant.id) { '<blank>' } else { [string]$variant.id }
        $variantSource = if ($null -eq $variant.source_reference) { '' } else { [string]$variant.source_reference }
        Write-Host "  variant=$variantId | source=$variantSource | product_id=$(if ([string]::IsNullOrWhiteSpace($productId)) {'<blank>'} else {$productId}) | product=$productName | product_source=$sourceRef | package_type=$packageText | broad_format=$($variant.broad_format) | allow_sale=$($variant.allow_sale)"
    }
    throw "Package sync incomplete: $($missing.Count) live Product Variant(s) have no Package. Inspect the direct product_variants details above; blank package/product links are not guessed."
}

Write-Host "Canonical package sync complete."
