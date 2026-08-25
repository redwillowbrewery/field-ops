param(
    [string[]]$Targets = @("Amarillo Porter","Columbus the Dank","Dreaming of El Dorado")
)

$ErrorActionPreference = "Stop"

function DbValue($recordset, [string]$name) {
    $value = $recordset.Fields.Item($name).Value
    if ($null -eq $value -or $value -is [DBNull]) { return $null }
    return $value
}
function SqlText([string]$value) { return $value.Replace("'", "''") }

Write-Host "Brewery Ops - ViewPlan Sellar source mapping audit"
Write-Host "-------------------------------------------------"
Write-Host "ViewPlan: READ ONLY"
Write-Host "Targets: $($Targets -join ', ')"

try {
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application")
}
catch {
    throw "Could not attach to a running Access.Application instance. Open and log into ViewPlan first, then run this script from 32-bit PowerShell."
}
$db = $access.CurrentDb()

foreach ($target in $Targets) {
    Write-Host ""
    Write-Host "=== $target ==="
    $targetSql = SqlText $target

    $rsProducts = $db.OpenRecordset(@"
SELECT brew_type_id, brew_product_name, allow_sale
FROM tblBrew_Type
WHERE brew_product_name Like '*$targetSql*'
ORDER BY brew_type_id DESC
"@)

    $brewIds = New-Object System.Collections.Generic.List[int]
    if ($rsProducts.EOF) {
        Write-Host "No tblBrew_Type name containing '$target'."
    }
    else {
        Write-Host "tblBrew_Type:"
        while (-not $rsProducts.EOF) {
            $brewId = [int](DbValue $rsProducts "brew_type_id")
            $brewIds.Add($brewId)
            Write-Host ("  brew_type_id={0} | name={1} | allow_sale={2}" -f $brewId, [string](DbValue $rsProducts "brew_product_name"), [string](DbValue $rsProducts "allow_sale"))
            $rsProducts.MoveNext()
        }
    }
    $rsProducts.Close()

    foreach ($brewId in $brewIds) {
        Write-Host ""
        Write-Host "  Packaging rows for brew_type_id=$brewId"
        $rsPkg = $db.OpenRecordset(@"
SELECT packaging_type, allow_sale
FROM tblBrew_Type_Packaging
WHERE brew_type_id=$brewId
ORDER BY packaging_type
"@)
        while (-not $rsPkg.EOF) {
            Write-Host ("    {0} | allow_sale={1}" -f [string](DbValue $rsPkg "packaging_type"), [string](DbValue $rsPkg "allow_sale"))
            $rsPkg.MoveNext()
        }
        $rsPkg.Close()

        Write-Host "  tblImport_Product_Map rows:"
        $rsMap = $db.OpenRecordset(@"
SELECT packaging_type, is_available, ecom_trade2_variant_id
FROM tblImport_Product_Map
WHERE brew_type_id=$brewId
ORDER BY packaging_type
"@)
        if ($rsMap.EOF) {
            Write-Host "    (none)"
        }
        else {
            while (-not $rsMap.EOF) {
                Write-Host ("    {0} | is_available={1} | ecom_trade2_variant_id={2}" -f [string](DbValue $rsMap "packaging_type"), [string](DbValue $rsMap "is_available"), [string](DbValue $rsMap "ecom_trade2_variant_id"))
                $rsMap.MoveNext()
            }
        }
        $rsMap.Close()
    }
}

Write-Host ""
Write-Host "Audit complete. Compare the ecom_trade2_variant_id values with the live Sellar IDs from audit-sellar-mappings.mjs."
