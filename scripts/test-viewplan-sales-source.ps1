$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'viewplan-sales-source.ps1')
# Fake DAO only: never attaches to Access or makes an HTTP request.
$script:rows=@()
$script:closed=$false
$script:lastSql=$null
$script:columns=@('order_id','order_no_val','customer_id','order_date','delivery_date','order_invoice_date','customer_ord_ref','comment','order_source','is_dispatched','dispatched_date','is_delivered','order_type','order_cancelled','order_deleted','customer_name','customer_address_town','sales_channel','customer_class','invoice_no_val','invoice_year','invoice_month_no','order_item_id','product_name','manual_entry_text','packaging_type','quantity','line_cancelled','line_deleted','standard_cost','item_discount','draught_relief','litre_capacity','line_net','line_vat','discounted_net','discounted_vat','line_gross','line_litres','line_weight')
$db=[pscustomobject]@{}
$db | Add-Member ScriptMethod OpenRecordset {
    param($sql,$mode)
    if($mode -ne 4 -or ($sql -notmatch '^SELECT TOP ' -and $sql -ne 'SELECT Now() AS source_now') -or $sql -match '(?i)\b(INSERT|DELETE|UPDATE|EXECUTE)\b'){throw 'Source must be bounded read-only SQL'}
    $clock=$sql -eq 'SELECT Now() AS source_now'
    if(-not $clock){$script:lastSql=$sql}
    $records=if($clock){@([pscustomobject]@{source_now=[DateTime]'2026-10-28T12:00:00'})}else{$script:rows}
    $names=if($clock){@('source_now')}else{$script:columns}
    $rs=[pscustomobject]@{Rows=@($records);Names=@($names);Index=0;EOF=(@($records).Count -eq 0);Fields=$null}
    $fields=[pscustomobject]@{Owner=$rs;Count=$rs.Names.Count}
    $fields | Add-Member ScriptMethod Item {
        param($name)
        # Like DAO, cached Field objects must read from the current record.
        $resolved=if($name -is [string]){$name}else{$this.Owner.Names[[int]$name]}
        $field=[pscustomobject]@{Owner=$this.Owner;Name=$resolved}
        $field | Add-Member ScriptProperty Value {$this.Owner.Rows[$this.Owner.Index].($this.Name)}
        return $field
    }
    $rs.Fields=$fields
    $rs | Add-Member ScriptMethod MoveNext {$this.Index++;$this.EOF=$this.Index -ge $this.Rows.Count}
    $rs | Add-Member ScriptMethod GetRows {
        param($count)
        $n=[Math]::Min($count,$this.Rows.Count-$this.Index)
        $matrix=New-Object 'object[,]' $this.Names.Count,$n
        for($r=0;$r -lt $n;$r++){for($c=0;$c -lt $this.Names.Count;$c++){$matrix[$c,$r]=$this.Rows[$this.Index+$r].($this.Names[$c])}}
        $this.Index+=$n;$this.EOF=$this.Index -ge $this.Rows.Count
        return ,$matrix
    }
    $rs | Add-Member ScriptMethod Close {$script:closed=$true}
    return $rs
}
function SourceRow([long]$order,[long]$line,[string]$product) {
    return [pscustomobject]@{
        order_id=$order;order_no_val=100+$order;customer_id=9;order_type=1
        order_date=[DateTime]'2026-10-28';order_item_id=$line;is_dispatched=$true
        product_name=$product;packaging_type='Firkin';quantity=2
        line_net=[decimal]100;line_vat=[decimal]20;discounted_net=[decimal]90
        discounted_vat=[decimal]18;line_gross=[decimal]120
        order_cancelled=$false;order_deleted=$false;line_cancelled=$false;line_deleted=$false
    }
}
$script:rows=@((SourceRow 42 1001 'Wreckless'),(SourceRow 42 1002 'Heartless'),(SourceRow 43 1003 'Faithless'))
$result=Get-ViewPlanSalesSnapshot $db
if($result.payload.Count -ne 2 -or $result.payload[0].lines.Count -ne 2){throw 'Orders/products were lost'}
if($result.payload[0].lines[0].source_line_id -ne 1001 -or $result.payload[0].lines[0].net_after_discount -ne 90){throw 'Source identities/discounted values lost'}
if($result.payload[0].order_date -ne '2026-10-28' -or $result.payload[0].order_no -ne '142'){throw 'Dates/numbers changed'}
if(-not $script:closed -or -not $result.complete){throw 'Snapshot did not complete/close'}
if($script:lastSql -match 'GetSelectedOrderID|FROM\s+qry|Date\(\)-14'){throw 'Saved query/windowed fulfilment scope must not be used for full Account history'}
$json=ConvertTo-Json -InputObject $result -Depth 12 | ConvertFrom-Json
if($json.payload[0].lines.Count -ne 2 -or $json.payload[1].lines.Count -ne 1){throw 'JSON array shape lost products'}
$script:rows[0].line_cancelled=$true
$script:rows[2].order_cancelled=$true
$result=Get-ViewPlanSalesSnapshot $db
if($result.payload[0].lines.Count -ne 1 -or $result.payload[1].eligible -ne $false -or $result.payload[1].lines.Count -ne 0){throw 'Cancellation did not reconcile'}
$script:rows=@((SourceRow 42 1001 '(manual entry)'))
$script:rows[0] | Add-Member NoteProperty manual_entry_text 'Special beer'
$result=Get-ViewPlanSalesSnapshot $db
if($result.payload[0].lines[0].product_name -ne 'Special beer'){throw 'Manual product name lost'}
$script:rows[0].order_no_val=$null
$result=Get-ViewPlanSalesSnapshot $db
if($result.payload[0].order_no -ne 'VP-ID:42' -or $result.payload[0].lines[0].product_name -ne 'Special beer'){throw 'Missing display number blocked stable-ID history'}
$script:rows=@()
$result=Get-ViewPlanSalesSnapshot -db $db -Since ([DateTime]'2026-10-27T12:00:00') -AfterOrderId 43 -Cursor 10
if($result.payload.Count -ne 0 -or $result.has_more -or $result.next_cursor -ne 10){throw 'Empty incremental batch is not a valid completion'}
if($script:lastSql -notmatch 'candidate.is_dispatched=True' -or $script:lastSql -notmatch '10/27/2026 11:55:00' -or $script:lastSql -notmatch 'candidate.order_id > 43' -or $script:lastSql -notmatch 'candidate.order_id > 10'){throw 'Checkpoint/overlap/new-ID scope is missing'}
$script:rows=@((SourceRow 42 1001 'Beer'))
$result=Get-ViewPlanSalesSnapshot -db $db -BatchOrders 1
if(-not $result.has_more -or $result.next_cursor -ne 42){throw 'Backfill batch did not provide a resumable cursor'}
foreach($scenario in @('duplicate','limit')){
    $script:rows=if($scenario -eq 'empty'){@()}else{@((SourceRow 42 1001 'Beer'),(SourceRow 42 1001 'Beer'))}
    $rejected=$false
    try {if($scenario -eq 'limit'){Get-ViewPlanSalesSnapshot $db 1 | Out-Null}else{Get-ViewPlanSalesSnapshot $db | Out-Null}}catch{$rejected=$true}
    if(-not $rejected){throw ('Invalid source accepted: '+$scenario)}
}
Write-Host 'Sales source fixtures passed: dispatched batches/products, bulk rows, stable IDs, blank-number fallback, checkpoint/overlap predicates, empty increments and fail-closed reads.'
