param(
    [string]$OutputPath = (Join-Path $PSScriptRoot 'viewplan-sales-definitions.json'),
    [ValidateRange(1,500)][int]$MaxQueries = 100
)

# Read definitions and field metadata only. No recordsets, query execution,
# source writes, connection-property export or Brewery Ops requests.
$ErrorActionPreference = 'Stop'
if ([Environment]::Is64BitProcess) {
    throw 'Use 32-bit Windows PowerShell in the same logged-in session as ViewPlan.'
}
try {
    $access = [Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application')
    $db = $access.CurrentDb()
} catch {
    throw 'Open and log into ViewPlan first, using the same Windows user/session.'
}

$seeds = @(
    'qryReportA%Sales (A)_Order Data (Spreadsheet)',
    'qryReportA%Sales (A)_Order Data Filtered (Spreadsheet)',
    'qryReportA%Sales (A)_Orders by Month (Spreadsheet)',
    'qryReportA%Sales (A)_Order Discount by Month',
    'qryOrderCostTotals',
    'qryOrderDetails',
    'qryOrderDetails_All',
    'qryOrderExistingCreditNoteList',
    'qryOrderExistingCreditNoteTotals',
    'qryCustomerOrderDebitCreditReport',
    'qryReportCustomerOrderStatsSub1',
    'qryReportCustomerOrderStatsSub2',
    'qryReportCustomerOrderSummaryData'
)

function References-Name([string]$sql, [string]$name) {
    if ($sql.IndexOf(('[' + $name + ']'), [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    return [regex]::IsMatch($sql, '(?i)(?<![a-z0-9_])' + [regex]::Escape($name) + '(?![a-z0-9_])')
}

$available = @{}
foreach ($query in $db.QueryDefs) {
    $name = [string]$query.Name
    if ($name -notlike '~*') { $available[$name] = $query }
}
$pending = New-Object 'System.Collections.Generic.Queue[string]'
foreach ($name in $seeds) { $pending.Enqueue($name) }
$visited = @{}
$definitions = New-Object System.Collections.Generic.List[object]
$issues = New-Object System.Collections.Generic.List[object]

while ($pending.Count) {
    $name = $pending.Dequeue()
    if ($visited.ContainsKey($name)) { continue }
    $visited[$name] = $true
    if ($visited.Count -gt $MaxQueries) { throw 'Query dependency limit reached; no partial report written.' }
    if (-not $available.ContainsKey($name)) {
        $issues.Add([pscustomobject]@{name=$name;issue='Definition not found'})
        continue
    }
    try {
        $query = $available[$name]
        $kind = [int]$query.Type
        # SELECT, UNION and crosstab definitions only; none is executed.
        if ($kind -notin @(0,128,16)) {
            $issues.Add([pscustomobject]@{name=$name;issue='Non-select or pass-through definition omitted'})
            continue
        }
        $sql = [string]$query.SQL
        if ($sql -match '(?i)\b(PWD|PASSWORD|UID|USER\s+ID|DATABASE|SERVER)\s*=|ODBC;') {
            $issues.Add([pscustomobject]@{name=$name;issue='External connection definition omitted'})
            continue
        }
        $dependencies = @($available.Keys | Where-Object {
            $_ -ne $name -and (References-Name $sql $_)
        } | Sort-Object)
        $definitions.Add([pscustomobject]@{
            name=$name;dao_type=$kind;sql=$sql;query_dependencies=$dependencies
        })
        foreach ($dependency in $dependencies) { $pending.Enqueue($dependency) }
    } catch {
        # Do not export driver errors, which may contain connection details.
        $issues.Add([pscustomobject]@{name=$name;issue='Definition metadata unavailable'})
    }
}

if (-not $definitions.Count) { throw 'No sales definitions found; no report written.' }

# Include metadata for referenced base tables, without reading any rows or
# exporting linked-table connection strings or paths.
$tables = New-Object System.Collections.Generic.List[object]
foreach ($table in $db.TableDefs) {
    $name = [string]$table.Name
    if ($name -like 'MSys*' -or $name -like '~*') { continue }
    $referenced = $false
    foreach ($definition in $definitions) {
        if (References-Name $definition.sql $name) { $referenced=$true; break }
    }
    if (-not $referenced) { continue }
    try {
        $fields = @($table.Fields | ForEach-Object {
            [pscustomobject]@{name=[string]$_.Name;dao_type=[int]$_.Type;size=[int]$_.Size}
        })
        $tables.Add([pscustomobject]@{name=$name;fields=$fields})
    } catch {
        $issues.Add([pscustomobject]@{name=$name;issue='Table field metadata unavailable'})
    }
}

$report = [ordered]@{
    audit='ViewPlan sales calculation definitions - metadata only'
    version=1
    observed_at=[DateTime]::UtcNow.ToString('o')
    complete=($issues.Count -eq 0)
    seeds=$seeds
    definitions=@($definitions.ToArray() | Sort-Object name)
    referenced_tables=@($tables.ToArray() | Sort-Object name)
    issues=@($issues.ToArray())
    scope='SQL definitions and field names/types only; no customer/order rows, source writes or query execution'
    verification_needed=@(
        'Identify the exact Net (Incl Discount), VAT and Gross report calculations.',
        'Verify cancellation, deletion, quote/pre-order and credit-note inclusion rules.',
        'Check dependencies on ViewPlan/VBA functions or report parameters before choosing read SQL.',
        'Do not infer monetary semantics from total_amount or total_cost field names alone.'
    )
}
$destination = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$json = ConvertTo-Json -InputObject $report -Depth 12
[IO.File]::WriteAllText($destination, $json, [Text.UTF8Encoding]::new($false))
Write-Host ('Sales definitions written: ' + $destination)
Write-Host ('Definitions: {0}; tables: {1}; issues: {2}' -f $definitions.Count,$tables.Count,$issues.Count)
Write-Host 'No saved queries were executed and no ViewPlan records were read or changed.'
if ($issues.Count) { Write-Warning 'Inspect report issues; incomplete discovery is not proof of a valid sales mapping.' }
