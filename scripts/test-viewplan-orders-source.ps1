param([string]$AuditPath)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'viewplan-orders-source.ps1')
$script:fixture=Get-Content -LiteralPath $AuditPath -Raw|ConvertFrom-Json
$script:tables=@{tblOrder='orders';tblOrder_Items='lines';tblOrder_Item_Sub_Items='sub_lines';tblCustomer='customers';tblPackaging_Type_List='packages';tblVehicles='vehicles';tblCustomer_Status_List='customer_statuses'}
$db=[pscustomobject]@{}
$db|Add-Member ScriptMethod OpenRecordset {
 param($sql,$mode)
 if($mode -ne 4 -or $sql -notmatch '^SELECT TOP '){throw 'Only bounded read-only snapshots permitted'}
 if($sql -notmatch 'FROM \[([^\]]+)\]'){throw 'Unknown source table'}
 $key=$script:tables[$Matches[1]];if(-not $key){throw 'Unexpected source read'}
 $rows=@($script:fixture.rows.$key)
 $rs=[pscustomobject]@{Rows=$rows;Index=0;EOF=($rows.Count -eq 0);Fields=@()}
 $rs|Add-Member ScriptMethod UpdateFields {
  $this.Fields=if($this.EOF){@()}else{@($this.Rows[$this.Index].PSObject.Properties|ForEach-Object {[pscustomobject]@{Name=$_.Name;Value=$_.Value}})}
 }
 $rs|Add-Member ScriptMethod MoveNext {$this.Index++;$this.EOF=$this.Index -ge $this.Rows.Count;$this.UpdateFields()}
 $rs|Add-Member ScriptMethod Close {}
 $rs.UpdateFields();return $rs
}
$r=Get-FulfilmentProjection $db @(39841)
if($r.payload.orders.Count -ne $script:fixture.rows.orders.Count){throw 'Order count mismatch'}
if(@($r.payload.orders|Group-Object {$_.header.order_id}|Where-Object Count -gt 1).Count){throw 'Duplicate orders'}
if(($r.payload.orders|ForEach-Object {$_.lines.Count}|Measure-Object -Sum).Sum -ne $script:fixture.rows.lines.Count){throw 'Lost lines'}
if(-not @($r.payload.orders|ForEach-Object {$_.lines}|Where-Object {$_.unit_weight_kg -gt 0}).Count){throw 'Weights not projected'}
$rejected=$false;try{Get-FulfilmentProjection $db @() 1|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Row limit did not fail closed'}
Write-Host 'Order adapter fixture passed: complete lines, exact joins, overlapping read deduplication, weights and row limit.'
