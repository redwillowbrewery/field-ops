param(
    [string]$SupabaseUrl = $env:NEXT_PUBLIC_SUPABASE_URL,
    [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Run-Step([string]$label,[string]$scriptName) {
    Write-Host ""
    Write-Host "--- $label ---"
    $path = Join-Path $scriptRoot $scriptName
    if (-not (Test-Path $path)) { throw "Product sync step not found: $path" }
    & $path -SupabaseUrl $SupabaseUrl -ServiceRoleKey $ServiceRoleKey
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "$label exited with code $LASTEXITCODE" }
}

Write-Host "Brewery Ops - ViewPlan product reconciliation"
Write-Host "---------------------------------------------"
Write-Host "ViewPlan: READ ONLY"
Write-Host "Includes: canonical catalogue + Sellar variant mappings"

Run-Step "Canonical products / variants / price lists" "viewplan-price-sync.ps1"
Run-Step "Sellar / ViewPlan variant mappings" "viewplan-sellar-map-sync.ps1"

Write-Host ""
Write-Host "ViewPlan product reconciliation complete."
