param(
    [ValidateSet("all","customers","products","pricing")]
    [string]$Module = "all",
    [switch]$Full
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Run-Module([string]$name,[string]$script,[string[]]$arguments=@()) {
    Write-Host ""
    Write-Host "=== $name ==="
    $path = Join-Path $scriptRoot $script
    if (-not (Test-Path $path)) { throw "Connector module script not found: $path" }
    & $path @arguments
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "$name module exited with code $LASTEXITCODE" }
}

Write-Host "Brewery Ops - ViewPlan connector runner"
Write-Host "--------------------------------------"
Write-Host "Requested module: $Module"

if ($Module -eq "all" -or $Module -eq "customers") {
    $args = @()
    if ($Full) { $args += "-Full" }
    Run-Module "Customers" "viewplan-connector-customers.ps1" $args
}

if ($Module -eq "all" -or $Module -eq "products") {
    Run-Module "Products / variants / price lists" "viewplan-connector-reconcile.ps1" @("-ModuleName","products","-ScriptName","viewplan-price-sync.ps1")
}

if ($Module -eq "all" -or $Module -eq "pricing") {
    Run-Module "Customer pricing" "viewplan-connector-reconcile.ps1" @("-ModuleName","pricing","-ScriptName","viewplan-customer-pricing-sync.ps1")
}

Write-Host ""
Write-Host "ViewPlan connector runner complete."
