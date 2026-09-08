param(
    [string]$OutputPath = (Join-Path $PWD 'take-off-audit.json'),
    [ValidateRange(1,20)][int]$SampleRows = 5,
    [string[]]$SampleTable = @(),
    [switch]$PlanningSamples
)
# Run with 32-bit Windows PowerShell in the logged-in ViewPlan session.
# Metadata only by default. Optional samples read named base tables as snapshots.
# Never execute saved queries, forms, macros, pass-through SQL or source writes.
$ErrorActionPreference = 'Stop'
try {
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application')
    $db = $access.CurrentDb()
} catch { throw 'Open ViewPlan and run this in 32-bit Windows PowerShell in the same Windows session.' }
function PropertyText($obj,[string]$name) {
    try { return [string]$obj.Properties.Item($name).Value } catch { return $null }
}
function Ident([string]$name) { return '[' + $name.Replace(']',']]') + ']' }
if($PlanningSamples) {
    $SampleTable=@('tblTasks','tblTask_Type_List','tblTank_List','tblBrew_Register','tblTake_Off_Plan','tblPackaging_Type_List')
}
$pattern = '(?i)brew|gyle|batch|vessel|tank|ferment|take.?off|packag|schedule|plan'
$tables = New-Object System.Collections.Generic.List[object]
$selected = @{}
foreach($table in $db.TableDefs) {
    $name = [string]$table.Name
    if($name -match '^(MSys|~)'){continue}
    if($name -notmatch $pattern -and $name -notin $SampleTable -and $name -notin @('tblTasks','tblTask_Type_List')){continue}
    $fields = @($table.Fields | ForEach-Object {
        [pscustomobject]@{name=$_.Name;daoType=[int]$_.Type;size=$_.Size;description=(PropertyText $_ 'Description')}
    })
    $indexes = @($table.Indexes | ForEach-Object {
        [pscustomobject]@{name=$_.Name;primary=[bool]$_.Primary;unique=[bool]$_.Unique;fields=@($_.Fields | ForEach-Object {$_.Name})}
    })
    $tables.Add([pscustomobject]@{name=$name;fields=$fields;indexes=$indexes})
    $selected[$name]=$true
}
$relations = @($db.Relations | Where-Object {$selected.ContainsKey([string]$_.Table) -or $selected.ContainsKey([string]$_.ForeignTable)} | ForEach-Object {
    [pscustomobject]@{name=$_.Name;table=$_.Table;foreignTable=$_.ForeignTable;fields=@($_.Fields | ForEach-Object {[pscustomobject]@{name=$_.Name;foreignName=$_.ForeignName}})}
})
$queries = New-Object System.Collections.Generic.List[object]
foreach($q in $db.QueryDefs) {
    if($q.Name -like '~*' -or [int]$q.Type -eq 112){continue}
    if($q.Name -match $pattern -or [string]$q.SQL -match $pattern){
        $sql=[string]$q.SQL
        # Do not disclose external connection strings or credential-bearing SQL.
        if($sql -match '(?i)password|pwd\s*=|ODBC;|DATABASE\s*='){$sql='[External connection definition omitted]'}
        $queries.Add([pscustomobject]@{name=$q.Name;daoType=[int]$q.Type;sql=$sql})
    }
}
$samples = New-Object System.Collections.Generic.List[object]
foreach($name in $SampleTable) {
    if(-not $selected.ContainsKey($name)){throw "Unknown or excluded table: $name"}
    $table=$db.TableDefs.Item($name)
    # Exclude memo, binary, attachment and complex fields; samples are optional.
    $columns=@($table.Fields | Where-Object {([int]$_.Type -in @(1,2,3,4,5,6,7,8,10,15,16,19,20,21) -or $_.Name -eq 'task_object_list') -and $_.Name -notmatch '(?i)password|secret|token|credential'} | ForEach-Object {$_.Name})
    if(-not $columns.Count){continue}
    $rs=$null
    try {
        $sql='SELECT TOP '+$SampleRows+' '+(($columns | ForEach-Object {Ident $_}) -join ',')+' FROM '+(Ident $name)
                # Deterministic recent samples for planning/register; tanks are small inventory metadata.
        if($name -eq 'tblTasks') {
            $sql += ' WHERE [task_type_id] IN (SELECT [task_type_id] FROM [tblTask_Type_List] WHERE [internal_id]=2) ORDER BY [task_due_date] DESC, [task_id] DESC'
        } elseif($name -eq 'tblBrew_Register') {$sql += ' ORDER BY [brew_register_id] DESC'}
        elseif($name -eq 'tblTake_Off_Plan') {$sql += ' ORDER BY [take_off_plan_id] DESC'}
        $rs=$db.OpenRecordset($sql,4)
        $rows=New-Object System.Collections.Generic.List[object]
        while(-not $rs.EOF -and $rows.Count -lt $SampleRows){
            $row=[ordered]@{}
            foreach($f in $rs.Fields){
                $v=$f.Value
                if($null -eq $v -or $v -is [DBNull]){$v=$null}
                elseif($v -is [DateTime]){$v=$v.ToString('o')}
                elseif($v -is [string] -and $v.Length -gt 200){$v=$v.Substring(0,200)}
                $row[$f.Name]=$v
            }
            $rows.Add([pscustomobject]$row); $rs.MoveNext()
        }
        $samples.Add([pscustomobject]@{table=$name;selection='Bounded sample; tasks by latest due date, register/take-off by highest ID; other tables unordered. Not a complete current snapshot.';rows=@($rows.ToArray())})
    } catch {$samples.Add([pscustomobject]@{table=$name;error='Snapshot unavailable; inspect source manually.'})}
    finally {if($null -ne $rs){$rs.Close()}}
}
$report=[ordered]@{
    audit='ViewPlan Take Off Planning — read only'
    observedAt=[DateTime]::UtcNow.ToString('o')
    tables=@($tables.ToArray());relations=$relations;queryDefinitions=@($queries.ToArray());samples=@($samples.ToArray())
    verificationNeeded=@(
        'Which screen/query shows current tank contents and which shows future brew planning?',
        'What stable identity links a future brew to its actual batch before/after gyle assignment?',
        'Are volumes original brew length, current tank contents or estimates, and in which units?',
        'How are cancellations, transfers, combined/split brews and completed packaging represented?',
        'Which dates/statuses/change markers are authoritative?'
    )
}
$destination=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
[IO.File]::WriteAllText($destination,(ConvertTo-Json -InputObject $report -Depth 14),[Text.UTF8Encoding]::new($false))
Write-Host "Read-only audit written to $destination"
Write-Host "Tables: $($tables.Count); query definitions: $($queries.Count); sampled tables: $($samples.Count)"
