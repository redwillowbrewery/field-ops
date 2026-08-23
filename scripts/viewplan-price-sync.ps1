param(
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"

if (-not $SupabaseUrl) { throw "NEXT_PUBLIC_SUPABASE_URL is not set." }
if (-not $ServiceRoleKey) { throw "SUPABASE_SERVICE_ROLE_KEY is not set." }

Write-Host "Field Ops - ViewPlan current price sync"
Write-Host "-----------------------------------"
Write-Host "Mode: READ ONLY from ViewPlan; UPSERT to Supabase"

try {
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application")
}
catch {
    throw "Could not attach to a running Access.Application instance. Open and log into ViewPlan first, then run this script from 32-bit PowerShell."
}

$project = $access.CurrentProject.FullName
if ($project -notmatch "mbms\.accde$|ViewPlan BMS\.accde$") {
    Write-Warning "Attached Access project is '$project'. Confirm this is the ViewPlan instance before relying on the sync."
}

$db = $access.CurrentDb()

$sql = @"
SELECT
    bt.brew_type_id,
    bt.brew_product_name,
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
$now = [DateTime]::UtcNow.ToString("o")

function DbValue($recordset, [string]$name) {
    $value = $recordset.Fields.Item($name).Value
    if ($null -eq $value -or $value -is [DBNull]) { return $null }
    return $value
}

while (-not $rs.EOF) {
    $rows.Add([PSCustomObject]@{
        brew_type_id       = [int](DbValue $rs "brew_type_id")
        beer_name          = [string](DbValue $rs "brew_product_name")
        packaging_type     = [string](DbValue $rs "packaging_type")
        wholesale_price    = DbValue $rs "wholesale_price"
        wholesale_price2   = DbValue $rs "wholesale_price2"
        wholesale_price3   = DbValue $rs "wholesale_price3"
        wholesale_price4   = DbValue $rs "wholesale_price4"
        wholesale_price5   = DbValue $rs "wholesale_price5"
        wholesale_price6   = DbValue $rs "wholesale_price6"
        wholesale_price7   = DbValue $rs "wholesale_price7"
        wholesale_price8   = DbValue $rs "wholesale_price8"
        wholesale_price9   = DbValue $rs "wholesale_price9"
        wholesale_price10  = DbValue $rs "wholesale_price10"
        allow_sale         = [bool](DbValue $rs "allow_sale")
        synced_at          = $now
    })
    $rs.MoveNext()
}
$rs.Close()

Write-Host "Rows read from ViewPlan: $($rows.Count)"
if ($rows.Count -eq 0) { throw "No saleable ViewPlan product/package price rows were returned." }

$headers = @{
    apikey        = $ServiceRoleKey
    Authorization = "Bearer $ServiceRoleKey"
    Prefer        = "resolution=merge-duplicates,return=minimal"
    "Content-Type" = "application/json"
}

$endpoint = "$($SupabaseUrl.TrimEnd('/'))/rest/v1/viewplan_current_prices?on_conflict=brew_type_id,packaging_type"
$chunkSize = 200

for ($i = 0; $i -lt $rows.Count; $i += $chunkSize) {
    $end = [Math]::Min($i + $chunkSize - 1, $rows.Count - 1)
    $chunk = @($rows[$i..$end])
    $json = $chunk | ConvertTo-Json -Depth 4 -Compress
    Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -Body $json | Out-Null
    Write-Host "Synced $($end + 1)/$($rows.Count)"
}

Write-Host "ViewPlan current pricing sync complete."
