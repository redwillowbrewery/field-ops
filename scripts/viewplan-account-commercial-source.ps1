# Source mappings audited on 7 September 2026. No customer.lud filter: payments
# and status-list changes can affect commercial facts without a customer update.
function Convert-ViewPlanAllowedToBlocked($value) {
    if ($null -eq $value -or $value -is [DBNull]) { return $null }
    if ($value -is [bool]) { return -not $value }
    if ($value -is [ValueType] -and $value -eq -1) { return $false }
    if ($value -is [ValueType] -and $value -eq 0) { return $true }
    throw 'Unexpected ViewPlan permission value; commercial refresh aborted.'
}
function Get-ViewPlanCommercialRows($db) {
    # Reuse ViewPlan's own all-unpaid-orders query. A missing row means no unpaid
    # orders; a row whose aggregate is NULL stays unknown rather than becoming 0.
    $sql = @'
SELECT c.customer_id, c.customer_max_credit,
       b.customer_id AS balance_customer_id, b.outstanding_total,
       s.customer_status, s.allow_order, s.allow_order_dispatch
FROM (tblCustomer AS c
LEFT JOIN qryCustomerOutstandingTotalsAll AS b ON c.customer_id = b.customer_id)
LEFT JOIN tblCustomer_Status_List AS s ON c.customer_status_id = s.customer_status_id
ORDER BY c.customer_id
'@
    $rs = $null
    $rows = New-Object System.Collections.Generic.List[object]
    try {
        $rs = $db.OpenRecordset($sql, 4) # dbOpenSnapshot
        while (-not $rs.EOF) {
            $value = @{}
            foreach ($field in $rs.Fields) {
                $v = $field.Value
                $value[$field.Name] = if ($null -eq $v -or $v -is [DBNull]) { $null } else { $v }
            }
            $rows.Add([pscustomobject]@{
                customer_id = [int]$value.customer_id
                balance = if ($null -eq $value.balance_customer_id) { [decimal]0 } elseif ($null -eq $value.outstanding_total) { $null } else { [decimal]$value.outstanding_total }
                credit_limit = if ($null -eq $value.customer_max_credit) { $null } else { [decimal]$value.customer_max_credit }
                order_blocked = Convert-ViewPlanAllowedToBlocked $value.allow_order
                dispatch_blocked = Convert-ViewPlanAllowedToBlocked $value.allow_order_dispatch
                source_status = $value.customer_status
            })
            $rs.MoveNext()
        }
        if (-not $rows.Count) { throw 'ViewPlan returned no commercial rows; previous snapshot retained.' }
        return $rows.ToArray()
    } finally { if ($null -ne $rs) { $rs.Close() } }
}
