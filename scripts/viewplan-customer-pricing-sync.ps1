param(
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"
if (-not $SupabaseUrl) { throw "NEXT_PUBLIC_SUPABASE_URL is not set." }
if (-not $ServiceRoleKey) { throw "SUPABASE_SERVICE_ROLE_KEY is not set." }

$baseUrl = $SupabaseUrl.TrimEnd('/')
$userAgent = "RedWillow-ViewPlan-Customer-Pricing-Sync/1.0"
$headers = @{ apikey = $ServiceRoleKey; "Content-Type" = "application/json; charset=utf-8" }

function Invoke-SupaRequest([string]$method,[string]$path,$body=$null,[string]$prefer=$null){
    $h=@{}+$headers;if($prefer){$h["Prefer"]=$prefer}
    $args=@{Method=$method;Uri="$baseUrl/rest/v1/$path";Headers=$h;UserAgent=$userAgent}
    if($null-ne$body){$json=ConvertTo-Json -InputObject $body -Depth 8 -Compress;$args["Body"]=[Text.Encoding]::UTF8.GetBytes($json);$args["ContentType"]="application/json; charset=utf-8"}
    try{return Invoke-RestMethod @args}catch{
        $parts=@();if($_.Exception.Message){$parts+=$_.Exception.Message};if($_.ErrorDetails-and$_.ErrorDetails.Message){$parts+=$_.ErrorDetails.Message}
        try{if($_.Exception.Response){$s=$_.Exception.Response.GetResponseStream();if($s){$r=New-Object IO.StreamReader($s);$b=$r.ReadToEnd();if($b){$parts+=$b}}}}catch{}
        throw "Supabase $method $path failed:`n$(($parts|Select-Object -Unique)-join "`n")"
    }
}
function Invoke-SupaGet([string]$path){return Invoke-SupaRequest "Get" $path}
function Invoke-SupaPost([string]$path,$body,[string]$prefer="return=minimal"){return Invoke-SupaRequest "Post" $path $body $prefer}
function UrlEncode([string]$v){return [uri]::EscapeDataString($v)}
function DbValue($rs,[string]$name){$v=$rs.Fields.Item($name).Value;if($null-eq$v-or$v-is[DBNull]){return $null};return $v}
function FirstGuid($rows,[string]$field){foreach($row in @($rows)){if($null-ne$row){$raw=[string]$row.$field;$g=[Guid]::Empty;if([Guid]::TryParse($raw,[ref]$g)){return $g.ToString()}}};return $null}

Write-Host "Field Ops - ViewPlan customer pricing sync"
Write-Host "------------------------------------------"
Write-Host "ViewPlan: READ ONLY"
Write-Host "Accounts: exact-name match only"

try{$access=[Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application")}catch{throw "Open and log into ViewPlan first, then run this script from 32-bit PowerShell."}
$db=$access.CurrentDb();$syncTime=[DateTime]::UtcNow.ToString("o")

# Price-list UUIDs.
$priceLists=@{}
for($n=1;$n-le10;$n++){$pl=@(Invoke-SupaGet "price_lists?source_system=eq.viewplan&source_external_id=eq.$n&select=id");$id=FirstGuid $pl "id";if(-not$id){throw "Wholesale price list $n is missing."};$priceLists[[string]$n]=$id}

# Read active ViewPlan customers and resolve canonical accounts by exact name.
$rs=$db.OpenRecordset(@"
SELECT customer_id,customer_name,discount,wholesale_price_no,use_parent_pricing,parent_customer_id,discount_application,lud
FROM tblCustomer
WHERE is_available=True
ORDER BY customer_id
"@)
$customers=@();while(-not$rs.EOF){$customers+=[PSCustomObject]@{customer_id=[string](DbValue $rs "customer_id");name=[string](DbValue $rs "customer_name");discount=DbValue $rs "discount";price_no=DbValue $rs "wholesale_price_no";use_parent=[bool](DbValue $rs "use_parent_pricing");parent_id=DbValue $rs "parent_customer_id";discount_application=DbValue $rs "discount_application";lud=DbValue $rs "lud"};$rs.MoveNext()};$rs.Close()

$accountByVp=@{};$matched=0;$unmatched=0;$index=0
foreach($c in $customers){
    $index++;$name=UrlEncode $c.name
    $found=@(Invoke-SupaGet "accounts?name=eq.$name&select=id,name")
    $accountId=FirstGuid $found "id"
    if(-not$accountId){$unmatched++;continue}
    $matched++;$accountByVp[$c.customer_id]=$accountId
    Invoke-SupaPost "account_external_ids?on_conflict=system%2Cexternal_id" @{account_id=$accountId;system="viewplan";external_id=$c.customer_id} "resolution=merge-duplicates,return=minimal"|Out-Null
    if(($index%250)-eq0){Write-Host "Customers matched: $index/$($customers.Count)"}
}
Write-Host "Matched customers:   $matched"
Write-Host "Unmatched customers: $unmatched"

# Write account pricing in a second pass so parent mappings are available.
$pricingWritten=0
foreach($c in $customers){
    $accountId=$accountByVp[$c.customer_id];if(-not$accountId){continue}
    $priceNo=if($c.price_no){[int]$c.price_no}else{1};if($priceNo-lt1-or$priceNo-gt10){$priceNo=1}
    $parentAccountId=$null;if($c.use_parent-and$c.parent_id){$parentAccountId=$accountByVp[[string]$c.parent_id]}
    $sourceUpdated=if($c.lud){([DateTime]$c.lud).ToUniversalTime().ToString("o")}else{$syncTime}
    Invoke-SupaPost "account_pricing?on_conflict=account_id" @{
        account_id=$accountId;price_list_id=$priceLists[[string]$priceNo];discount=if($null-ne$c.discount){[decimal]$c.discount}else{0};discount_application=$c.discount_application;parent_pricing_account_id=$parentAccountId;source_system="viewplan";source_updated_at=$sourceUpdated;updated_at=$syncTime
    } "resolution=merge-duplicates,return=minimal"|Out-Null
    $pricingWritten++
}
Write-Host "Account pricing rows: $pricingWritten"

# Customer-specific fixed/formula prices. Only sync rows whose customer and canonical ViewPlan variant are both mapped.
$rs=$db.OpenRecordset(@"
SELECT customer_id,brew_type_id,packaging_type,price,is_available,use_formula,price_formula,apply_line_discount
FROM tblCustomer_Prices
WHERE is_available=True
ORDER BY customer_id,brew_type_id,packaging_type
"@)
$overrideCount=0;$overrideSkipped=0;$overrideIndex=0
while(-not$rs.EOF){
    $overrideIndex++
    $customerId=[string](DbValue $rs "customer_id");$accountId=$accountByVp[$customerId]
    if($accountId){
        $brew=[string](DbValue $rs "brew_type_id");$pkg=[string](DbValue $rs "packaging_type");$vpKey=UrlEncode "$brew|$pkg"
        $mapped=@(Invoke-SupaGet "product_variant_external_ids?system=eq.viewplan&external_id=eq.$vpKey&select=product_variant_id")
        $variantId=FirstGuid $mapped "product_variant_id"
        if($variantId){
            $useFormula=[bool](DbValue $rs "use_formula");$fixed=if($useFormula){$null}else{DbValue $rs "price"};$formula=if($useFormula){[string](DbValue $rs "price_formula")}else{$null}
            Invoke-SupaPost "account_price_overrides?on_conflict=account_id%2Cproduct_variant_id" @{
                account_id=$accountId;product_variant_id=$variantId;fixed_price=$fixed;formula=$formula;apply_line_discount=[bool](DbValue $rs "apply_line_discount");source_system="viewplan";source_updated_at=$syncTime;updated_at=$syncTime
            } "resolution=merge-duplicates,return=minimal"|Out-Null
            $overrideCount++
        }else{$overrideSkipped++}
    }else{$overrideSkipped++}
    if(($overrideIndex%500)-eq0){Write-Host "Overrides processed: $overrideIndex"}
    $rs.MoveNext()
}
$rs.Close()

Write-Host ""
Write-Host "ViewPlan customer pricing sync complete."
Write-Host "Accounts priced:      $pricingWritten"
Write-Host "Overrides synced:     $overrideCount"
Write-Host "Overrides skipped:    $overrideSkipped"
