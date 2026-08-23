param(
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"
if (-not $SupabaseUrl) { throw "NEXT_PUBLIC_SUPABASE_URL is not set." }
if (-not $ServiceRoleKey) { throw "SUPABASE_SERVICE_ROLE_KEY is not set." }

$baseUrl = $SupabaseUrl.TrimEnd('/')
$userAgent = "RedWillow-ViewPlan-Sellar-Map-Sync/1.2"
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
        $parts = @()
        if ($_.Exception.Message) { $parts += $_.Exception.Message }
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $parts += $_.ErrorDetails.Message }
        try {
            if ($_.Exception.Response) {
                $stream = $_.Exception.Response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $responseBody = $reader.ReadToEnd()
                    if ($responseBody) { $parts += $responseBody }
                }
            }
        } catch {}
        throw "Supabase $method $path failed:`n$(($parts | Select-Object -Unique) -join "`n")"
    }
}
function Invoke-SupaGet([string]$path) { return Invoke-SupaRequest "Get" $path }
function Invoke-SupaPost([string]$path, $body, [string]$prefer = "return=minimal") { return Invoke-SupaRequest "Post" $path $body $prefer }
function UrlEncode([string]$value) { return [uri]::EscapeDataString($value) }
function DbValue($recordset, [string]$name) {
    $value = $recordset.Fields.Item($name).Value
    if ($null -eq $value -or $value -is [DBNull]) { return $null }
    return $value
}
function Get-FirstField([string]$path, [string]$field) {
    $result = Invoke-SupaGet $path
    $first = $result | Select-Object -First 1
    if ($null -eq $first) { return $null }
    $prop = $first.PSObject.Properties[$field]
    if ($null -eq $prop -or $null -eq $prop.Value) { return $null }
    return [string]$prop.Value
}
function Is-ValidUuid([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return $false }
    $guid = [Guid]::Empty
    return [Guid]::TryParse($value, [ref]$guid)
}

Write-Host "Field Ops - ViewPlan Sellar mapping sync"
Write-Host "-----------------------------------------"
Write-Host "ViewPlan: READ ONLY"
Write-Host "Source mapping: tblImport_Product_Map.ecom_trade2_variant_id"
Write-Host "Authority: ViewPlan mapping replaces conflicting Sellar mappings"

try {
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application")
}
catch {
    throw "Could not attach to a running Access.Application instance. Open and log into ViewPlan first, then run this script from 32-bit PowerShell."
}
$db = $access.CurrentDb()

$rs = $db.OpenRecordset(@"
SELECT
    brew_type_id,
    packaging_type,
    ecom_trade2_variant_id
FROM tblImport_Product_Map
WHERE ecom_trade2_variant_id Is Not Null
  AND ecom_trade2_variant_id <> ''
  AND is_available = True
"@)

$rows = @()
while (-not $rs.EOF) {
    $rows += [PSCustomObject]@{
        brew_type_id = [string](DbValue $rs "brew_type_id")
        packaging_type = [string](DbValue $rs "packaging_type")
        sellar_variant_id = [string](DbValue $rs "ecom_trade2_variant_id")
    }
    $rs.MoveNext()
}
$rs.Close()

Write-Host "Mapped ViewPlan rows: $($rows.Count)"
$linked = 0
$relinked = 0
$missingCanonical = 0
$invalidCanonical = 0
$index = 0

foreach ($row in $rows) {
    $index++
    $viewplanExternalId = "$($row.brew_type_id)|$($row.packaging_type)"
    $vpEncoded = UrlEncode $viewplanExternalId
    $variantId = Get-FirstField "product_variant_external_ids?system=eq.viewplan&external_id=eq.$vpEncoded&select=product_variant_id&limit=1" "product_variant_id"

    if (-not $variantId) {
        Write-Warning "No canonical ViewPlan variant mapping for $viewplanExternalId"
        $missingCanonical++
        continue
    }
    if (-not (Is-ValidUuid $variantId)) {
        Write-Warning "Invalid canonical UUID '$variantId' for ViewPlan key $viewplanExternalId"
        $invalidCanonical++
        continue
    }

    $sellarId = [string]$row.sellar_variant_id
    $sellarEncoded = UrlEncode $sellarId
    $existingVariantId = Get-FirstField "product_variant_external_ids?system=eq.sellar&external_id=eq.$sellarEncoded&select=product_variant_id&limit=1" "product_variant_id"
    $wasDifferent = $existingVariantId -and $existingVariantId -ne $variantId

    Invoke-SupaPost "product_variant_external_ids?on_conflict=system%2Cexternal_id" @{
        product_variant_id = $variantId
        system = "sellar"
        external_id = $sellarId
    } "resolution=merge-duplicates,return=minimal" | Out-Null

    if ($wasDifferent) { $relinked++ } else { $linked++ }

    if (($index % 100) -eq 0) { Write-Host "Processed: $index/$($rows.Count)" }
}

Write-Host ""
Write-Host "ViewPlan Sellar mapping sync complete."
Write-Host "Already correct/new:   $linked"
Write-Host "Corrected mappings:    $relinked"
Write-Host "Missing canonical:     $missingCanonical"
Write-Host "Invalid canonical IDs: $invalidCanonical"
