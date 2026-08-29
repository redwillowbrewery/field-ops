$ErrorActionPreference = "Stop"

Write-Host "Brewery Ops - ViewPlan package semantics audit"
Write-Host "----------------------------------------------"
Write-Host "ViewPlan: READ ONLY"
Write-Host "Sprint 0 goal: identify authoritative package/container semantics"
Write-Host ""

try {
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application")
}
catch {
    throw "Could not attach to a running Access.Application instance. Open and log into ViewPlan first, then run this script from 32-bit PowerShell."
}

$db = $access.CurrentDb()

function Format-Value($value) {
    if ($null -eq $value -or $value -is [DBNull]) { return "" }
    if ($value -is [bool]) { return $(if ($value) { "True" } else { "False" }) }
    return [string]$value
}

function Get-TableDef([string]$name) {
    foreach ($td in $db.TableDefs) {
        if ([string]$td.Name -eq $name) { return $td }
    }
    return $null
}

function Print-Fields([string]$name) {
    $td = Get-TableDef $name
    if ($null -eq $td) {
        Write-Host "Table not found: $name"
        return
    }
    Write-Host "$name fields:"
    foreach ($field in $td.Fields) {
        Write-Host "  $($field.Name) | type=$($field.Type) | size=$($field.Size)"
    }
}

function Print-RecordsetRows($rs, [int]$maxRows = 200) {
    $row = 0
    while (-not $rs.EOF -and $row -lt $maxRows) {
        $row++
        $parts = New-Object System.Collections.Generic.List[string]
        foreach ($field in $rs.Fields) {
            $parts.Add("$($field.Name)=$(Format-Value $field.Value)")
        }
        Write-Host "  row $row | $(($parts.ToArray()) -join ' | ')"
        $rs.MoveNext()
    }
}

$focusPatterns = @(
    "Firkin", "Pin", "E-Cask", "E-Keg", "Key Keg", "KeyKeg", "E-Key",
    "30 Litre Steel", "50 Litre Keg", "50L", "Cans", "Case", "Mini Keg", "Poly", "Kegstar"
)

Write-Host "1. Packaging master schema"
Write-Host "--------------------------"
Print-Fields "tblPackaging_Type_List"
Write-Host ""

Write-Host "2. All packaging master rows"
Write-Host "----------------------------"
try {
    $rs = $db.OpenRecordset("SELECT * FROM tblPackaging_Type_List ORDER BY packaging_type")
    Print-RecordsetRows $rs 500
    $rs.Close()
}
catch {
    Write-Host "Could not read tblPackaging_Type_List: $($_.Exception.Message)"
}
Write-Host ""

Write-Host "3. Focus package rows"
Write-Host "---------------------"
try {
    $rs = $db.OpenRecordset("SELECT * FROM tblPackaging_Type_List ORDER BY packaging_type")
    while (-not $rs.EOF) {
        $packageName = ""
        try { $packageName = [string]$rs.Fields("packaging_type").Value } catch {}
        $matches = $false
        foreach ($pattern in $focusPatterns) {
            if ($packageName -like "*$pattern*") { $matches = $true; break }
        }
        if ($matches) {
            $parts = New-Object System.Collections.Generic.List[string]
            foreach ($field in $rs.Fields) {
                $parts.Add("$($field.Name)=$(Format-Value $field.Value)")
            }
            Write-Host "  $packageName | $(($parts.ToArray()) -join ' | ')"
        }
        $rs.MoveNext()
    }
    $rs.Close()
}
catch {
    Write-Host "Could not inspect focus packages: $($_.Exception.Message)"
}
Write-Host ""

Write-Host "4. Physical inventory tracking evidence"
Write-Host "--------------------------------------"
$inventoryTable = Get-TableDef "tblPackaging_Inventory"
if ($null -ne $inventoryTable) {
    try {
        $rs = $db.OpenRecordset("SELECT packaging_type, Count(*) AS inventory_rows, Sum(IIf(Nz(is_deleted,False)=False,1,0)) AS non_deleted_rows FROM tblPackaging_Inventory GROUP BY packaging_type ORDER BY packaging_type")
        Print-RecordsetRows $rs 500
        $rs.Close()
    }
    catch {
        Write-Host "Could not count tblPackaging_Inventory by package: $($_.Exception.Message)"
    }
} else {
    Write-Host "tblPackaging_Inventory not found."
}
Write-Host ""

Write-Host "5. Product/package usage evidence"
Write-Host "--------------------------------"
$brewProductsTable = Get-TableDef "tblBrew_Products"
if ($null -ne $brewProductsTable) {
    try {
        $rs = $db.OpenRecordset("SELECT packaging_type, Count(*) AS packaged_product_rows FROM tblBrew_Products GROUP BY packaging_type ORDER BY packaging_type")
        Print-RecordsetRows $rs 500
        $rs.Close()
    }
    catch {
        Write-Host "Could not count tblBrew_Products by package: $($_.Exception.Message)"
    }
} else {
    Write-Host "tblBrew_Products not found."
}
Write-Host ""

Write-Host "6. Saved-query evidence involving package master flags"
Write-Host "----------------------------------------------------"
$flagTokens = @("maintain_inventory_history", "packaging_type_list", "litre_capacity", "inventory", "return", "deposit")
$matches = New-Object System.Collections.Generic.List[object]
foreach ($qd in $db.QueryDefs) {
    $name = [string]$qd.Name
    if ($name -like "~*") { continue }
    try {
        $sql = [string]$qd.SQL
        $haystack = ($name + " " + $sql).ToLowerInvariant()
        $score = 0
        $hitList = New-Object System.Collections.Generic.List[string]
        foreach ($token in $flagTokens) {
            if ($haystack -match [regex]::Escape($token)) {
                $score++
                $hitList.Add($token)
            }
        }
        if ($score -gt 0) {
            $matches.Add([PSCustomObject]@{ Name=$name; Score=$score; Hits=($hitList.ToArray() -join ", "); SQL=$sql })
        }
    } catch {}
}
foreach ($match in $matches | Sort-Object @{Expression="Score";Descending=$true}, Name | Select-Object -First 30) {
    $compactSql = (($match.SQL -replace "[\r\n\t]+", " ") -replace "\s+", " ").Trim()
    if ($compactSql.Length -gt 900) { $compactSql = $compactSql.Substring(0,900) + "..." }
    Write-Host "[$($match.Name)] hits=$($match.Hits)"
    Write-Host "  SQL: $compactSql"
}
Write-Host ""

Write-Host "7. Interpretation prompts"
Write-Host "-------------------------"
Write-Host "Compare known business behaviour against the master rows:"
Write-Host "  RETURNABLE: Firkin, Pin, branded cask, 30L/50L steel keg"
Write-Host "  ONE-WAY:    E-Cask, E-Keg (and any confirmed disposable bag/keg formats)"
Write-Host "  NONE:       cans/cases and other non-returnable packaged goods"
Write-Host ""
Write-Host "Do NOT infer the canonical rule from these labels alone. The purpose of this audit is to identify which ViewPlan field(s) consistently explain those known examples."
Write-Host ""
Write-Host "Audit complete. Paste the full output back into ChatGPT for Sprint 0 package-model analysis."
