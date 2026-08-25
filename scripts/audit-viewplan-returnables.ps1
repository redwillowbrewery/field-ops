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

$exactTargets = @(
    "Item No","On Site","Off Site Date","Off Site Days","Customer","Type","Order No","Lost",
    "Serial No","Contents","Gyle","Stock Location","Dispatched","Delivered","Usage Count","Leased","Lease Expiry",
    "Pkg Date","Best Before","Delivery Post Code","Post Code","Customer Class","Loc Zone Desc"
)
$tokens = @(
    "packaging","package","inventory","container","return","returned","off site","off_site","offsite",
    "item no","item_no","stock location","serial no","serial_no","lease","leased","lost","usage count",
    "cask","keg","firkin","pin","vessel"
)

function Get-FieldNames($fields) {
    $names = New-Object System.Collections.Generic.List[string]
    foreach ($field in $fields) { $names.Add([string]$field.Name) }
    return $names.ToArray()
}

function Get-ExactMatches([string[]]$fieldNames) {
    $matched = New-Object System.Collections.Generic.List[string]
    foreach ($target in $exactTargets) {
        if ($fieldNames -contains $target) { $matched.Add($target) }
    }
    return $matched.ToArray()
}

function Get-TokenMatches([string]$text) {
    $matched = New-Object System.Collections.Generic.List[string]
    foreach ($token in $tokens) {
        if ($text -match [regex]::Escape($token)) { $matched.Add($token) }
    }
    return $matched.ToArray()
}

$candidates = New-Object System.Collections.Generic.List[object]

Write-Host "Scanning saved queries (name, fields and SQL)..."
foreach ($qd in $db.QueryDefs) {
    $name = [string]$qd.Name
    if ($name -like "~*") { continue }
    try {
        $fieldNames = Get-FieldNames $qd.Fields
        $exact = Get-ExactMatches $fieldNames
        $sql = [string]$qd.SQL
        $haystack = ($name + " " + ($fieldNames -join " ") + " " + $sql).ToLowerInvariant()
        $tokenMatches = Get-TokenMatches $haystack
        $score = ($exact.Count * 5) + ($tokenMatches.Count * 2)
        if ($score -ge 4) {
            $candidates.Add([PSCustomObject]@{
                Kind = "Query"
                Name = $name
                Score = $score
                ExactMatches = ($exact -join ", ")
                TokenMatches = ($tokenMatches -join ", ")
                Fields = ($fieldNames -join ", ")
                SQL = $sql
            })
        }
    } catch {}
}

Write-Host "Scanning tables / linked tables (name and fields)..."
foreach ($td in $db.TableDefs) {
    $name = [string]$td.Name
    if ($name -like "MSys*" -or $name -like "~*") { continue }
    try {
        $fieldNames = Get-FieldNames $td.Fields
        $exact = Get-ExactMatches $fieldNames
        $haystack = ($name + " " + ($fieldNames -join " ")).ToLowerInvariant()
        $tokenMatches = Get-TokenMatches $haystack
        $score = ($exact.Count * 5) + ($tokenMatches.Count * 2)
        if ($score -ge 4) {
            $candidates.Add([PSCustomObject]@{
                Kind = "Table"
                Name = $name
                Score = $score
                ExactMatches = ($exact -join ", ")
                TokenMatches = ($tokenMatches -join ", ")
                Fields = ($fieldNames -join ", ")
                SQL = ""
            })
        }
    } catch {}
}

$ordered = @($candidates | Sort-Object @{Expression="Score";Descending=$true}, Kind, Name)
Write-Host ""
Write-Host "Candidate sources: $($ordered.Count)"
Write-Host ""

$shown = 0
foreach ($candidate in $ordered) {
    if ($shown -ge 25) { break }
    $shown++
    Write-Host "[$($candidate.Kind)] $($candidate.Name)  score=$($candidate.Score)"
    if ($candidate.ExactMatches) { Write-Host "  exact fields: $($candidate.ExactMatches)" }
    if ($candidate.TokenMatches) { Write-Host "  keyword hits: $($candidate.TokenMatches)" }
    Write-Host "  fields: $($candidate.Fields)"
    if ($candidate.Kind -eq "Query" -and $candidate.SQL) {
        $compactSql = (($candidate.SQL -replace "[\r\n\t]+", " ") -replace "\s+", " ").Trim()
        if ($compactSql.Length -gt 700) { $compactSql = $compactSql.Substring(0,700) + "..." }
        Write-Host "  SQL: $compactSql"
    }
    Write-Host ""
}

Write-Host "Top candidate sample rows"
Write-Host "-------------------------"
$sampled = 0
foreach ($candidate in $ordered) {
    if ($sampled -ge 8) { break }
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
                $fieldText = $fieldName.ToLowerInvariant()
                $interesting = ($exactTargets -contains $fieldName)
                if (-not $interesting) {
                    foreach ($token in $tokens) {
                        if ($fieldText -match [regex]::Escape($token)) { $interesting = $true; break }
                    }
                }
                if ($interesting) {
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
Write-Host "Objects whose NAME strongly suggests returnables"
Write-Host "------------------------------------------------"
foreach ($candidate in $ordered | Where-Object { $_.Name -match "(?i)pack|container|return|cask|keg|stock|inventory|vessel" } | Select-Object -First 30) {
    Write-Host "  [$($candidate.Kind)] $($candidate.Name)"
}

Write-Host ""
Write-Host "Audit complete. Paste the candidate list, SQL snippets and sample rows back into ChatGPT."
