alter table public.connector_sync_state enable row level security;
alter table public.connector_sync_runs enable row level security;

drop policy if exists connector_sync_state_authenticated_read on public.connector_sync_state;
create policy connector_sync_state_authenticated_read
on public.connector_sync_state
for select
to authenticated
using (true);

drop policy if exists connector_sync_runs_authenticated_read on public.connector_sync_runs;
create policy connector_sync_runs_authenticated_read
on public.connector_sync_runs
for select
to authenticated
using (true);
