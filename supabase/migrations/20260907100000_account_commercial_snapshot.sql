-- Imported facts only: authenticated users can read but cannot change these.
create table public.account_commercial_snapshots (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  source text not null check (source = 'viewplan'),
  source_customer_id integer not null,
  balance numeric,
  credit_limit numeric,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  order_blocked boolean,
  dispatch_blocked boolean,
  source_status text,
  observed_at timestamptz not null,
  constraint finite_amounts check (
    (balance is null or balance::text not in ('NaN','Infinity','-Infinity')) and
    (credit_limit is null or credit_limit::text not in ('NaN','Infinity','-Infinity'))
  )
);
alter table public.account_commercial_snapshots enable row level security;
revoke all on public.account_commercial_snapshots from anon, authenticated;
grant select on public.account_commercial_snapshots to authenticated;
grant all on public.account_commercial_snapshots to service_role;
create policy account_commercial_read on public.account_commercial_snapshots
for select to authenticated using (
  exists (select 1 from public.accounts a
    where a.id = account_id and a.brewery_customer_id = source_customer_id)
);

-- One complete commercial read per transaction: no half-written batch or
-- refreshed timestamps if any source row is malformed. Never creates Accounts.
create function public.sync_viewplan_account_commercial(
  payload jsonb, snapshot_at timestamptz, currency_code text
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  item jsonb;
  written integer;
begin
  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'Commercial payload must be an array';
  end if;
  if jsonb_array_length(payload) = 0 then
    raise exception 'Empty commercial reconciliation rejected';
  end if;
  if snapshot_at is null or not isfinite(snapshot_at) or snapshot_at > now() + interval '5 minutes' then
    raise exception 'Invalid commercial snapshot timestamp';
  end if;
  if currency_code is null or currency_code !~ '^[A-Z]{3}$' then
    raise exception 'An audited currency code is required';
  end if;
  for item in select value from jsonb_array_elements(payload) loop
    if jsonb_typeof(item) <> 'object' or not (item ?& array['customer_id','balance','credit_limit','order_blocked','dispatch_blocked','source_status']) then
      raise exception 'Commercial row is missing required fields';
    end if;
    if jsonb_typeof(item->'customer_id') <> 'number' or (item->>'customer_id') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(item->'balance') not in ('number','null')
      or jsonb_typeof(item->'credit_limit') not in ('number','null')
      or jsonb_typeof(item->'order_blocked') not in ('boolean','null')
      or jsonb_typeof(item->'dispatch_blocked') not in ('boolean','null')
      or jsonb_typeof(item->'source_status') not in ('string','null') then
      raise exception 'Commercial row has invalid types';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(payload) x group by x->>'customer_id' having count(*) > 1) then
    raise exception 'Duplicate source customer in commercial reconciliation';
  end if;
  -- Serialise complete reconciliations and reject delayed retries of old reads.
  perform pg_advisory_xact_lock(20260907, 1000);
  if exists (select 1 from public.account_commercial_snapshots where observed_at > snapshot_at) then
    raise exception 'Commercial snapshot is older than the last successful read';
  end if;
  insert into public.account_commercial_snapshots as current_snapshot
    (account_id,source,source_customer_id,balance,credit_limit,currency,
     order_blocked,dispatch_blocked,source_status,observed_at)
  select a.id,'viewplan',r.customer_id,r.balance,r.credit_limit,currency_code,
    r.order_blocked,r.dispatch_blocked,r.source_status,snapshot_at
  from jsonb_to_recordset(payload) as r(customer_id integer,balance numeric,credit_limit numeric,
    order_blocked boolean,dispatch_blocked boolean,source_status text)
  join public.accounts a on a.brewery_customer_id = r.customer_id
  on conflict (account_id) do update set
    source=excluded.source,source_customer_id=excluded.source_customer_id,
    balance=excluded.balance,credit_limit=excluded.credit_limit,currency=excluded.currency,
    order_blocked=excluded.order_blocked,dispatch_blocked=excluded.dispatch_blocked,
    source_status=excluded.source_status,observed_at=excluded.observed_at;
  get diagnostics written = row_count;
  if written = 0 then raise exception 'No mapped Accounts in commercial reconciliation'; end if;
  insert into public.connector_sync_state
    (source_system,module,last_success_at,last_full_sync_at,last_row_count,last_error,updated_at)
  values ('viewplan','account_commercial',snapshot_at,snapshot_at,written,null,now())
  on conflict (source_system,module) do update set
    last_success_at=excluded.last_success_at,last_full_sync_at=excluded.last_full_sync_at,
    last_row_count=excluded.last_row_count,last_error=null,updated_at=excluded.updated_at;
  return written;
end;
$$;
revoke all on function public.sync_viewplan_account_commercial(jsonb,timestamptz,text) from public, anon, authenticated;
grant execute on function public.sync_viewplan_account_commercial(jsonb,timestamptz,text) to service_role;

comment on table public.account_commercial_snapshots is
  'Read-only source facts. Only explicit source order_blocked is the sell/stop signal; amounts never determine hold.';
