$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'viewplan-account-commercial-source.ps1')
if ((Convert-ViewPlanAllowedToBlocked $true) -ne $false) { throw 'Allowed must not be blocked' }
if ((Convert-ViewPlanAllowedToBlocked $false) -ne $true) { throw 'Disallowed must be blocked' }
if ($null -ne (Convert-ViewPlanAllowedToBlocked ([DBNull]::Value))) { throw 'Null must remain unknown' }
if ((Convert-ViewPlanAllowedToBlocked (-1)) -ne $false) { throw 'DAO true must remain allowed' }
if ((Convert-ViewPlanAllowedToBlocked 0) -ne $true) { throw 'DAO false must remain blocked' }
$rejected = $false
try { Convert-ViewPlanAllowedToBlocked 'false' | Out-Null } catch { $rejected = $true }
if (-not $rejected) { throw 'Unexpected permission type must abort' }
Write-Output 'ViewPlan permission translation checks passed.'
