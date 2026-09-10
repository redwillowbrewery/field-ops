create table public.connector_runner_runs (
 id uuid primary key,
 source_system text not null check(source_system='viewplan'),
 invocation text not null check(invocation in ('manual','scheduled')),
 requested_module text not null check(requested_module in ('all','customers','products','pricing','containers','take-off')),
 status text not null check(status in ('running','completed','failed')),
 started_at timestamptz not null,
 completed_at timestamptz,
 stage text not null,
 error_code text
);
create index connector_runner_started on public.connector_runner_runs(started_at desc);
alter table public.connector_runner_runs enable row level security;
revoke all on public.connector_runner_runs from public,anon,authenticated;
grant select on public.connector_runner_runs to authenticated;
grant all on public.connector_runner_runs to service_role;
create policy staff_read on public.connector_runner_runs for select to authenticated using(true);

create function public.connector_health()
returns table(module text,last_success_at timestamptz,last_attempt_at timestamptz,last_error text,last_row_count bigint,status text,invocation text,run_id uuid)
language sql stable security definer set search_path=public as $$
 with latest_runner as (select * from connector_runner_runs order by started_at desc limit 1)
 select s.module,s.last_success_at,coalesce(r.started_at,s.updated_at),s.last_error,
 case when s.module in ('products','pricing','containers') then null else s.last_row_count::bigint end,
 case when s.last_error is not null then 'failed' when r.status='running' and r.started_at<now()-interval '2 hours' then 'stale' when r.status='running' then 'running' when s.last_success_at is null or s.last_success_at<now()-interval '36 hours' then 'stale' else 'current' end,
 null::text,null::uuid
 from connector_sync_state s left join lateral (select started_at,status from connector_sync_runs where source_system=s.source_system and module=s.module order by started_at desc limit 1) r on true
 where s.source_system='viewplan' and s.module<>'product_labels' and auth.uid() is not null
 union all select 'take-off',t.snapshot_at,t.updated_at,t.last_error,null::bigint,
 case when t.last_error is not null then 'failed' when t.snapshot_at is null or t.snapshot_at<now()-interval '36 hours' then 'stale' else 'current' end,null,null
 from take_off_sync t where auth.uid() is not null
 union all select 'product labels',p.observed_at,coalesce(s.updated_at,p.observed_at),s.last_error,p.row_count::bigint,
 case when s.last_error is not null then 'failed' when p.observed_at<now()-interval '36 hours' then 'stale' else 'current' end,null,null
 from product_source_refresh p left join connector_sync_state s on s.source_system=p.source_system and s.module='product_labels' where auth.uid() is not null
 union all select 'connector run',
 (select max(completed_at) from connector_runner_runs where status='completed' and requested_module='all'),
 r.started_at,r.error_code,null::bigint,
 case when r.status='failed' then 'failed' when r.status='running' and r.started_at<now()-interval '2 hours' then 'stale' when r.status='running' then 'running' when r.completed_at<now()-interval '36 hours' then 'stale' else 'current' end,
 r.invocation||' / '||r.requested_module,r.id
 from latest_runner r where auth.uid() is not null
$$;
revoke all on function public.connector_health() from public,anon;
grant execute on function public.connector_health() to authenticated;
