param(
    [string]$OutputPath = (Join-Path $PSScriptRoot 'fulfilment-schema-audit.json'),
    [ValidateRange(1,2000)][int]$MaxObjects = 500
)
# Metadata only: no recordsets, saved-query execution, source writes or connection strings.
$ErrorActionPreference = 'Stop'
if ([Environment]::Is64BitProcess) { throw 'Use 32-bit Windows PowerShell in the logged-in ViewPlan session.' }
try {
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application')
    $db = $access.CurrentDb()
} catch { throw 'Open and log into ViewPlan in this Windows session first.' }

function Read-Fields($fields) {
    $result = New-Object System.Collections.Generic.List[object]
    foreach ($field in $fields) {
        $result.Add([pscustomobject]@{name=[string]$field.Name;dao_type=[int]$field.Type;size=[int]$field.Size})
    }
    return $result.ToArray()
}
$pattern = '(?i)order|dispatch|deliver|allocat|packaging.*inventory|container|vehicle|route|shipment|pallet'
$tables = New-Object System.Collections.Generic.List[object]
$queries = New-Object System.Collections.Generic.List[object]
$relations = New-Object System.Collections.Generic.List[object]
$issues = New-Object System.Collections.Generic.List[object]
$selected = @{}
foreach ($table in $db.TableDefs) {
    $name = [string]$table.Name
    if ($name -like 'MSys*' -or $name -like '~*') { continue }
    try { $fields = @(Read-Fields $table.Fields) }
    catch { $issues.Add([pscustomobject]@{kind='table';name=$name;error='field_metadata_unavailable'}); continue }
    if (($name + ' ' + (($fields | ForEach-Object {$_.name}) -join ' ')) -notmatch $pattern) { continue }
    if (($tables.Count + $queries.Count) -ge $MaxObjects) { throw 'Audit object limit exceeded; no truncated report written. Increase MaxObjects deliberately.' }
    $indexes = New-Object System.Collections.Generic.List[object]
    try {
        foreach ($index in $table.Indexes) {
            $indexes.Add([pscustomobject]@{name=[string]$index.Name;primary=[bool]$index.Primary;unique=[bool]$index.Unique;fields=@($index.Fields | ForEach-Object {[string]$_.Name})})
        }
    } catch { $issues.Add([pscustomobject]@{kind='table';name=$name;error='index_metadata_unavailable'}) }
    $tables.Add([pscustomobject]@{name=$name;fields=$fields;indexes=@($indexes.ToArray())})
    $selected[$name] = $true
}
# List candidate query names/types only. Do not evaluate query fields or export SQL,
# parameters, connection strings or literals. A later focused audit can inspect
# specific reviewed SELECT definitions once the source tables are understood.
foreach ($query in $db.QueryDefs) {
    $name = [string]$query.Name
    if ($name -like '~*' -or $name -notmatch $pattern) { continue }
    if (($tables.Count + $queries.Count) -ge $MaxObjects) { throw 'Audit object limit exceeded; no truncated report written. Increase MaxObjects deliberately.' }
    try { $queries.Add([pscustomobject]@{name=$name;dao_type=[int]$query.Type}) }
    catch { $issues.Add([pscustomobject]@{kind='query';name=$name;error='query_metadata_unavailable'}) }
}
foreach ($relation in $db.Relations) {
    if (-not $selected.ContainsKey([string]$relation.Table) -and -not $selected.ContainsKey([string]$relation.ForeignTable)) { continue }
    if ($relations.Count -ge $MaxObjects) { throw 'Audit relation limit exceeded; no truncated report written.' }
    try {
        $links = @($relation.Fields | ForEach-Object {[pscustomobject]@{field=[string]$_.Name;foreign_field=[string]$_.ForeignName}})
        $relations.Add([pscustomobject]@{name=[string]$relation.Name;table=[string]$relation.Table;foreign_table=[string]$relation.ForeignTable;fields=$links})
    } catch { $issues.Add([pscustomobject]@{kind='relation';name=[string]$relation.Name;error='relation_metadata_unavailable'}) }
}
if ($tables.Count -eq 0) { throw 'No candidate tables found; no report written.' }
$report = [ordered]@{
    audit='ViewPlan fulfilment schema discovery';version=1;observed_at=[DateTime]::UtcNow.ToString('o')
    read_only=$true;scope='Candidate table metadata and query names only; no operational rows or query SQL'
    complete=($issues.Count -eq 0);selection_pattern=$pattern
    tables=@($tables.ToArray());queries=@($queries.ToArray());relations=@($relations.ToArray());issues=@($issues.ToArray())
    note='Metadata does not prove field meaning, stable identity, change behavior or current-order coverage. Dispatched reportedly means fully allocated; verify against actual source records next.'
}
$destination = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$json = ConvertTo-Json -InputObject $report -Depth 10
[IO.File]::WriteAllText($destination, $json, [Text.UTF8Encoding]::new($false))
Write-Host "Read-only fulfilment schema audit written to $destination"
Write-Host "Tables: $($tables.Count); query names: $($queries.Count); metadata issues: $($issues.Count)"
if ($issues.Count) { Write-Warning 'Metadata discovery is incomplete; inspect issues before choosing mappings.' }
