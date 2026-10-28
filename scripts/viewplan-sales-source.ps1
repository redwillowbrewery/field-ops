# Account order history adapter. Field names and discounted values audited from
# ViewPlan's sales spreadsheet SELECT definitions, supplied 28 October 2026.
# Read explicit SELECT snapshots only; never execute saved queries or VBA functions.
function Get-ViewPlanSalesSnapshot($db, [int]$MaxRows=250000) {
    if ($MaxRows -lt 1 -or $MaxRows -gt 1000000) { throw 'Invalid sales source row limit.' }
    $at=[DateTime]::UtcNow.ToString('o')
    $timer=[Diagnostics.Stopwatch]::StartNew()
    $fieldCache=@{}
    $sql=@"
SELECT TOP $($MaxRows+1)
 o.order_id, o.order_no_val, o.customer_id, o.order_date, o.delivery_date,
 o.order_invoice_date, o.customer_ord_ref, o.comment, o.order_source,
 o.is_dispatched, o.dispatched_date, o.is_delivered, o.order_type,
 o.is_cancelled AS order_cancelled, o.is_deleted AS order_deleted,
 c.customer_name, c.customer_address_town, c.sales_channel, c.customer_class,
 inv.invoice_no_val, inv.invoice_year, inv.invoice_month_no,
 i.order_item_id, i.product_name, i.manual_entry_text, i.packaging_type,
 i.quantity, i.is_cancelled AS line_cancelled, i.is_deleted AS line_deleted,
 i.standard_cost, i.item_discount, i.draught_relief, p.litre_capacity,
 Round(i.total_cost,2) AS line_net, Round(i.vat_amount,2) AS line_vat,
 IIf(Round(i.total_cost,2)>0,
   IIf(o.order_discount>0,Round(Round(i.total_cost,2)*(1-o.order_discount),2),Round(i.total_cost,2)),
   IIf(i.packaging_type<>'(discount)',Round(i.total_cost,2),Null)) AS discounted_net,
 IIf(Round(i.vat_amount,2)>0,
   IIf(o.order_discount>0,Round(Round(i.vat_amount,2)*(1-o.order_discount),2),Round(i.vat_amount,2)),
   IIf(i.packaging_type<>'(discount)',Round(i.vat_amount,2),Null)) AS discounted_vat,
 Round(i.total_cost,2)+Round(i.vat_amount,2) AS line_gross,
 Round(p.litre_capacity*i.quantity,2) AS line_litres,
 Round(p.packaging_weight_full_kg*i.quantity,2) AS line_weight
FROM (((tblOrder AS o LEFT JOIN tblOrder_Items AS i ON o.order_id=i.order_id)
 LEFT JOIN tblCustomer AS c ON o.customer_id=c.customer_id)
 LEFT JOIN tblInvoice AS inv ON o.invoice_id=inv.invoice_id)
 LEFT JOIN tblPackaging_Type_List AS p ON i.packaging_type=p.packaging_type
ORDER BY o.order_id, i.order_item_id
"@
    function Value($rs,[string]$name) {
        # DAO Field objects follow the current record. Avoid re-resolving the
        # Fields collection and named COM field for every value on every row.
        if(-not $fieldCache.ContainsKey($name)){$fieldCache[$name]=$rs.Fields.Item($name)}
        $v=$fieldCache[$name].Value
        if ($null -eq $v -or $v -is [DBNull]) { return $null }
        return $v
    }
    function DateOnly($v) { if($null -eq $v){return $null};return ([DateTime]$v).ToString('yyyy-MM-dd') }
    function Flag($v) {
        if($null -eq $v){return $false}
        if($v -is [bool]){return $v}
        if($v -eq -1 -or $v -eq 1){return $true}
        if($v -eq 0){return $false}
        throw 'Invalid source Boolean.'
    }
    $orders=New-Object System.Collections.Generic.List[object]
    $seenLines=@{};$current=$null;$rowCount=0;$rs=$null
    $lastReportSeconds=0
    try {
        Write-Host 'Sales: opening the full ViewPlan order/line query (read only)...'
        $rs=$db.OpenRecordset($sql,4)
        Write-Host ('Sales: query opened after {0:n1}s; reading history (limit {1:n0} rows)...' -f $timer.Elapsed.TotalSeconds,$MaxRows)
        while(-not $rs.EOF) {
            if($rowCount -ge $MaxRows){throw 'Sales snapshot exceeds row limit; previous history retained.'}
            $rowCount++
            $id=Value $rs 'order_id'
            if($null -eq $id -or $id -le 0){throw 'Invalid source order identity.'}
            if($null -eq $current -or $current.source_order_id -ne $id){
                $number=Value $rs 'order_no_val'
                $eligible=((Value $rs 'order_type') -in @(1,2) -and -not (Flag (Value $rs 'order_cancelled')) -and -not (Flag (Value $rs 'order_deleted')))
                if($eligible -and $null -eq $number){throw 'Missing source order number.'}
                $current=[ordered]@{
                    source_order_id=[long]$id
                    order_no=if($null -eq $number){'source-only:'+ $id}else{([decimal]$number).ToString('0.################',[Globalization.CultureInfo]::InvariantCulture)}
                    customer_id=Value $rs 'customer_id'
                    eligible=$eligible
                    order_date=DateOnly (Value $rs 'order_date')
                    delivery_date=DateOnly (Value $rs 'delivery_date')
                    invoice_date=DateOnly (Value $rs 'order_invoice_date')
                    customer_order_ref=Value $rs 'customer_ord_ref'
                    comment=Value $rs 'comment'
                    order_source=Value $rs 'order_source'
                    sales_channel=Value $rs 'sales_channel'
                    customer_class=Value $rs 'customer_class'
                    source_customer_display=Value $rs 'customer_name'
                    dispatched=Flag (Value $rs 'is_dispatched')
                    dispatched_date=DateOnly (Value $rs 'dispatched_date')
                    delivered=Flag (Value $rs 'is_delivered')
                    invoice_no=if($null -ne (Value $rs 'invoice_no_val')){[string](Value $rs 'invoice_no_val')}else{$null}
                    invoice_year=Value $rs 'invoice_year'
                    invoice_month=Value $rs 'invoice_month_no'
                    lines=New-Object System.Collections.Generic.List[object]
                }
                $orders.Add($current)
            }
            $line=Value $rs 'order_item_id'
            if($current.eligible -and $null -ne $line -and -not (Flag (Value $rs 'line_cancelled')) -and -not (Flag (Value $rs 'line_deleted'))){
                if($line -le 0 -or $seenLines.ContainsKey([string]$line)){throw 'Invalid or duplicate source order line.'}
                $seenLines[[string]$line]=$true
                $product=Value $rs 'product_name'
                if($product -eq '(manual entry)'){$product=Value $rs 'manual_entry_text'}
                $pkg=Value $rs 'packaging_type'
                $type=if($pkg -eq '(discount)' -or $product -eq '(discount)'){'discount'}elseif($pkg -eq '(credit note)'){'credit'}elseif($pkg -in @('(misc item)','(service)','(equip hire)')){'misc'}else{'product'}
                $current.lines.Add([ordered]@{
                    source_line_id=[long]$line;product_name=$product;package_type=$pkg
                    quantity=Value $rs 'quantity';package_unit_litres=Value $rs 'litre_capacity'
                    total_litres=Value $rs 'line_litres';draught=Flag (Value $rs 'draught_relief')
                    standard_unit_price=Value $rs 'standard_cost'
                    net_amount=Value $rs 'line_net';vat_amount=Value $rs 'line_vat'
                    net_after_discount=Value $rs 'discounted_net';vat_after_discount=Value $rs 'discounted_vat'
                    gross_amount=Value $rs 'line_gross';line_weight_kg=Value $rs 'line_weight';line_type=$type
                })
            }
            if(($rowCount % 500) -eq 0 -or ($timer.Elapsed.TotalSeconds-$lastReportSeconds) -ge 10){
                Write-Host ('Sales: read {0:n0} source rows; {1:n0} orders; {2:n0} product/financial lines; elapsed {3:n0}s' -f $rowCount,$orders.Count,$seenLines.Count,$timer.Elapsed.TotalSeconds)
                $lastReportSeconds=$timer.Elapsed.TotalSeconds
            }
            $rs.MoveNext()
        }
    } finally {if($null -ne $rs){$rs.Close()}}
    if(-not $orders.Count){throw 'Empty sales source; previous history retained.'}
    Write-Host ('Sales: source read complete: {0:n0} rows, {1:n0} orders, {2:n0} lines in {3:n1}s. Preparing payload...' -f $rowCount,$orders.Count,$seenLines.Count,$timer.Elapsed.TotalSeconds)
    $payload=@($orders | ForEach-Object {
        $row=@{};foreach($key in $_.Keys){if($key -eq 'lines'){$row[$key]=@($_.lines.ToArray())}else{$row[$key]=$_[$key]}}
        $row
    })
    return @{payload=$payload;snapshot_at=$at;complete=$true}
}
