-- Independent source identities; never attach planning to replaceable sales-history UUIDs.
create table public.fulfilment_orders (
 source_id bigint primary key check(source_id>0),
 account_id uuid references public.accounts(id),
 delivery_date date,
 fulfilment_method text not null default 'review',
 snapshot jsonb not null,
 revision integer not null default 1,
 observed_at timestamptz not null,
 changed_at timestamptz not null default now()
);
create table public.fulfilment_order_revisions (
 source_id bigint not null references public.fulfilment_orders(source_id),
 revision integer not null, snapshot jsonb not null, observed_at timestamptz not null,
 primary key(source_id,revision)
);
create table public.fulfilment_plans (
 source_id bigint primary key references public.fulfilment_orders(source_id),
 planned_date date not null, vehicle_id bigint,
 revision integer not null default 1,
 reviewed_source_revision integer not null,
 updated_by uuid not null, updated_at timestamptz not null default now()
);
create table public.fulfilment_sync (
 singleton boolean primary key default true check(singleton),
 observed_at timestamptz, last_error text, vehicles jsonb not null default '[]',
 last_count integer, updated_at timestamptz not null default now()
);
insert into public.fulfilment_sync(singleton) values(true);
create index fulfilment_delivery_date_idx on public.fulfilment_orders(delivery_date);
create index fulfilment_planned_date_idx on public.fulfilment_plans(planned_date);
do $$ declare t text; begin
 foreach t in array array['fulfilment_orders','fulfilment_order_revisions','fulfilment_plans','fulfilment_sync'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy staff_read on public.%I for select to authenticated using(true)',t);
 end loop;
end $$;

create function public.sync_fulfilment_orders(payload jsonb, snapshot_at timestamptz) returns integer
language plpgsql security definer set search_path=public as $$
declare item jsonb; sid bigint; aid uuid; old public.fulfilment_orders; next_revision integer; method text; prior timestamptz; seen bigint[] := '{}';
begin
 perform pg_advisory_xact_lock(9162026);
 select observed_at into prior from fulfilment_sync where singleton for update;
 if snapshot_at is null or snapshot_at > now()+interval '5 minutes' or snapshot_at <= prior then raise exception 'Invalid/stale snapshot'; end if;
 if jsonb_typeof(payload->'orders') is distinct from 'array' or jsonb_array_length(payload->'orders')=0 or jsonb_array_length(payload->'orders')>10000 or jsonb_typeof(payload->'vehicles') is distinct from 'array' then raise exception 'Invalid snapshot envelope'; end if;
 for item in select value from jsonb_array_elements(payload->'orders') loop
 sid := (item->'header'->>'order_id')::bigint;
 if sid is null or sid<=0 or sid=any(seen) or jsonb_typeof(item->'lines') is distinct from 'array' or jsonb_typeof(item->'customer') is distinct from 'object' then raise exception 'Invalid/duplicate order'; end if;
 if (item->'header'->>'customer_id')::bigint is distinct from (item->'customer'->>'customer_id')::bigint then raise exception 'Customer mismatch'; end if;
 if exists(select 1 from jsonb_array_elements(item->'lines') l where (l->>'order_id')::bigint is distinct from sid or l->>'order_item_id' is null) then raise exception 'Invalid order line'; end if;
 if (select count(*)<>count(distinct l->>'order_item_id') from jsonb_array_elements(item->'lines') l) then raise exception 'Duplicate line'; end if;
 seen:=array_append(seen,sid);
 select account_id into aid from account_external_ids where system='viewplan' and external_id=item->'header'->>'customer_id';
 method := case when exists(select 1 from accounts where id=aid and lower(btrim(brewery_location_zone))='pallet') or item->'header'->>'delivery_vehicle_id'='3' then 'pallet'
 when item->'header'->>'delivery_vehicle_id'='5' then 'courier'
 when item->'header'->>'delivery_vehicle_id'='6' then 'collection_review'
 when item->'header'->>'delivery_vehicle_id' in ('1','2','4') then 'van' else 'review' end;
 select * into old from fulfilment_orders where source_id=sid for update;
 next_revision:=case when old.source_id is null then 1 when old.snapshot=item then old.revision else old.revision+1 end;
 insert into fulfilment_orders(source_id,account_id,delivery_date,fulfilment_method,snapshot,revision,observed_at)
 values(sid,aid,nullif(item->'header'->>'delivery_date','')::date,method,item,next_revision,snapshot_at)
 on conflict(source_id) do update set account_id=excluded.account_id,delivery_date=excluded.delivery_date,fulfilment_method=excluded.fulfilment_method,snapshot=excluded.snapshot,revision=excluded.revision,observed_at=excluded.observed_at,
 changed_at=case when fulfilment_orders.revision<>excluded.revision then now() else fulfilment_orders.changed_at end;
 insert into fulfilment_order_revisions values(sid,next_revision,item,snapshot_at) on conflict do nothing;
 end loop;
 -- Absence never cancels an order. Its observation timestamp ages visibly instead.
 update fulfilment_sync set observed_at=snapshot_at,last_error=null,vehicles=payload->'vehicles',last_count=cardinality(seen),updated_at=now() where singleton;
 return cardinality(seen);
end $$;
revoke all on function public.sync_fulfilment_orders(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_fulfilment_orders(jsonb,timestamptz) to service_role;

create function public.plan_fulfilment_order(p_source bigint,p_source_revision integer,p_plan_revision integer,p_date date,p_vehicle bigint) returns void
language plpgsql security definer set search_path=public as $$
declare o public.fulfilment_orders; p public.fulfilment_plans;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into o from fulfilment_orders where source_id=p_source for update;
 select * into p from fulfilment_plans where source_id=p_source for update;
 if o.source_id is null or o.revision<>p_source_revision or coalesce(p.revision,0)<>p_plan_revision then raise exception 'Order or plan changed; reload before saving'; end if;
 if p_date is null or p_date<current_date-interval '30 days' or p_date>current_date+interval '365 days' then raise exception 'Choose a planning date within the next year'; end if;
 if coalesce((o.snapshot->'header'->>'is_cancelled')::boolean,false) or coalesce((o.snapshot->'header'->>'is_deleted')::boolean,false) then raise exception 'Cancelled/deleted source order'; end if;
 if o.fulfilment_method='pallet' and p_vehicle is not null and p_vehicle<>3 then raise exception 'Pallet-territory/network work must remain separate from van runs'; end if;
 if p_vehicle is not null and not exists(select 1 from fulfilment_sync s,jsonb_array_elements(s.vehicles) v where (v->>'vehicle_id')::bigint=p_vehicle and (v->>'is_available')::boolean) then raise exception 'Vehicle unavailable'; end if;
 insert into fulfilment_plans(source_id,planned_date,vehicle_id,reviewed_source_revision,updated_by) values(p_source,p_date,p_vehicle,o.revision,auth.uid())
 on conflict(source_id) do update set planned_date=p_date,vehicle_id=p_vehicle,reviewed_source_revision=o.revision,revision=fulfilment_plans.revision+1,updated_by=auth.uid(),updated_at=now();
end $$;
revoke all on function public.plan_fulfilment_order(bigint,integer,integer,date,bigint) from public,anon;
grant execute on function public.plan_fulfilment_order(bigint,integer,integer,date,bigint) to authenticated;

create table public.fulfilment_plan_events (
 id bigint generated always as identity primary key,
 source_id bigint not null references public.fulfilment_orders(source_id),
 actor_id uuid not null, recorded_at timestamptz not null default now(),
 previous_plan jsonb, new_plan jsonb not null
);
alter table public.fulfilment_plan_events enable row level security;
revoke all on public.fulfilment_plan_events from public,anon,authenticated;
grant select on public.fulfilment_plan_events to authenticated;
create policy staff_read on public.fulfilment_plan_events for select to authenticated using(true);
create function public.record_fulfilment_plan_event() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into fulfilment_plan_events(source_id,actor_id,previous_plan,new_plan) values(new.source_id,new.updated_by,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;end $$;
revoke all on function public.record_fulfilment_plan_event() from public,anon,authenticated;
create trigger fulfilment_plan_audit after insert or update on public.fulfilment_plans for each row execute function public.record_fulfilment_plan_event();
