param(
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"
if (-not $SupabaseUrl) { throw "NEXT_PUBLIC_SUPABASE_URL is not set." }
if (-not $ServiceRoleKey) { throw "SUPABASE_SERVICE_ROLE_KEY is not set." }

$baseUrl=$SupabaseUrl.TrimEnd('/')
$headers=@{apikey=$ServiceRoleKey;"Content-Type"="application/json; charset=utf-8"}
$userAgent="RedWillow-ViewPlan-Package-Pricing/1.0"
function Req([string]$method,[string]$path,$body=$null,[string]$prefer=$null){$h=@{}+$headers;if($prefer){$h.Prefer=$prefer};$a=@{Method=$method;Uri="$baseUrl/rest/v1/$path";Headers=$h;UserAgent=$userAgent};if($null-ne$body){$j=ConvertTo-Json -InputObject $body -Depth 8 -Compress;$a.Body=[Text.Encoding]::UTF8.GetBytes($j);$a.ContentType="application/json; charset=utf-8"};try{return Invoke-RestMethod @a}catch{$parts=@();if($_.Exception.Message){$parts+=$_.Exception.Message};if($_.ErrorDetails.Message){$parts+=$_.ErrorDetails.Message};try{if($_.Exception.Response){$s=$_.Exception.Response.GetResponseStream();$r=New-Object IO.StreamReader($s);$b=$r.ReadToEnd();if($b){$parts+=$b}}}catch{};throw "Supabase $method $path failed:`n$(($parts|Select-Object -Unique)-join "`n")"}}
function Get([string]$p){return Req "Get" $p}
function Post([string]$p,$b,[string]$prefer="return=minimal"){return Req "Post" $p $b $prefer}
function Enc([string]$v){return [uri]::EscapeDataString($v)}
function FirstGuid($rows,[string]$field){foreach($row in @($rows)){if($null-ne$row){$raw=[string]$row.$field;$g=[Guid]::Empty;if([Guid]::TryParse($raw,[ref]$g)){return $g.ToString()}}};return $null}

Write-Host "Brewery Ops - materialise ViewPlan package pricing rules"
Write-Host "------------------------------------------------------"

$rules=@()
for($from=0;;$from+=1000){$page=@(Get "account_package_pricing_rules?source_system=eq.viewplan&select=account_id,package_type,fixed_price,formula,apply_line_discount&offset=$from&limit=1000");$rules+=$page;if($page.Count-lt1000){break}}
Write-Host "Package rules: $($rules.Count)"

$written=0;$skippedExact=0;$unmatchedPackage=0
foreach($rule in $rules){
    $pkg=Enc ([string]$rule.package_type)
    $variants=@()
    for($from=0;;$from+=1000){$page=@(Get "product_variants?package_type=eq.$pkg&allow_sale=eq.true&select=id&offset=$from&limit=1000");$variants+=$page;if($page.Count-lt1000){break}}
    if($variants.Count-eq0){$unmatchedPackage++;continue}
    foreach($variant in $variants){
        $variantId=FirstGuid @($variant) "id";if(-not$variantId){continue}
        $existing=@(Get "account_price_overrides?account_id=eq.$($rule.account_id)&product_variant_id=eq.$variantId&source_system=eq.viewplan&select=product_variant_id")
        if($existing.Count-gt0){$skippedExact++;continue}
        Post "account_price_overrides?on_conflict=account_id%2Cproduct_variant_id" @{
            account_id=[string]$rule.account_id;product_variant_id=$variantId;fixed_price=$rule.fixed_price;formula=$rule.formula;apply_line_discount=[bool]$rule.apply_line_discount;source_system="viewplan:package_rule";source_updated_at=[DateTime]::UtcNow.ToString("o");updated_at=[DateTime]::UtcNow.ToString("o")
        } "resolution=merge-duplicates,return=minimal"|Out-Null
        $written++
    }
}

Write-Host "Materialised package overrides: $written"
Write-Host "Exact overrides preserved:      $skippedExact"
Write-Host "Rules with no saleable package: $unmatchedPackage"
