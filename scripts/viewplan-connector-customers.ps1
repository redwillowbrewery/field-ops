param(
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY,
    [switch]$Full,
    [int]$BatchSize = 100,
    [int]$OverlapMinutes = 5
)

$ErrorActionPreference = "Stop"
if (-not $SupabaseUrl) { throw "NEXT_PUBLIC_SUPABASE_URL is not set." }
if (-not $ServiceRoleKey) { throw "SUPABASE_SERVICE_ROLE_KEY is not set." }
if ($BatchSize -lt 1 -or $BatchSize -gt 500) { throw "BatchSize must be between 1 and 500." }

$baseUrl = $SupabaseUrl.TrimEnd('/')
$userAgent = "RedWillow-BreweryOps-ViewPlan-Connector/1.0"
$headers = @{ apikey = $ServiceRoleKey; "Content-Type" = "application/json; charset=utf-8" }
$sourceSystem = "viewplan"
$module = "customers"
$startedAt = [DateTime]::UtcNow

function Invoke-SupaRequest([string]$method,[string]$path,$body=$null,[string]$prefer=$null){
    $h=@{}+$headers
    if($prefer){$h["Prefer"]=$prefer}
    $args=@{Method=$method;Uri="$baseUrl/rest/v1/$path";Headers=$h;UserAgent=$userAgent}
    if($null-ne$body){
        $json=ConvertTo-Json -InputObject $body -Depth 12 -Compress
        $args["Body"]=[Text.Encoding]::UTF8.GetBytes($json)
        $args["ContentType"]="application/json; charset=utf-8"
    }
    try{return Invoke-RestMethod @args}catch{
        $parts=@()
        if($_.Exception.Message){$parts+=$_.Exception.Message}
        if($_.ErrorDetails-and$_.ErrorDetails.Message){$parts+=$_.ErrorDetails.Message}
        try{if($_.Exception.Response){$s=$_.Exception.Response.GetResponseStream();if($s){$r=New-Object IO.StreamReader($s);$b=$r.ReadToEnd();if($b){$parts+=$b}}}}catch{}
        throw "Supabase $method $path failed:`n$(($parts|Select-Object -Unique)-join "`n")"
    }
}
function Invoke-SupaGet([string]$path){return Invoke-SupaRequest "Get" $path}
function Invoke-SupaPost([string]$path,$body,[string]$prefer="return=minimal"){return Invoke-SupaRequest "Post" $path $body $prefer}
function Invoke-SupaPatch([string]$path,$body,[string]$prefer="return=minimal"){return Invoke-SupaRequest "Patch" $path $body $prefer}
function DbValue($rs,[string]$name){$v=$rs.Fields.Item($name).Value;if($null-eq$v-or$v-is[DBNull]){return $null};return $v}
function TextValue($v){if($null-eq$v){return $null};$s=[string]$v;$s=$s.Trim();if(-not$s){return $null};return $s}
function IsoDate($v){if($null-eq$v){return $null};return ([DateTime]$v).ToString("yyyy-MM-dd")}
function IsoDateTime($v){if($null-eq$v){return $null};return ([DateTime]$v).ToUniversalTime().ToString("o")}
function BoolValue($v){if($null-eq$v){return $false};return [bool]$v}
function SqlAccessDate([DateTime]$v){return $v.ToString("yyyy-MM-dd HH:mm:ss")}

Write-Host "Brewery Ops - ViewPlan connector"
Write-Host "--------------------------------"
Write-Host "Module:   customers"
Write-Host "ViewPlan: READ ONLY"
Write-Host "Mode:     $(if($Full){'FULL'}else{'INCREMENTAL'})"

try{$access=[Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application")}catch{
    throw "Open and log into ViewPlan first, then run this script from 32-bit PowerShell in the same Windows session."
}
$db=$access.CurrentDb()

$stateRows=@(Invoke-SupaGet "connector_sync_state?source_system=eq.viewplan&module=eq.customers&select=last_source_lud,last_success_at,last_full_sync_at")
$lastLud=$null
if($stateRows.Count-gt0-and$stateRows[0].last_source_lud){$lastLud=[DateTime]$stateRows[0].last_source_lud}

$mode=if($Full-or$null-eq$lastLud){"full"}else{"incremental"}
$fromLud=$null
if($mode-eq"incremental"){$fromLud=$lastLud.AddMinutes(-1*[Math]::Abs($OverlapMinutes))}

$run=@(Invoke-SupaPost "connector_sync_runs" @{
    source_system=$sourceSystem;module=$module;mode=$mode;status="running";source_from_lud=if($fromLud){$fromLud.ToString("o")}else{$null};started_at=$startedAt.ToString("o")
} "return=representation")
$runId=if($run.Count){[string]$run[0].id}else{$null}

try {
    $where=""
    if($fromLud){$where="WHERE lud > #$(SqlAccessDate $fromLud)#"}

    $sql=@"
SELECT
 customer_id,customer_name,customer_ref_no,external_ref_no,customer_class,
 customer_address_line1,customer_address_line2,customer_address_town,customer_address_county,customer_address_postcode,
 customer_tel_no,customer_contact,customer_contact_email,customer_contact_tel_no,
 customer_contact2,customer_contact2_email,customer_contact2_tel_no,
 customer_contact3,customer_contact3_email,customer_contact3_tel_no,
 customer_contact4,customer_contact4_email,customer_contact4_tel_no,
 customer_contact5,customer_contact5_email,customer_contact5_tel_no,
 customer_website_url,preferred_contact_method,do_not_call,do_not_email,sales_channel,
 last_call_date,next_call_date,call_days,call_time,call_schedule,is_available,is_prospect,lud
FROM tblCustomer
$where
ORDER BY customer_id
"@

    $rs=$db.OpenRecordset($sql)
    $rows=New-Object System.Collections.Generic.List[object]
    $maxSourceLud=$lastLud
    while(-not$rs.EOF){
        $lud=DbValue $rs "lud"
        if($lud){$d=[DateTime]$lud;if($null-eq$maxSourceLud-or$d-gt$maxSourceLud){$maxSourceLud=$d}}

        $contacts=New-Object System.Collections.Generic.List[object]
        $contactDefs=@(
            @{slot=1;name="customer_contact";email="customer_contact_email";phone="customer_contact_tel_no";primary=$true},
            @{slot=2;name="customer_contact2";email="customer_contact2_email";phone="customer_contact2_tel_no";primary=$false},
            @{slot=3;name="customer_contact3";email="customer_contact3_email";phone="customer_contact3_tel_no";primary=$false},
            @{slot=4;name="customer_contact4";email="customer_contact4_email";phone="customer_contact4_tel_no";primary=$false},
            @{slot=5;name="customer_contact5";email="customer_contact5_email";phone="customer_contact5_tel_no";primary=$false}
        )
        foreach($c in $contactDefs){
            $cn=TextValue (DbValue $rs $c.name);$ce=TextValue (DbValue $rs $c.email);$cp=TextValue (DbValue $rs $c.phone)
            if($cn-or$ce-or$cp){$contacts.Add([PSCustomObject]@{slot=$c.slot;full_name=$cn;email=$ce;phone=$cp;is_primary=$c.primary})}
        }

        $rows.Add([PSCustomObject]@{
            customer_id=[int](DbValue $rs "customer_id")
            name=TextValue (DbValue $rs "customer_name")
            customer_ref=TextValue (DbValue $rs "customer_ref_no")
            external_ref=TextValue (DbValue $rs "external_ref_no")
            classification=TextValue (DbValue $rs "customer_class")
            address_line_1=TextValue (DbValue $rs "customer_address_line1")
            address_line_2=TextValue (DbValue $rs "customer_address_line2")
            town=TextValue (DbValue $rs "customer_address_town")
            county=TextValue (DbValue $rs "customer_address_county")
            postcode=TextValue (DbValue $rs "customer_address_postcode")
            phone=TextValue (DbValue $rs "customer_tel_no")
            email=TextValue (DbValue $rs "customer_contact_email")
            website=TextValue (DbValue $rs "customer_website_url")
            preferred_contact_method=TextValue (DbValue $rs "preferred_contact_method")
            do_not_call=BoolValue (DbValue $rs "do_not_call")
            do_not_email=BoolValue (DbValue $rs "do_not_email")
            sales_channel=TextValue (DbValue $rs "sales_channel")
            last_call_date=IsoDate (DbValue $rs "last_call_date")
            next_call_date=IsoDate (DbValue $rs "next_call_date")
            call_days=TextValue (DbValue $rs "call_days")
            call_time=TextValue (DbValue $rs "call_time")
            call_schedule=TextValue (DbValue $rs "call_schedule")
            is_available=BoolValue (DbValue $rs "is_available")
            is_prospect=BoolValue (DbValue $rs "is_prospect")
            lud=IsoDateTime $lud
            contacts=@($contacts)
        })
        $rs.MoveNext()
    }
    $rs.Close()

    Write-Host "ViewPlan rows read: $($rows.Count)"
    if($fromLud){Write-Host "Changes since:       $($fromLud.ToString('u')) (includes overlap)"}

    $written=0
    for($i=0;$i-lt$rows.Count;$i+=$BatchSize){
        $end=[Math]::Min($i+$BatchSize-1,$rows.Count-1)
        $batch=@($rows[$i..$end])
        $result=@(Invoke-SupaPost "rpc/sync_viewplan_customers" @{payload=$batch} "return=representation")
        if($result.Count-and$result[0].rows_written){$written+=[int]$result[0].rows_written}else{$written+=$batch.Count}
        Write-Host "Synced: $([Math]::Min($end+1,$rows.Count))/$($rows.Count)"
    }

    $completedAt=[DateTime]::UtcNow
    $stateBody=@{
        source_system=$sourceSystem;module=$module
        last_source_lud=if($maxSourceLud){$maxSourceLud.ToUniversalTime().ToString("o")}else{if($lastLud){$lastLud.ToUniversalTime().ToString("o")}else{$null}}
        last_success_at=$completedAt.ToString("o")
        last_full_sync_at=if($mode-eq"full"){$completedAt.ToString("o")}else{if($stateRows.Count){$stateRows[0].last_full_sync_at}else{$null}}
        last_row_count=$rows.Count;last_error=$null;updated_at=$completedAt.ToString("o")
    }
    Invoke-SupaPost "connector_sync_state?on_conflict=source_system%2Cmodule" $stateBody "resolution=merge-duplicates,return=minimal"|Out-Null
    if($runId){Invoke-SupaPatch "connector_sync_runs?id=eq.$runId" @{status="completed";source_to_lud=$stateBody.last_source_lud;rows_read=$rows.Count;rows_written=$written;completed_at=$completedAt.ToString("o")}|Out-Null}

    Write-Host ""
    Write-Host "Customer connector complete."
    Write-Host "Rows read:    $($rows.Count)"
    Write-Host "Rows written: $written"
    Write-Host "High-water:   $(if($maxSourceLud){$maxSourceLud.ToString('u')}else{'unchanged'})"
}
catch {
    $failedAt=[DateTime]::UtcNow
    $message=$_.Exception.Message
    try{Invoke-SupaPost "connector_sync_state?on_conflict=source_system%2Cmodule" @{source_system=$sourceSystem;module=$module;last_source_lud=if($lastLud){$lastLud.ToString("o")}else{$null};last_success_at=if($stateRows.Count){$stateRows[0].last_success_at}else{$null};last_full_sync_at=if($stateRows.Count){$stateRows[0].last_full_sync_at}else{$null};last_row_count=0;last_error=$message;updated_at=$failedAt.ToString("o")} "resolution=merge-duplicates,return=minimal"|Out-Null}catch{}
    try{if($runId){Invoke-SupaPatch "connector_sync_runs?id=eq.$runId" @{status="failed";notes=$message;completed_at=$failedAt.ToString("o")}|Out-Null}}catch{}
    throw
}
