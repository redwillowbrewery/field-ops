param([string]$Scenario,[string]$Fixture,[string]$RunModule='take-off')
$ErrorActionPreference='Stop'
if($Scenario){
    # All network calls are mocked in this child process; no production environment is read.
    $env:NEXT_PUBLIC_SUPABASE_URL='https://example.invalid'
    $env:SUPABASE_SERVICE_ROLE_KEY='FAKE_TEST_SECRET_NEVER_LOG'
    if($Scenario -eq 'missing-credentials'){$env:SUPABASE_SERVICE_ROLE_KEY=$null}
    function Invoke-RestMethod {
        param($Method,$Uri,$Headers,$ContentType,$Body,$TimeoutSec,$UserAgent)
        if($UserAgent -ne 'RedWillow-BreweryOps-ViewPlan-Connector/1.2'){throw 'Missing service User-Agent'}
        if(-not $Uri.StartsWith('https://example.invalid/')){throw 'Unexpected network target'}
        $state=[Text.Encoding]::UTF8.GetString($Body)|ConvertFrom-Json
        $state|ConvertTo-Json -Compress|Add-Content -LiteralPath (Join-Path $Fixture 'remote.jsonl')
        if($Scenario -eq 'reporting-failure' -and $state.status -eq 'completed'){throw 'Mocked reporting failure'}
    }
    & (Join-Path $Fixture 'viewplan-connector.ps1') -Module $RunModule -Scheduled
    exit 0
}
$repository=Split-Path -Parent $PSScriptRoot
$x86=Join-Path $env:WINDIR 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
foreach($case in @('success','missing-credentials','module-failure','reporting-failure','all-success','all-sales-failure')){
    $directory=Join-Path ([IO.Path]::GetTempPath()) ('brewery-connector-test-'+[Guid]::NewGuid())
    New-Item -ItemType Directory -Path $directory|Out-Null
    Copy-Item -LiteralPath (Join-Path $repository 'scripts\viewplan-connector.ps1') -Destination $directory
    $module=if($case -eq 'module-failure'){ "throw 'Mocked ViewPlan session failure'" }else{ "Write-Host 'Mocked Take Off complete'" }
    Set-Content -LiteralPath (Join-Path $directory 'viewplan-take-off-sync.ps1') -Value $module
    Set-Content -LiteralPath (Join-Path $directory 'viewplan-connector-customers.ps1') -Value "param([switch]`$Full)"
    Set-Content -LiteralPath (Join-Path $directory 'viewplan-connector-reconcile.ps1') -Value 'param($ModuleName,$ScriptName)'
    $sales=if($case -eq 'all-sales-failure'){"throw 'Mocked sales failure'"}else{"Write-Host 'Mocked sales complete'"}
    Set-Content -LiteralPath (Join-Path $directory 'viewplan-sales-sync.ps1') -Value $sales
    $selected=if($case -like 'all-*'){'all'}else{'take-off'}
    & $x86 -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $PSCommandPath -Scenario $case -Fixture $directory -RunModule $selected *> (Join-Path $directory 'console.log')
    $exitCode=$LASTEXITCODE
    $successful=$case -in @('success','all-success')
    if(($successful -and $exitCode -ne 0) -or (-not $successful -and $exitCode -eq 0)){throw "Incorrect exit code for $case"}
    $logs=@(Get-ChildItem -LiteralPath (Join-Path $directory 'connector-run-logs') -Filter '*.jsonl')
    if($logs.Count -ne 1){throw 'Expected one durable run log'}
    $raw=Get-Content -LiteralPath $logs[0].FullName -Raw
    if($raw.Contains('FAKE_TEST_SECRET')){throw 'Secret leaked into log'}
    $events=@(Get-Content -LiteralPath $logs[0].FullName|ForEach-Object{$_|ConvertFrom-Json})
    $expected=if($successful){'completed'}else{'failed'}
    if($events[-1].event -ne $expected){throw "Wrong final local state for $case"}
    if(@($events.run_id|Select-Object -Unique).Count -ne 1){throw 'Run identity changed'}
    if($events[0].invocation -ne 'scheduled'){throw 'Scheduled invocation missing'}
    if($case -eq 'module-failure' -and $events[-1].stage -ne 'Take Off Planning'){throw 'Failure stage lost'}
    if($case -eq 'all-sales-failure' -and $events[-1].stage -ne 'Account sales history'){throw 'Sales failure stage lost'}
    if($case -eq 'all-success'){
        $stages=@($events|Where-Object event -eq 'module_started'|ForEach-Object stage)
        $required=@('Customers','Products / variants / price lists / Sellar mappings','Customer pricing','Account sales history','Returnable containers','Take Off Planning')
        if(($stages -join '|') -ne ($required -join '|')){throw 'Nightly module order changed or sales missing'}
    }
    if($case -eq 'all-sales-failure' -and @($events|Where-Object {$_.stage -eq 'Returnable containers'}).Count){throw 'Runner continued after sales failure'}
    Write-Host "Connector runner $case passed."
}

# Expected child failures must not become the CI step's final native exit code.
# This is reached only after every scenario and assertion has passed.
$global:LASTEXITCODE = 0
