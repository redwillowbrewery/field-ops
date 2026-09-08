# Read-only source helpers audited 8 September 2026.
function Convert-TakeOffPlanArguments([string]$value) {
    $parts=$value.Split('|')
    function ReadNumber([string]$text) {
        if([string]::IsNullOrWhiteSpace($text)){return $null}
        $n=[decimal]0
        if(-not [decimal]::TryParse($text,[Globalization.NumberStyles]::AllowDecimalPoint,[Globalization.CultureInfo]::InvariantCulture,[ref]$n) -or $n -lt 0){throw 'Invalid ViewPlan plan quantity or identity'}
        return $n
    }
    $litres=ReadNumber $parts[0]
    $tank=if($parts.Length -gt 1){ReadNumber $parts[1]}else{$null}
    if($null -ne $tank -and $tank -ne [decimal]::Truncate($tank)){throw 'Non-integer planned tank identity'}
    [pscustomobject]@{planned_litres=$litres;planned_tank_id=$tank;planned_gyle=if($parts.Length -gt 3 -and $parts[3]){$parts[3]}else{$null}}
}
function Read-TakeOffSnapshot($db,[string]$sql) {
    $rs=$null; $rows=New-Object System.Collections.Generic.List[object]
    try {
        $rs=$db.OpenRecordset($sql,4)
        while(-not $rs.EOF) {
            $row=[ordered]@{}
            foreach($f in $rs.Fields){
                $v=$f.Value
                if($null -eq $v -or $v -is [DBNull]){$v=$null}
                elseif([int]$f.Type -eq 1){if($v -is [bool]){}elseif($v -in @(-1,1)){$v=$true}elseif($v -eq 0){$v=$false}else{throw 'Unexpected source Boolean'}}
                elseif($v -is [DateTime]){$v=$v.ToString('yyyy-MM-ddTHH:mm:ss')}
                $row[$f.Name]=$v
            }
            $rows.Add([pscustomobject]$row);$rs.MoveNext()
        }
        return $rows.ToArray()
    } finally {if($null -ne $rs){$rs.Close()}}
}
function Get-ViewPlanTakeOffSnapshot($db) {
    $at=[DateTime]::UtcNow.ToString('o')
    # Read all planning identities, including completed/deleted rows for reconciliation.
    $plans=@(Read-TakeOffSnapshot $db @'
SELECT t.task_id,t.task_object_id AS brew_type_id,t.task_due_date,
t.task_complete,t.task_closed,t.is_deleted,t.task_brew_register_id,
t.task_object_list,t.updated_date,b.brew_product_name
FROM (tblTasks AS t INNER JOIN tblTask_Type_List AS tt ON t.task_type_id=tt.task_type_id)
LEFT JOIN tblBrew_Type AS b ON t.task_object_id=b.brew_type_id
WHERE tt.internal_id=2 ORDER BY t.task_id
'@)
    foreach($p in $plans){
        $parsed=Convert-TakeOffPlanArguments $p.task_object_list
        $p | Add-Member -NotePropertyName parsed_plan -NotePropertyValue $parsed
    }
    # Preserve observations; classify staging vessels through reviewed mappings.
    $tanks=@(Read-TakeOffSnapshot $db @'
SELECT t.tank_id,t.tank_label_text,t.tank_type,t.current_level,t.brew_register_id,
t.is_sys,t.is_available,t.pkg_ready,b.brew_type_id,b.brew_no,b.brew_date,
b.brew_quantity,b.is_void,b.is_deleted,b.in_progress,p.brew_product_name
FROM (tblTank_List AS t LEFT JOIN tblBrew_Register AS b ON t.brew_register_id=b.brew_register_id)
LEFT JOIN tblBrew_Type AS p ON b.brew_type_id=p.brew_type_id ORDER BY t.tank_id
'@)
    $takeOff=@(Read-TakeOffSnapshot $db @'
SELECT p.take_off_plan_id,p.task_id,p.pkg_type_id,p.take_off_qty,p.offset_days,
p.is_processed,p.is_deleted,k.packaging_type,k.litre_capacity
FROM tblTake_Off_Plan AS p LEFT JOIN tblPackaging_Type_List AS k ON p.pkg_type_id=k.internal_id
ORDER BY p.take_off_plan_id
'@)
    $batches=@(Read-TakeOffSnapshot $db @"
SELECT b.brew_register_id,b.brew_type_id,b.brew_no,b.brew_date,b.brew_quantity,
b.is_void,b.is_deleted,p.brew_product_name
FROM tblBrew_Register AS b LEFT JOIN tblBrew_Type AS p ON b.brew_type_id=p.brew_type_id
WHERE b.brew_register_id IN (SELECT brew_register_id FROM tblTank_List WHERE brew_register_id>0)
OR b.brew_register_id IN (SELECT task_brew_register_id FROM tblTasks WHERE task_brew_register_id>0)
ORDER BY b.brew_register_id
"@)
    if(-not $tanks.Count){throw 'Empty tank inventory; retain previous snapshot and investigate'}
    [pscustomobject]@{source='viewplan';snapshot_at=$at;complete=$true;plans=$plans;tanks=$tanks;batches=$batches;source_take_off=$takeOff}
}

function Convert-ViewPlanTakeOffProjection($snapshot) {
    $rows=New-Object System.Collections.Generic.List[object]
    $batchIds=@{}
    foreach($b in $snapshot.batches){$batchIds[[string]$b.brew_register_id]=$b}
    foreach($p in $snapshot.plans){
        $deleted=$p.is_deleted -eq $true
        $complete=$p.task_complete -eq $true -or $p.task_closed -eq $true
        $link=if($p.task_brew_register_id -gt 0){'batch:'+ $p.task_brew_register_id}else{$null}
        if($link -and -not $batchIds.ContainsKey([string]$p.task_brew_register_id)){throw 'Linked batch missing from complete source read'}
        $phase=if($deleted){'cancelled'}elseif($complete){'unresolved'}else{'planned'}
        $sourceTakeOff=@($snapshot.source_take_off | Where-Object {$_.task_id -eq $p.task_id -and $_.is_deleted -ne $true})
        $rows.Add([pscustomobject]@{
            source_key='plan:'+ $p.task_id;kind='plan';source_product_id=[string]$p.brew_type_id
            product_name=$p.brew_product_name;source_link_key=$link
            brew_date=if($p.task_due_date){([string]$p.task_due_date).Substring(0,10)}else{$null}
            gyle=$p.parsed_plan.planned_gyle;phase=$phase;volume_litres=$p.parsed_plan.planned_litres
            vessels=@();source_take_off=$sourceTakeOff
        })
    }
    foreach($b in $snapshot.batches){
        $tanks=@($snapshot.tanks | Where-Object {$_.brew_register_id -eq $b.brew_register_id -and $_.is_sys -ne $true -and $_.is_available -eq $true})
        $vessels=@($tanks | ForEach-Object {[pscustomobject]@{source_id=[string]$_.tank_id;label=$_.tank_label_text;litres=$_.current_level;staging=($_.tank_id -eq 1)}})
        # Tank 1 is the user-confirmed staging vessel, never classify by label text.
        $physical=@($tanks | Where-Object {$_.tank_id -ne 1})
        $phase=if($b.is_void -eq $true -or $b.is_deleted -eq $true){'cancelled'}elseif($physical.Count){'in_tank'}elseif($tanks.Count){'staging'}else{'finished'}
        $volume=$null
        if($tanks.Count -and -not @($tanks | Where-Object {$null -eq $_.current_level}).Count){
            $volume=[decimal]0;foreach($t in $tanks){$volume += [decimal]$t.current_level}
        }
        $rows.Add([pscustomobject]@{
            source_key='batch:'+ $b.brew_register_id;kind='batch';source_product_id=[string]$b.brew_type_id
            product_name=$b.brew_product_name;source_link_key=$null
            brew_date=if($b.brew_date){([string]$b.brew_date).Substring(0,10)}else{$null}
            gyle=[string]$b.brew_no;phase=$phase;volume_litres=$volume;vessels=$vessels;source_take_off=@()
        })
    }
    return $rows.ToArray()
}

function Get-TakeOffHttpDiagnostic($record) {
    $parts=New-Object System.Collections.Generic.List[string]
    try { if($record.Exception.Response.StatusCode){$parts.Add('HTTP '+[int]$record.Exception.Response.StatusCode)} } catch {}
    $raw=$null
    try {$raw=$record.ErrorDetails.Message} catch {}
    if(-not $raw) {
        try {
            $stream=$record.Exception.Response.GetResponseStream()
            if($stream){$reader=New-Object IO.StreamReader($stream);try{$raw=$reader.ReadToEnd()}finally{$reader.Dispose()}}
        } catch {}
    }
    try {
        $errorBody=$raw | ConvertFrom-Json
        if([string]$errorBody.code -match '^[A-Z0-9]{5,12}$'){$parts.Add('database code '+$errorBody.code)}
        $allowed=@('Invalid or outdated snapshot','Incomplete snapshot','Duplicate source identity','Malformed source row','Invalid source key','Conflicting or unresolved source lineage')
        if([string]$errorBody.message -in $allowed){$parts.Add([string]$errorBody.message)}
        # Do not echo arbitrary response bodies, failing row contents or connection details.
    } catch {}
    if(-not $parts.Count){return 'No structured HTTP/database error available'}
    return $parts -join '; '
}
function Assert-TakeOffProjection($rows) {
    $seen=@{};$issues=New-Object System.Collections.Generic.List[string]
    foreach($r in $rows){
        $key=[string]$r.source_key
        if($key -notmatch '^(plan|batch):[1-9][0-9]*$'){$issues.Add('invalid source identity');continue}
        if($seen.ContainsKey($key)){$issues.Add($key+': duplicate identity')}
        $seen[$key]=$r
        if([string]::IsNullOrWhiteSpace([string]$r.product_name)){$issues.Add($key+': missing product name')}
        if([string]::IsNullOrWhiteSpace([string]$r.source_product_id)){$issues.Add($key+': missing product identity')}
        if($null -ne $r.volume_litres -and $r.volume_litres -lt 0){$issues.Add($key+': negative source volume')}
    }
    foreach($r in $rows){
        if($r.source_link_key){
            $target=$seen[[string]$r.source_link_key]
            if(-not $target){$issues.Add($r.source_key+': linked batch absent')}
            # Product conflicts are retained and quarantined by the database.
        }
    }
    if($issues.Count){throw ('Projection validation: '+$issues.Count+' issue(s). '+(($issues | Select-Object -First 10) -join '; ')+'. Export the projection for review.')}
}
