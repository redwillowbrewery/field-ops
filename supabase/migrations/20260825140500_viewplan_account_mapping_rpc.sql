-- Brewery Ops - authoritative ViewPlan account mapping bridge for server-side connectors

create or replace function public.get_viewplan_account_mappings()
returns table(viewplan_customer_id text, account_id uuid)
language sql
security definer
set search_path = public
as $$
  with direct as (
    select a.brewery_customer_id::text as viewplan_customer_id, a.id as account_id, 1 as priority
    from public.accounts a
    where a.brewery_customer_id is not null
  ),
  bridge as (
    select x.external_id as viewplan_customer_id, x.account_id, 2 as priority
    from public.account_external_ids x
    where x.system = 'viewplan'
      and nullif(btrim(x.external_id),'') is not null
  ),
  ranked as (
    select viewplan_customer_id, account_id,
           row_number() over (partition by viewplan_customer_id order by priority, account_id) as rn
    from (
      select * from direct
      union all
      select * from bridge
    ) s
  )
  select viewplan_customer_id, account_id
  from ranked
  where rn = 1
  order by viewplan_customer_id;
$$;

revoke all on function public.get_viewplan_account_mappings() from public;
grant execute on function public.get_viewplan_account_mappings() to service_role;

create or replace function public.reconcile_viewplan_account_mappings()
returns table(accounts_with_viewplan_id integer, external_bridges integer, bridges_inserted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  direct_count integer;
  bridge_count integer;
  inserted_count integer := 0;
begin
  select count(*) into direct_count
  from public.accounts
  where brewery_customer_id is not null;

  insert into public.account_external_ids(account_id, system, external_id)
  select a.id, 'viewplan', a.brewery_customer_id::text
  from public.accounts a
  where a.brewery_customer_id is not null
  on conflict (system, external_id) do update set account_id = excluded.account_id;

  get diagnostics inserted_count = row_count;

  select count(*) into bridge_count
  from public.account_external_ids
  where system = 'viewplan';

  accounts_with_viewplan_id := direct_count;
  external_bridges := bridge_count;
  bridges_inserted := inserted_count;
  return next;
end;
$$;

revoke all on function public.reconcile_viewplan_account_mappings() from public;
grant execute on function public.reconcile_viewplan_account_mappings() to service_role;
