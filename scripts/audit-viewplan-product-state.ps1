param(
    [string[]]$ProductName = @()
)

$ErrorActionPreference = "Stop"

Write-Host "ViewPlan Product state schema audit"
Write-Host "-----------------------------------"
Write-Host "READ ONLY: no ViewPlan or Brewery Ops data will be changed."

try {
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application")
}
catch {
    throw "Could not attach to a running Access.Application instance. Open and log into ViewPlan first, then run this script from 32-bit PowerShell."
}

$db = $access.CurrentDb()
$fieldMatches = New-Object System.Collections.Generic.List[object]

foreach ($table in $db.TableDefs) {
    if ($table.Name.StartsWith("MSys")) { continue }
    foreach ($field in $table.Fields) {
        if ($field.Name -match "(?i)available|sale|bex|business|exchange") {
            $fieldMatches.Add(([PSCustomObject]@{
                table = $table.Name
                field = $field.Name
                type = $field.Type
            })) | Out-Null
        }
    }
}

if (-not $fieldMatches.Count) {
    Write-Host "No state-like fields found."
    exit 1
}

$fieldMatches | Sort-Object table, field | Format-Table -AutoSize

Write-Host ""
Write-Host "tblBrew_Type fields:"
$brewType = $db.TableDefs.Item("tblBrew_Type")
$brewType.Fields | ForEach-Object { $_.Name } | Sort-Object | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "tblBrew_Product_Names_List fields:"
$productNames = $db.TableDefs.Item("tblBrew_Product_Names_List")
$productNames.Fields | ForEach-Object { $_.Name } | Sort-Object | ForEach-Object { Write-Host "  $_" }

if ($ProductName.Count) {
    Write-Host ""
    Write-Host "Requested Product state:"
    $stateRows = New-Object System.Collections.Generic.List[object]
    foreach ($name in $ProductName) {
        $escapedName = $name.Replace("'", "''")
        $recordset = $db.OpenRecordset(@"
SELECT brew_type_id, brew_product_name, is_available, allow_sale, is_bex, lud
FROM tblBrew_Type
WHERE brew_product_name = '$escapedName'
ORDER BY brew_type_id
"@)
        while (-not $recordset.EOF) {
            $stateRows.Add(([PSCustomObject]@{
                brew_type_id = $recordset.Fields.Item("brew_type_id").Value
                product = $recordset.Fields.Item("brew_product_name").Value
                is_available = $recordset.Fields.Item("is_available").Value
                allow_sale = $recordset.Fields.Item("allow_sale").Value
                is_bex = $recordset.Fields.Item("is_bex").Value
                lud = $recordset.Fields.Item("lud").Value
            })) | Out-Null
            $recordset.MoveNext()
        }
        $recordset.Close()
    }
    if ($stateRows.Count) {
        $stateRows | Format-Table -AutoSize
    } else {
        Write-Host "No exact Product-name matches found."
    }

    Write-Host ""
    Write-Host "Matching Product Names administration rows:"
    $requestedNames = @{}
    foreach ($name in $ProductName) { $requestedNames[$name.Trim().ToLowerInvariant()] = $true }
    $nameRows = New-Object System.Collections.Generic.List[object]
    $nameRecordset = $db.OpenRecordset("SELECT * FROM tblBrew_Product_Names_List")
    while (-not $nameRecordset.EOF) {
        $matched = $false
        foreach ($field in $nameRecordset.Fields) {
            $value = $field.Value
            if ($null -ne $value -and $requestedNames.ContainsKey(([string]$value).Trim().ToLowerInvariant())) {
                $matched = $true
                break
            }
        }
        if ($matched) {
            $values = [ordered]@{}
            foreach ($field in $nameRecordset.Fields) { $values[$field.Name] = $field.Value }
            $nameRows.Add(([PSCustomObject]$values)) | Out-Null
        }
        $nameRecordset.MoveNext()
    }
    $nameRecordset.Close()
    if ($nameRows.Count) {
        $nameRows | Format-List
    } else {
        Write-Host "No exact Product-name matches found in tblBrew_Product_Names_List."
    }
}
