# Read-only ViewPlan adapter. No source query execution or source writes.
function Get-FulfilmentProjection($db, [long[]]$TrackedIds=@(), [int]$MaxRows=10000) {
function Read-FulfilmentSnapshot([string]$sql) {
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

 $started=[DateTime]::UtcNow.ToString('o')
 $sets=@{orders=@{};lines=@{};sub_lines=@{};customers=@{}}
 $keys=@{orders='order_id';lines='order_item_id';sub_lines='order_item_sub_item_id';customers='customer_id'}
 $filters=New-Object System.Collections.Generic.List[string]
 # Keep recent/future work independent of misleading source delivered flags.
 $filters.Add('[delivery_date] >= Date()-14 OR [planned_dispatch_date] >= Date()-14 OR [order_date] >= Date()-14 OR (([is_delivered]=False OR [is_delivered] Is Null) AND ([is_cancelled]=False OR [is_cancelled] Is Null) AND ([is_deleted]=False OR [is_deleted] Is Null))')
 for($i=0;$i -lt $TrackedIds.Count;$i+=200){
  $batch=@($TrackedIds[$i..([Math]::Min($i+199,$TrackedIds.Count-1))])
  if(@($batch|Where-Object {$_ -le 0}).Count){throw 'Invalid tracked source identity'}
  $filters.Add('[order_id] IN ('+($batch -join ',')+')')
 }
 foreach($where in $filters){
  $orderIds="SELECT [order_id] FROM [tblOrder] WHERE $where"
  $lineIds="SELECT [order_item_id] FROM [tblOrder_Items] WHERE [order_id] IN ($orderIds)"
  $queries=[ordered]@{}
$queries.orders="SELECT TOP $($MaxRows+1) [order_id],[order_no_val],[customer_id],[order_date],[delivery_date],[planned_dispatch_date],[delivery_vehicle_id],[is_released],[is_dispatched],[dispatched_date],[is_delivered],[is_closed],[is_cancelled],[is_deleted],[updated_date],[lud],[order_type],[is_pre_order],[parent_order_id],[order_exclude_from_dlv_sched],[order_gross_weight_kg],[delay_stock_allocation] FROM [tblOrder] WHERE $where ORDER BY [order_id]"
$queries.lines="SELECT TOP $($MaxRows+1) [order_item_id],[order_id],[brew_type_id],[product_name],[packaging_type],[quantity],[pkg_quantity],[stock_allocated],[allocated_quantity],[pkg_inv_allocated],[pkg_inv_allocated_quantity],[is_cancelled],[is_deleted],[is_picked],[brew_register_id],[misc_item_id],[order_item_task_id],[order_item_cpkg_id],[item_delay_stock_allocation] FROM [tblOrder_Items] WHERE [order_id] IN ($orderIds) ORDER BY [order_item_id]"
$queries.sub_lines="SELECT TOP $($MaxRows+1) [order_item_sub_item_id],[order_item_id],[brew_type_id],[alias_id],[quantity],[stock_allocated],[allocated_quantity] FROM [tblOrder_Item_Sub_Items] WHERE [order_item_id] IN ($lineIds) ORDER BY [order_item_sub_item_id]"
$queries.customers="SELECT TOP $($MaxRows+1) [customer_id],[customer_name],[customer_address_line1],[customer_address_line2],[customer_address_town],[customer_address_county],[customer_address_postcode],[delivery_address],[location_zone_no],[delivery_days],[customer_delivery_vehicle_id],[customer_exclude_from_dlv_sched],[customer_status_id] FROM [tblCustomer] WHERE [customer_id] IN (SELECT [customer_id] FROM [tblOrder] WHERE $where) ORDER BY [customer_id]"
  foreach($key in $queries.Keys){foreach($row in @(Read-FulfilmentSnapshot $queries[$key])){
   $id=[string]$row.($keys[$key]);$sets[$key][$id]=$row
   if($sets[$key].Count -gt $MaxRows){throw 'Full projection exceeded limit; previous snapshot retained'}
  }}
 }
 $queries=[ordered]@{}
$queries.packages="SELECT TOP $($MaxRows+1) [packaging_type],[litre_capacity],[packaging_weight_full_kg],[primary_packaging_type],[primary_content_count],[mixed_bottles],[has_inventory],[use_barcode],[internal_id],[is_available],[allow_sale] FROM [tblPackaging_Type_List] ORDER BY [packaging_type]"
$queries.vehicles="SELECT TOP $($MaxRows+1) [vehicle_id],[vehicle_name],[allow_delivery],[vehicle_max_load_kg],[is_available],[is_default] FROM [tblVehicles] ORDER BY [vehicle_id]"
$queries.customer_statuses="SELECT TOP $($MaxRows+1) [customer_status_id],[customer_status],[allow_order],[allow_order_dispatch] FROM [tblCustomer_Status_List] ORDER BY [customer_status_id]"
 $references=@{}
 foreach($key in $queries.Keys){$references[$key]=@(Read-FulfilmentSnapshot $queries[$key])}
 $weights=@{};foreach($p in $references.packages){$weights[[string]$p.packaging_type]=$p}
 $statuses=@{};foreach($s in $references.customer_statuses){$statuses[[string]$s.customer_status_id]=$s}
 $lineGroups=@{}
 foreach($line in $sets.lines.Values){
  $id=[string]$line.order_id
  if(-not $sets.orders.ContainsKey($id)){throw 'Order changed during read; retry'}
  if(-not $lineGroups.ContainsKey($id)){$lineGroups[$id]=New-Object System.Collections.Generic.List[object]}
  $pkg=$weights[[string]$line.packaging_type]
  $row=[ordered]@{};foreach($p in $line.PSObject.Properties){$row[$p.Name]=$p.Value}
  $row.unit_weight_kg=if($null -ne $pkg){$pkg.packaging_weight_full_kg}else{$null}
  $lineGroups[$id].Add([pscustomobject]$row)
 }
 $projected=New-Object System.Collections.Generic.List[object]
 foreach($order in ($sets.orders.Values|Sort-Object order_id)){
  $customer=$sets.customers[[string]$order.customer_id]
  if($null -eq $customer){throw 'Missing source customer; previous snapshot retained'}
  $id=[string]$order.order_id
  $items=if($lineGroups.ContainsKey($id)){@($lineGroups[$id].ToArray()|Sort-Object order_item_id)}else{@()}
  $projected.Add([pscustomobject]@{header=$order;customer=$customer;customer_status=$statuses[[string]$customer.customer_status_id];lines=@($items);sub_lines=@($sets.sub_lines.Values|Where-Object {$_.order_item_id -in $items.order_item_id}|Sort-Object order_item_sub_item_id)})
 }
 if(-not $projected.Count){throw 'Empty source scope; previous snapshot retained'}
 return @{snapshot_at=$started;payload=@{orders=@($projected.ToArray());vehicles=@($references.vehicles|Sort-Object vehicle_id)}}
}
