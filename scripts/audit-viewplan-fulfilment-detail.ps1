param(
    [DateTime]$WeekStart = (Get-Date).Date.AddDays(-(([int](Get-Date).DayOfWeek + 6) % 7)),
    [ValidateRange(1,6)][int]$Weeks = 3,
    [ValidateRange(1,10000)][int]$MaxRows = 5000,
    [string]$OutputPath = (Join-Path $PSScriptRoot 'fulfilment-detail-audit.json')
)
$ErrorActionPreference = 'Stop'
if ([Environment]::Is64BitProcess) { throw 'Use 32-bit Windows PowerShell in the logged-in ViewPlan session.' }
try { $access=[Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application'); $db=$access.CurrentDb() }
catch { throw 'Open and log into ViewPlan in this Windows session first.' }
$started=[DateTime]::UtcNow.ToString('o')
$start=$WeekStart.Date
$end=$start.AddDays(7*$Weeks)
$from='#'+$start.ToString('MM/dd/yyyy',[Globalization.CultureInfo]::InvariantCulture)+'#'
$until='#'+$end.ToString('MM/dd/yyyy',[Globalization.CultureInfo]::InvariantCulture)+'#'
# Include date candidates and recently created/changed orders, without filtering
# status flags. This is bounded discovery, not a complete open-order feed.
$where="([delivery_date] >= $from AND [delivery_date] < $until) OR ([planned_dispatch_date] >= $from AND [planned_dispatch_date] < $until) OR ([order_date] >= $from AND [order_date] < $until) OR ([updated_date] >= $from AND [updated_date] < $until) OR ([lud] >= $from AND [lud] < $until)"
$orderIds="SELECT [order_id] FROM [tblOrder] WHERE $where"
$lineIds="SELECT [order_item_id] FROM [tblOrder_Items] WHERE [order_id] IN ($orderIds)"
$queries=[ordered]@{}
$queries.orders="SELECT TOP $($MaxRows+1) [order_id],[order_no_val],[customer_id],[order_date],[delivery_date],[planned_dispatch_date],[delivery_vehicle_id],[is_released],[is_dispatched],[dispatched_date],[is_delivered],[is_closed],[is_cancelled],[is_deleted],[updated_date],[lud],[order_type],[is_pre_order],[parent_order_id],[order_exclude_from_dlv_sched],[order_gross_weight_kg],[delay_stock_allocation] FROM [tblOrder] WHERE $where ORDER BY [order_id]"
$queries.lines="SELECT TOP $($MaxRows+1) [order_item_id],[order_id],[brew_type_id],[product_name],[packaging_type],[quantity],[pkg_quantity],[stock_allocated],[allocated_quantity],[pkg_inv_allocated],[pkg_inv_allocated_quantity],[is_cancelled],[is_deleted],[is_picked],[brew_register_id],[misc_item_id],[order_item_task_id],[order_item_cpkg_id],[item_delay_stock_allocation] FROM [tblOrder_Items] WHERE [order_id] IN ($orderIds) ORDER BY [order_item_id]"
$queries.sub_lines="SELECT TOP $($MaxRows+1) [order_item_sub_item_id],[order_item_id],[brew_type_id],[alias_id],[quantity],[stock_allocated],[allocated_quantity] FROM [tblOrder_Item_Sub_Items] WHERE [order_item_id] IN ($lineIds) ORDER BY [order_item_sub_item_id]"
$queries.customers="SELECT TOP $($MaxRows+1) [customer_id],[customer_name],[customer_address_line1],[customer_address_line2],[customer_address_town],[customer_address_county],[customer_address_postcode],[delivery_address],[location_zone_no],[delivery_days],[customer_delivery_vehicle_id],[customer_exclude_from_dlv_sched],[customer_status_id] FROM [tblCustomer] WHERE [customer_id] IN (SELECT [customer_id] FROM [tblOrder] WHERE $where) ORDER BY [customer_id]"
$queries.packages="SELECT TOP $($MaxRows+1) [packaging_type],[litre_capacity],[packaging_weight_full_kg],[primary_packaging_type],[primary_content_count],[mixed_bottles],[has_inventory],[use_barcode],[internal_id],[is_available],[allow_sale] FROM [tblPackaging_Type_List] ORDER BY [packaging_type]"
$queries.vehicles="SELECT TOP $($MaxRows+1) [vehicle_id],[vehicle_name],[allow_delivery],[vehicle_max_load_kg],[is_available],[is_default] FROM [tblVehicles] ORDER BY [vehicle_id]"
$queries.customer_statuses="SELECT TOP $($MaxRows+1) [customer_status_id],[customer_status],[allow_order],[allow_order_dispatch] FROM [tblCustomer_Status_List] ORDER BY [customer_status_id]"
$queries.config="SELECT TOP $($MaxRows+1) [config_id],[is_default],[set_delivered_on_dispatch],[allow_dispatch_with_incomplete_allocation],[delivery_max_weight_kg] FROM [tblConfig_List] ORDER BY [config_id]"

function Read-Snapshot([string]$sql) {
    $rs=$null
    $rows=New-Object System.Collections.Generic.List[object]
    try {
        $rs=$db.OpenRecordset($sql,4)
        while (-not $rs.EOF) {
            if ($rows.Count -ge $MaxRows) { throw 'Row limit exceeded; no partial report will be written. Narrow the date window.' }
            $row=[ordered]@{}
            foreach ($field in $rs.Fields) {
                $v=$field.Value
                if ($null -eq $v -or $v -is [DBNull]) { $v=$null }
                elseif ($v -is [DateTime]) { $v=$v.ToString('o') }
                $row[[string]$field.Name]=$v
            }
            $rows.Add([pscustomobject]$row)
            $rs.MoveNext()
        }
    } finally { if ($null -ne $rs) { $rs.Close() } }
    return $rows.ToArray()
}
$data=[ordered]@{}
foreach ($key in $queries.Keys) {
    Write-Host "Reading $key (read only)..."
    $data[$key]=@(Read-Snapshot $queries[$key])
}
# Read definitions only; never execute saved queries or their functions/parameters.
$definitions=New-Object System.Collections.Generic.List[object]
$issues=New-Object System.Collections.Generic.List[object]
foreach ($name in @('qryDeliverySchedule','qryDeliveryRouteItems','qryReportVehicleDeliveryWeights','qryOrderItemsAwaitingAllocation','qryOrderPkgInventoryDispatchCheck')) {
    try {
        $q=$db.QueryDefs.Item($name)
        if ([int]$q.Type -ne 0) { throw 'Not a SELECT definition' }
        $definitions.Add([pscustomobject]@{name=$name;sql=[string]$q.SQL})
    } catch { $issues.Add([pscustomobject]@{name=$name;error='select_definition_unavailable'}) }
}
$report=[ordered]@{
    audit='ViewPlan fulfilment detail - read only';version=1;started_at=$started;observed_at=[DateTime]::UtcNow.ToString('o')
    window_start=$start.ToString('yyyy-MM-dd');window_end_exclusive=$end.ToString('yyyy-MM-dd');max_rows_per_section=$MaxRows
    data_reads_complete=$true;definitions_complete=($issues.Count -eq 0);source_timezone='ViewPlan local dates; timezone not inferred'
    scope='Orders with delivery/planned dispatch/creation/change date in window, including cancelled/deleted; not a full open-order feed'
    consistency='Sequential read-only snapshots; source may change during export. Not a transactionally consistent production import.'
    rows=$data;select_definitions=@($definitions.ToArray());issues=@($issues.ToArray())
    note='No allocation, dispatch, order or configuration writes. Weight and status meanings require review. Old undated unchanged orders may be outside this sample.'
}
$destination=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$json=ConvertTo-Json -InputObject $report -Depth 12
[IO.File]::WriteAllText($destination,$json,[Text.UTF8Encoding]::new($false))
Write-Host "Read-only detail audit written to $destination"
foreach ($key in $data.Keys) { Write-Host "$key : $($data[$key].Count)" }
if ($issues.Count) { Write-Warning 'Some query definitions unavailable; inspect issues.' }
