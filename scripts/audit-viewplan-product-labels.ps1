param(
    [string]$OutputPath = (Join-Path $PSScriptRoot 'product-label-audit.json'),
    [ValidateRange(1,100)][int]$SampleRows = 20
)
# Read-only metadata and bounded SELECT snapshots. No saved queries or source writes.
$ErrorActionPreference = 'Stop'
if ([Environment]::Is64BitProcess) { throw 'Run this with 32-bit Windows PowerShell in the logged-in ViewPlan session.' }
try {
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application')
    $db = $access.CurrentDb()
} catch { throw 'Open and log into ViewPlan, then run this in the same Windows session.' }
function Ident([string]$name) { return '[' + $name.Replace(']',']]') + ']' }
$tables = New-Object System.Collections.Generic.List[object]
foreach ($table in $db.TableDefs) {
    $name = [string]$table.Name
    if ($name -match '^(MSys|~)' -or $name -notmatch '(?i)product|brew.type|label') { continue }
    $fields = @($table.Fields | ForEach-Object { [pscustomobject]@{name=[string]$_.Name;dao_type=[int]$_.Type} })
    $labels = @($fields | Where-Object { $_.name -match '(?i)label|allerg|gluten|vegan|fining|unfined' -and $_.name -notmatch '(?i)password|secret|token|credential' -and $_.dao_type -in @(1,2,3,4,5,6,7,8,10,12) })
    if (-not $labels.Count -and $name -ne 'tblBrew_Type') { continue }
    $identity = @($fields | Where-Object { $_.name -match '(?i)(^id$|_id$|product_name$|brew_name$|^name$|^lud$)' -and $_.dao_type -in @(2,3,4,8,10) })
    $columns = @(@($identity.name) + @($labels.name) | Select-Object -Unique)
    $samples = New-Object System.Collections.Generic.List[object]
    $issues = New-Object System.Collections.Generic.List[string]
    foreach ($label in $labels) {
        $rs = $null
        try {
            $sql = 'SELECT TOP ' + $SampleRows + ' ' + (($columns | ForEach-Object { Ident $_ }) -join ',') + ' FROM ' + (Ident $name) + ' WHERE ' + (Ident $label.name) + ' IS NOT NULL'
            $rs = $db.OpenRecordset($sql,4)
            while (-not $rs.EOF -and $samples.Count -lt ($SampleRows * $labels.Count)) {
                $row = [ordered]@{}
                foreach ($field in $rs.Fields) {
                    $value = $field.Value
                    if ($null -eq $value -or $value -is [DBNull]) { $value = $null }
                    elseif ($value -is [DateTime]) { $value = $value.ToString('o') }
                    $row[[string]$field.Name] = $value
                }
                $samples.Add([pscustomobject]@{sampled_field=$label.name;values=$row})
                $rs.MoveNext()
            }
        } catch { $issues.Add('Could not sample field ' + $label.name + '; inspect this field in ViewPlan.') }
        finally { if ($null -ne $rs) { $rs.Close() } }
    }
    $tables.Add([pscustomobject]@{table=$name;fields=$fields;candidate_fields=@($labels.name);samples=@($samples.ToArray());issues=@($issues.ToArray())})
}
$report = [ordered]@{
    audit='ViewPlan product label discovery - read only'
    observed_at=[DateTime]::UtcNow.ToString('o')
    selection='Up to SampleRows non-null rows per candidate field; unordered, may overlap, not a complete catalogue. Memo text is preserved without truncation.'
    tables=@($tables.ToArray())
    questions=@(
        'Which candidate field backs Label Text on the product profile? Confirm against the screen.',
        'Compare a typical fined cask, an unfined/vegan-friendly cask, a gluten-free beer and blank or ambiguous labels.',
        'Is text a full label, rich text or a standalone allergen statement?',
        'Does label editing update the product change timestamp? Do not assume incremental detection.',
        'Identify any recipe allergens versus cask-process wording; no claims are automatically approved by this audit.'
    )
}
$destination=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
[IO.File]::WriteAllText($destination,(ConvertTo-Json -InputObject $report -Depth 14),[Text.UTF8Encoding]::new($false))
Write-Host "Read-only audit written to $destination"
Write-Host 'Share the JSON for field mapping review. No ViewPlan or Brewery Ops data was changed.'
