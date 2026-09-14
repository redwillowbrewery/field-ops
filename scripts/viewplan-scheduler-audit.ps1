param(
    [string]$TaskName,
    [string]$ConnectorDirectory = 'C:\ViewPlan\BMS\Scripts',
    [string]$OutputPath = (Join-Path $PSScriptRoot 'viewplan-scheduler-audit.json'),
    [switch]$AccessProbeOnly
)
# Read-only diagnosis: no task changes, connector execution, source writes or secret values.
$ErrorActionPreference = 'Stop'
if ($AccessProbeOnly) {
    $probe = [ordered]@{ bitness = [IntPtr]::Size * 8; attached = $false; current_database = $false; brew_type_table = $false; error_type = $null; hresult = $null }
    try {
        $access = [Runtime.InteropServices.Marshal]::GetActiveObject('Access.Application')
        $probe.attached = $true
        $db = $access.CurrentDb()
        $probe.current_database = $null -ne $db
        $table = $db.TableDefs.Item('tblBrew_Type')
        $probe.brew_type_table = $null -ne $table
    } catch {
        $probe.error_type = $_.Exception.GetType().FullName
        $probe.hresult = $_.Exception.HResult
    }
    $probe | ConvertTo-Json -Compress
    exit 0
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$report = [ordered]@{
    observed_at = [DateTime]::UtcNow.ToString('o')
    user = $identity.Name
    session_id = (Get-Process -Id $PID).SessionId
    elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    powershell_version = $PSVersionTable.PSVersion.ToString()
    process_bitness = [IntPtr]::Size * 8
    connector_directory_exists = (Test-Path -LiteralPath $ConnectorDirectory -PathType Container)
    environment_presence = @()
    access_processes = @()
    access_probe = $null
    task_query_error = $null
    tasks = @()
    scripts = @()
}
foreach ($name in @('NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY')) {
    $report.environment_presence += [ordered]@{
        name = $name
        process = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name,'Process'))
        user = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name,'User'))
        machine = -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name,'Machine'))
    }
}
$report.access_processes = @(Get-Process MSACCESS -ErrorAction SilentlyContinue | ForEach-Object { @{ id=$_.Id; session_id=$_.SessionId } })
$x86 = Join-Path $env:WINDIR 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
if (-not [Environment]::Is64BitOperatingSystem) { $x86 = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe' }
try {
    $probeJson = & $x86 -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $PSCommandPath -AccessProbeOnly 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Access probe process failed' }
    $report.access_probe = ($probeJson -join "`n") | ConvertFrom-Json
} catch { $report.access_probe = @{ error_type=$_.Exception.GetType().FullName; probe_process_failed=$true } }
try {
    $allTasks = @(Get-ScheduledTask -ErrorAction Stop)
    $candidates = @($allTasks | Where-Object {
        if ($TaskName) { $_.TaskName -eq $TaskName }
        else { ($_.TaskName + ' ' + (($_.Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -join ' ')) -match '(?i)viewplan|brewery.?ops|viewplan-connector' }
    })
    foreach ($task in $candidates) {
        $info = $null
        try { $info = $task | Get-ScheduledTaskInfo } catch {}
        $actions = @($task.Actions | ForEach-Object {
            $argsText = [string]$_.Arguments
            [ordered]@{
                executable_name = [IO.Path]::GetFileName([string]$_.Execute)
                explicit_x86_powershell = ([string]$_.Execute -match '(?i)SysWOW64\\WindowsPowerShell\\v1\.0\\powershell\.exe$')
                explicit_system32_powershell = ([string]$_.Execute -match '(?i)System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$')
                working_directory = $_.WorkingDirectory
                uses_file_argument = ($argsText -match '(?i)-File\s')
                uses_command_argument = ($argsText -match '(?i)-Command\s')
                uses_no_profile = ($argsText -match '(?i)-NoProfile\b')
                references_all_module_runner = ($argsText -match '(?i)viewplan-connector\.ps1')
                references_customers_only = ($argsText -match '(?i)viewplan-connector-customers\.ps1|-Module\s+["'']?customers')
                references_wrapper = ($argsText -match '(?i)\.cmd|\.bat|\.vbs|nightly|scheduled')
                credential_arguments_detected = ($argsText -match '(?i)ServiceRoleKey|SUPABASE_SERVICE_ROLE_KEY|eyJ[A-Za-z0-9_-]{20}|sb_secret_')
                # Raw arguments can include keys/passwords and are deliberately omitted.
            }
        })
        $report.tasks += [ordered]@{
            name=$task.TaskName; path=$task.TaskPath; state=[string]$task.State
            user=$task.Principal.UserId; logon_type=[string]$task.Principal.LogonType; run_level=[string]$task.Principal.RunLevel
            last_run=if($info){$info.LastRunTime.ToString('o')}else{$null}
            next_run=if($info){$info.NextRunTime.ToString('o')}else{$null}
            last_result=if($info){$info.LastTaskResult}else{$null}
            missed_runs=if($info){$info.NumberOfMissedRuns}else{$null}
            enabled=$task.Settings.Enabled; start_when_available=$task.Settings.StartWhenAvailable
            run_only_if_idle=$task.Settings.RunOnlyIfIdle; run_only_if_network_available=$task.Settings.RunOnlyIfNetworkAvailable
            execution_time_limit=$task.Settings.ExecutionTimeLimit; multiple_instances=[string]$task.Settings.MultipleInstances
            disallow_on_battery=$task.Settings.DisallowStartIfOnBatteries; stop_on_battery=$task.Settings.StopIfGoingOnBatteries
            actions=$actions
            triggers=@($task.Triggers | ForEach-Object { @{ type=$_.CimClass.CimClassName; enabled=$_.Enabled; start=$_.StartBoundary; end=$_.EndBoundary; days_interval=$_.DaysInterval; repetition_interval=$_.Repetition.Interval } })
        }
    }
} catch { $report.task_query_error = $_.Exception.GetType().FullName }
foreach ($file in @('viewplan-connector.ps1','viewplan-connector-customers.ps1','viewplan-connector-reconcile.ps1','viewplan-products-sync.ps1','viewplan-product-label-sync.ps1','viewplan-take-off-sync.ps1')) {
    $path = Join-Path $ConnectorDirectory $file
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $item=Get-Item -LiteralPath $path
        $report.scripts += @{ name=$file; modified_at=$item.LastWriteTimeUtc.ToString('o'); sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash }
    } else { $report.scripts += @{name=$file; missing=$true} }
}
$report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Host "Read-only scheduler audit saved: $OutputPath"
Write-Host 'No tasks or ViewPlan records changed. Environment values and raw task arguments were not exported.'
