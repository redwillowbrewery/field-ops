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
$matches = New-Object System.Collections.Generic.List[object]

foreach ($table in $db.TableDefs) {
    if ($table.Name.StartsWith("MSys")) { continue }
    foreach ($field in $table.Fields) {
        if ($field.Name -match "(?i)available|sale|bex|business|exchange") {
            $matches.Add([PSCustomObject]@{
                table = $table.Name
                field = $field.Name
                type = $field.Type
            })
        }
    }
}

if (-not $matches.Count) {
    Write-Host "No state-like fields found."
    exit 1
}

$matches | Sort-Object table, field | Format-Table -AutoSize

Write-Host ""
Write-Host "tblBrew_Type fields:"
$brewType = $db.TableDefs.Item("tblBrew_Type")
$brewType.Fields | ForEach-Object { $_.Name } | Sort-Object | ForEach-Object { Write-Host "  $_" }

