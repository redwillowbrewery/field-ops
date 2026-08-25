$ErrorActionPreference = "Stop"

Write-Host "Brewery Ops - ViewPlan returnables audit"
Write-Host "---------------------------------------"
Write-Host "ViewPlan: READ ONLY"
Write-Host "Goal: locate the source behind Packaging Inventory / off-site containers"
Write-Host ""

try {
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application")
}
catch {
    throw "Could not attach to a running Access.Application instance. Open and log into ViewPlan first, then run this script from 32-bit PowerShell."
}

$db = $access.CurrentDb()
$targets = @(
    "Item No","On Site","Off Site Date","Off Site Days","Customer","Type","Order No","Lost",
    "Serial No","Contents","Gyle","Stock Location","Dispatched","Delivered","Usage Count","Leased","Lease Expiry"
)

function Get-FieldNames($fields) {
    $names = New-Object System.Collections.Generic.List[string]
    foreach ($field in $fields) { $names.Add([string]$field.Name) }
    return $names.ToArray()
}

function Match-Targets([string[]]$fieldNames) {
    $matched = New-Object System.Collections.Generic.List[string]
    foreach ($target in $targets) {
        if ($fieldNames -contains $target) { $matched.Add($target) }
    }
    return $matched.ToArray()
}

$candidates = New-Object System.Collections.Generic.List[object]

Write-Host "Scanning saved queries..."
foreach ($qd in $db.QueryDefs) {
    if ([string]$qd.Name -like "~*") { continue }
    try {
        $fieldNames = Get-FieldNames $qd.Fields
        $matched = Match-Targets $fieldNames
        if ($matched.Count -ge 3) {
            $candidates.Add([PSCustomObject]@{
                Kind = "Query"
                Name = [string]$qd.Name
                MatchCount = $matched.Count
                Matches = ($matched -join ", ")
                Fields = ($fieldNames -join ", ")
            })
        }
    } catch {}
}

Write-Host "Scanning tables / linked tables..."
foreach ($td in $db.TableDefs) {
    $name = [string]$td.Name
    if ($name -like "MSys*" -or $name -like "~*") { continue }
    try {
        $fieldNames = Get-FieldNames $td.Fields
        $matched = Match-Targets $fieldNames
        $nameLooksRelevant = $name -match "(?i)cask|keg|container|package|packaging|return|stock|inventory|vessel"
        if ($matched.Count -ge 2 -or ($matched.Count -ge 1 -and $nameLooksRelevant)) {
            $candidates.Add([PSCustomObject]@{
                Kind = "Table"
                Name = $name
                MatchCount = $matched.Count
                Matches = ($matched -join ", ")
                Fields = ($fieldNames -join ", ")
            })
        }
    } catch {}
}

$ordered = @($candidates | Sort-Object @{Expression="MatchCount";Descending=$true}, Kind, Name)
if (-not $ordered.Count) {
    Write-Warning "No obvious source found from field names. We may need to trace the saved export/report object instead."
    exit 0
}

Write-Host ""
Write-Host "Candidate sources: $($ordered.Count)"
Write-Host ""
foreach ($candidate in $ordered) {
    Write-Host "[$($candidate.Kind)] $($candidate.Name)"
    Write-Host "  matched $($candidate.MatchCount): $($candidate.Matches)"
    Write-Host "  fields: $($candidate.Fields)"
    Write-Host ""
}

Write-Host "Top candidate sample rows"
Write-Host "-------------------------"
$sampled = 0
foreach ($candidate in $ordered) {
    if ($sampled -ge 5) { break }
    try {
        $safeName = ([string]$candidate.Name).Replace("]","]]" )
        $rs = $db.OpenRecordset("SELECT TOP 3 * FROM [$safeName]")
        if ($rs.EOF) { $rs.Close(); continue }
        Write-Host ""
        Write-Host "SOURCE: $($candidate.Kind) $($candidate.Name)"
        $rowNo = 0
        while (-not $rs.EOF -and $rowNo -lt 3) {
            $rowNo++
            $parts = New-Object System.Collections.Generic.List[string]
            foreach ($field in $rs.Fields) {
                $fieldName = [string]$field.Name
                if ($targets -contains $fieldName) {
                    $value = $field.Value
                    if ($null -eq $value -or $value -is [DBNull]) { $value = "" }
                    $parts.Add("$fieldName=$value")
                }
            }
            Write-Host "  row $rowNo | $(($parts.ToArray()) -join ' | ')"
            $rs.MoveNext()
        }
        $rs.Close()
        $sampled++
    } catch {
        Write-Host "  Could not sample $($candidate.Name): $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "Audit complete. Paste the candidate list and sample rows back into ChatGPT."
