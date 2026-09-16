-- Permit the separately scheduled order poll in the existing runner ledger.
alter table public.connector_runner_runs
 drop constraint connector_runner_runs_requested_module_check;
alter table public.connector_runner_runs
 add constraint connector_runner_runs_requested_module_check
 check(requested_module in ('all','customers','products','pricing','containers','take-off','orders'));
