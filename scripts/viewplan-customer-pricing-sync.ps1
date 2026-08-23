param(
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"
if (-not $SupabaseUrl) { throw "NEXT_PUBLIC_SUPABASE_URL is not set." }
if (-not $ServiceRoleKey) { throw "SUPABASE_SERVICE_ROLE_KEY is not set." }

$baseUrl = $SupabaseUrl.TrimEnd('/')
$userAgent = "RedWillow-ViewPlan-Customer-Pricing-Sync/1.1"
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
Write-Host "Pricing: exact product overrides + (all) package rules"

try{$access=[Runtime.InteropServices.Marshal]::GetActiveObject("Access.Application")}catch{throw "Open and log into ViewPlan first, then run this script from 32-bit PowerShell."}
$db=$access.CurrentDb();$syncTime=[DateTime]::UtcNow.ToString("o")

$priceLists=@{}
for($n=1;$n-le10;$n++){$pl=@(Invoke-SupaGet "price_lists?source_system=eq.viewplan&source_external_id=eq.$n&select=id");$id=FirstGuid $pl "id";if(-not$id){throw "Wholesale price list $n is missing."};$priceLists[[string]$n]=$id}

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

$rs=$db.OpenRecordset(@"
SELECT cp.customer_id,cp.brew_type_id,bt.brew_product_name,cp.packaging_type,cp.price,cp.use_formula,cp.price_formula,cp.apply_line_discount
FROM tblCustomer_Prices AS cp
LEFT JOIN tblBrew_Type AS bt ON cp.brew_type_id=bt.brew_type_id
WHERE cp.is_available=True
ORDER BY cp.customer_id,cp.brew_type_id,cp.packaging_type
"@)
$overrideCount=0;$packageRuleCount=0;$overrideSkipped=0;$overrideIndex=0
while(-not$rs.EOF){
    $overrideIndex++
    $customerId=[string](DbValue $rs "customer_id");$accountId=$accountByVp[$customerId]
    if($accountId){
        $brew=[string](DbValue $rs "brew_type_id");$brewName=[string](DbValue $rs "brew_product_name");$pkg=[string](DbValue $rs "packaging_type")
        $useFormula=[bool](DbValue $rs "use_formula");$fixed=if($useFormula){$null}else{DbValue $rs "price"};$formula=if($useFormula){[string](DbValue $rs "price_formula")}else{$null};$apply=[bool](DbValue $rs "apply_line_discount")

        if($brewName.Trim().ToLowerInvariant()-eq"(all)"){
            Invoke-SupaPost "account_package_pricing_rules?on_conflict=account_id%2Cpackage_type" @{
                account_id=$accountId;package_type=$pkg;fixed_price=$fixed;formula=$formula;apply_line_discount=$apply;source_system="viewplan";source_updated_at=$syncTime;updated_at=$syncTime
            } "resolution=merge-duplicates,return=minimal"|Out-Null
            $packageRuleCount++
        }else{
            $vpKey=UrlEncode "$brew|$pkg"
            $mapped=@(Invoke-SupaGet "product_variant_external_ids?system=eq.viewplan&external_id=eq.$vpKey&select=product_variant_id")
            $variantId=FirstGuid $mapped "product_variant_id"
            if($variantId){
                Invoke-SupaPost "account_price_overrides?on_conflict=account_id%2Cproduct_variant_id" @{
                    account_id=$accountId;product_variant_id=$variantId;fixed_price=$fixed;formula=$formula;apply_line_discount=$apply;source_system="viewplan";source_updated_at=$syncTime;updated_at=$syncTime
                } "resolution=merge-duplicates,return=minimal"|Out-Null
                $overrideCount++
            }else{$overrideSkipped++}
        }
    }else{$overrideSkipped++}
    if(($overrideIndex%500)-eq0){Write-Host "Pricing rules processed: $overrideIndex"}
    $rs.MoveNext()
}
$rs.Close()

Write-Host ""
Write-Host "ViewPlan customer pricing sync complete."
Write-Host "Accounts priced:       $pricingWritten"
Write-Host "Exact overrides synced:$overrideCount"
Write-Host "Package rules synced:  $packageRuleCount"
Write-Host "Overrides skipped:     $overrideSkipped"
