$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'viewplan-take-off-source.ps1')
function Assert($condition,$message){if(-not $condition){throw $message}}
$p=Convert-TakeOffPlanArguments '2100|1|||N'
Assert ($p.planned_litres -eq 2100 -and $p.planned_tank_id -eq 1 -and $null -eq $p.planned_gyle) 'Observed plan parsing failed'
$p=Convert-TakeOffPlanArguments '0|||G-123|N'
Assert ($p.planned_litres -eq 0 -and $null -eq $p.planned_tank_id -and $p.planned_gyle -eq 'G-123') 'Zero/gyle parsing failed'
$p=Convert-TakeOffPlanArguments ''
Assert ($null -eq $p.planned_litres) 'Blank became zero'
foreach($bad in @('-1||||N','2100|1.5|||N','abc||||N','2,100||||N')){
 $rejected=$false
 try {Convert-TakeOffPlanArguments $bad | Out-Null} catch {$rejected=$true}
 Assert $rejected "Invalid value accepted: $bad"
}
Write-Host 'Take Off source parsing tests passed'

# Projection tests use fixtures only; no ViewPlan session or application writes.
$plan=[pscustomobject]@{task_id=4590;brew_type_id=2005;brew_product_name='Test beer';is_deleted=$false;task_complete=$true;task_closed=$true;task_brew_register_id=4184;task_due_date='2026-09-04';parsed_plan=(Convert-TakeOffPlanArguments '2100|1|||N')}
$batch=[pscustomobject]@{brew_register_id=4184;brew_type_id=2005;brew_product_name='Test beer';brew_no='G1';brew_date='2026-09-04';is_void=$false;is_deleted=$false}
$tank=[pscustomobject]@{tank_id=1;brew_register_id=4184;tank_label_text='Tomorrows Brew';is_sys=$false;is_available=$true;current_level=2100}
$snapshot=[pscustomobject]@{plans=@($plan);batches=@($batch);tanks=@($tank);source_take_off=@()}
$rows=@(Convert-ViewPlanTakeOffProjection $snapshot)
Assert ($rows[0].source_link_key -eq 'batch:4184') 'Explicit lineage missing'
Assert ($rows[1].phase -eq 'staging') 'Staging counted as physical FV'
$tank.tank_id=3;$tank.tank_label_text='FV2'
$rows=@(Convert-ViewPlanTakeOffProjection $snapshot)
Assert ($rows[1].phase -eq 'in_tank' -and $rows[1].source_key -eq 'batch:4184') 'Transfer changed identity'
$tank.current_level=$null
$rows=@(Convert-ViewPlanTakeOffProjection $snapshot)
Assert ($null -eq $rows[1].volume_litres) 'Missing tank volume became zero'
$snapshot.batches=@();$failed=$false
try {Convert-ViewPlanTakeOffProjection $snapshot | Out-Null}catch{$failed=$true}
Assert $failed 'Missing linked batch accepted'
Write-Host 'Take Off projection tests passed'
