param(
    [string]$OutputPath
)

# Run in 32-bit Windows PowerShell in the same interactive session as ViewPlan.
# Reads DAO snapshots and schema only. Never executes a saved/action query.
$ErrorActionPreference = 'Stop'
$financial = '(?i)credit|balance|on_?hold|stop|currency|outstanding|debt|arrears'
$account = '(?i)customer|account|debtor'
try {
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application')
    $db = $access.CurrentDb()
} catch {
    throw 'Open and log into ViewPlan, then run this script with 32-bit Windows PowerShell in the same Windows session.'
}

function Property-Text($object, [string]$name) {
    try { return [string]$object.Properties.Item($name).Value } catch { return $null }
}
function Identifier([string]$name) { return '[' + $name.Replace(']', ']]') + ']' }
function Read-Aggregate([string]$sql) {
    $rs = $null
    try {
        $rs = $db.OpenRecordset($sql, 4) # dbOpenSnapshot: read-only
        $rows = New-Object System.Collections.Generic.List[object]
        while (-not $rs.EOF) {
            $row = [ordered]@{}
            foreach ($field in $rs.Fields) {
                $value = $field.Value
                $row[$field.Name] = if ($null -eq $value -or $value -is [DBNull]) { $null } else { $value }
            }
            $rows.Add([pscustomobject]$row)
            $rs.MoveNext()
        }
        return @($rows.ToArray())
    } finally { if ($null -ne $rs) { $rs.Close() } }
}

$tables = New-Object System.Collections.Generic.List[object]
$checks = New-Object System.Collections.Generic.List[object]
foreach ($table in $db.TableDefs) {
    if ($table.Name -like 'MSys*' -or $table.Name -like '~*') { continue }
    $matchingFields = @($table.Fields | Where-Object { $_.Name -match $financial })
    if ($table.Name -ne 'tblCustomer' -and $table.Name -ne 'tblCustomer_Status_List' -and ($table.Name -notmatch $account -or -not $matchingFields.Count)) { continue }
    $fields = @($table.Fields | ForEach-Object {
        [pscustomobject]@{
            name = $_.Name; daoType = [int]$_.Type
            description = Property-Text $_ 'Description'
            format = Property-Text $_ 'Format'
        }
    })
    $tables.Add([pscustomobject]@{ name = $table.Name; fields = $fields })
    foreach ($field in $matchingFields) {
        $t = Identifier $table.Name
        $f = Identifier $field.Name
        try {
            # Only aggregate counts, never individual customer rows or amounts.
            if ($field.Type -eq 1) { # DAO Boolean
                $sql = "SELECT $f AS source_value, Count(*) AS row_count FROM $t GROUP BY $f"
            } elseif ($field.Type -in @(2,3,4,5,6,7,16,19,20,21)) {
                $sql = "SELECT Count(*) AS total_count, Count($f) AS non_null_count, Sum(IIf($f < 0,1,0)) AS negative_count, Sum(IIf($f = 0,1,0)) AS zero_count, Sum(IIf($f > 0,1,0)) AS positive_count FROM $t"
            } else {
                $sql = "SELECT Count(*) AS total_count, Count($f) AS non_null_count FROM $t"
            }
            $checks.Add([pscustomobject]@{ table=$table.Name; field=$field.Name; counts=@(Read-Aggregate $sql) })
        } catch {
            # Avoid printing driver errors that can contain connection details.
            $checks.Add([pscustomobject]@{ table=$table.Name; field=$field.Name; error='Aggregate unavailable; verify this field manually.' })
        }
    }
}

$queries = New-Object System.Collections.Generic.List[object]
foreach ($query in $db.QueryDefs) {
    if ($query.Name -like '~*') { continue }
    # Do not include pass-through queries or connection properties.
    if ([int]$query.Type -eq 112) { continue }
    $sql = [string]$query.SQL
    if (($query.Name -match $financial -or $sql -match $financial) -and ($query.Name -match $account -or $sql -match $account)) {
        # Definitions explain calculations; action definitions are never run.
        $queries.Add([pscustomobject]@{ name=$query.Name; daoType=[int]$query.Type; sql=$sql })
    }
}
$report = [ordered]@{
    audit='ViewPlan Account commercial snapshot — read only'
    observedAt=[DateTime]::UtcNow.ToString('o')
    daoTypes='1 Boolean; 2 Byte; 3 Integer; 4 Long; 5 Currency; 6 Single; 7 Double; 8 Date; 10 Text; 12 Memo; 20 Decimal'
    tables=@($tables.ToArray())
    aggregateChecks=@($checks.ToArray())
    relatedQueryDefinitions=@($queries.ToArray())
    verificationNeeded=@(
        'Which field/query matches the balance displayed by ViewPlan? Does a positive balance mean the customer owes the brewery?',
        'Which explicit field is the hold/stop control used by ViewPlan? Confirm what true/false or other values mean.',
        'What currency applies? DAO Currency is a numeric storage type, not proof of GBP.',
        'Can balance/limit/hold change without tblCustomer.lud changing? The new sync will re-read commercial facts every overnight run.'
    )
}
$json = ConvertTo-Json -InputObject $report -Depth 12
if ($OutputPath) {
    [IO.File]::WriteAllText($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath), $json, [Text.UTF8Encoding]::new($false))
}
Write-Output $json
