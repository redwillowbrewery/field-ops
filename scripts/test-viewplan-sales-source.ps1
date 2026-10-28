$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'viewplan-sales-source.ps1')
# Fake DAO only: never attaches to Access or makes an HTTP request.
$script:rows=@()
$script:closed=$false
$script:lastSql=$null
$db=[pscustomobject]@{}
$db | Add-Member ScriptMethod OpenRecordset {
    param($sql,$mode)
    if($mode -ne 4 -or $sql -notmatch '^SELECT TOP ' -or $sql -match '(?i)\b(INSERT|DELETE|UPDATE|EXECUTE)\b'){throw 'Source must be bounded read-only SQL'}
    $script:lastSql=$sql
    $rs=[pscustomobject]@{Rows=$script:rows;Index=0;EOF=($script:rows.Count -eq 0);Fields=$null}
    $fields=[pscustomobject]@{Owner=$rs}
    $fields | Add-Member ScriptMethod Item {
        param($name)
        # Like DAO, cached Field objects must read from the current record.
        $field=[pscustomobject]@{Owner=$this.Owner;Name=$name}
        $field | Add-Member ScriptProperty Value {$this.Owner.Rows[$this.Owner.Index].($this.Name)}
        return $field
    }
    $rs.Fields=$fields
    $rs | Add-Member ScriptMethod MoveNext {$this.Index++;$this.EOF=$this.Index -ge $this.Rows.Count}
    $rs | Add-Member ScriptMethod Close {$script:closed=$true}
    return $rs
}
function SourceRow([long]$order,[long]$line,[string]$product) {
    return [pscustomobject]@{
        order_id=$order;order_no_val=100+$order;customer_id=9;order_type=1
        order_date=[DateTime]'2026-10-28';order_item_id=$line
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
foreach($scenario in @('empty','duplicate','limit')){
    $script:rows=if($scenario -eq 'empty'){@()}else{@((SourceRow 42 1001 'Beer'),(SourceRow 42 1001 'Beer'))}
    $rejected=$false
    try {if($scenario -eq 'limit'){Get-ViewPlanSalesSnapshot $db 1 | Out-Null}else{Get-ViewPlanSalesSnapshot $db | Out-Null}}catch{$rejected=$true}
    if(-not $rejected){throw ('Invalid source accepted: '+$scenario)}
}
Write-Host 'Sales source fixtures passed: full orders/products, stable IDs, arrays, cancellation, manual product names and fail-closed reads.'
