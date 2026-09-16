$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'viewplan-orders-source.ps1')
function Mock-RestEmpty {return ,@()}
$legacy=@(Mock-RestEmpty)
if($legacy.Count -ne 1){throw 'Fixture did not reproduce wrapped empty REST response'}
$response=Mock-RestEmpty
$ids=@(Get-FulfilmentTrackedIds -Response $response)
if($ids.Count -ne 0){throw 'Empty page became a tracked ID'}
foreach($json in @('[{"source_id":42}]','[{"source_id":42},{"source_id":43}]')){
 # Invoke-RestMethod returns the JSON root array without pipeline enumeration.
 $response=ConvertFrom-Json $json
 $ids=@(Get-FulfilmentTrackedIds -Response @($response))
 if($ids[0] -ne 42 -or $ids.Count -lt 1){throw 'Valid IDs lost'}
}
foreach($bad in @(@{source_id=0},@{source_id=$null},@{source_id='bad'},@{source_id=1.5},@{source_id='9223372036854775808'})){
 $failed=$false;try{Get-FulfilmentTrackedIds -Response @($bad)|Out-Null}catch{$failed=$true}
 if(-not $failed){throw 'Invalid ID accepted'}
}
$failed=$false;try{Get-FulfilmentTrackedIds -Response @{message='failed'}|Out-Null}catch{$failed=$true}
if(-not $failed){throw 'Error envelope accepted'}
Write-Host 'Order pagination passed: empty first run, singleton/multiple pages, malformed envelopes and invalid IDs.'
