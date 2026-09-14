-- Stage full ViewPlan label snapshots. Never changes reviewed information or publications.
create table public.product_source_observations (
 source_system text not null check(source_system='viewplan'),
 external_id text not null,
 product_id uuid references public.products(id),
 source_name text not null,
 label_text text,
 source_vegan boolean,
 source_is_system boolean not null default false,
 source_business_exchange boolean not null default false,
 source_updated_at timestamp,
 observed_at timestamptz not null,
 present_in_latest boolean not null default true,
 primary key(source_system,external_id)
);
create table public.product_source_refresh (
 source_system text primary key check(source_system='viewplan'),
 observed_at timestamptz not null,row_count integer not null
);
alter table public.product_source_observations enable row level security;
alter table public.product_source_refresh enable row level security;
create policy product_source_read on public.product_source_observations for select to authenticated using(true);
create policy product_source_refresh_read on public.product_source_refresh for select to authenticated using(true);
revoke all on public.product_source_observations,public.product_source_refresh from public,anon,authenticated;
grant select on public.product_source_observations,public.product_source_refresh to authenticated;
grant all on public.product_source_observations,public.product_source_refresh to service_role;

create function public.sync_product_label_observations(p_rows jsonb,p_observed_at timestamptz)
returns integer language plpgsql security definer set search_path=public as $$
declare r jsonb; external text; n integer; previous timestamptz;
begin
 perform pg_advisory_xact_lock(309091700);
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Invalid label snapshot'; end if;
 n=jsonb_array_length(p_rows);
 if n<1 or n>10000 or p_observed_at is null or p_observed_at>now()+interval '5 minutes' then raise exception 'Invalid label snapshot'; end if;
 select observed_at into previous from product_source_refresh where source_system='viewplan';
 if previous is not null and p_observed_at<=previous then raise exception 'A newer or identical label snapshot is already staged'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x group by x->>'brew_type_id' having count(*)>1) then raise exception 'Duplicate product source identity'; end if;
 for r in select * from jsonb_array_elements(p_rows) loop
  external=r->>'brew_type_id';
  if jsonb_typeof(r)<>'object' or external is null or external!~'^[0-9]+$' or length(external)>12
    or jsonb_typeof(r->'brew_product_name') is distinct from 'string' or length(trim(r->>'brew_product_name'))=0
    or length(r->>'brew_product_name')>500
    or (r->'label_text' is not null and r->'label_text'<>'null'::jsonb and jsonb_typeof(r->'label_text')<>'string')
    or length(r->>'label_text')>10000
    or (r->'is_vegan' is not null and r->'is_vegan'<>'null'::jsonb and jsonb_typeof(r->'is_vegan')<>'boolean')
  then raise exception 'Invalid source product row'; end if;
  insert into product_source_observations(source_system,external_id,product_id,source_name,label_text,source_vegan,source_is_system,source_business_exchange,source_updated_at,observed_at)
  values('viewplan',external,(select product_id from product_external_ids where system='viewplan' and external_id=external),
    r->>'brew_product_name',r->>'label_text',(r->>'is_vegan')::boolean,coalesce((r->>'is_sys')::boolean,false),coalesce((r->>'is_bex')::boolean,false),(r->>'lud')::timestamp,p_observed_at)
  on conflict(source_system,external_id) do update set product_id=excluded.product_id,source_name=excluded.source_name,
    label_text=excluded.label_text,source_vegan=excluded.source_vegan,source_is_system=excluded.source_is_system,source_business_exchange=excluded.source_business_exchange,source_updated_at=excluded.source_updated_at,
    observed_at=excluded.observed_at,present_in_latest=true;
 end loop;
 update product_source_observations set present_in_latest=false where source_system='viewplan' and observed_at<p_observed_at;
 insert into product_source_refresh values('viewplan',p_observed_at,n)
 on conflict(source_system) do update set observed_at=excluded.observed_at,row_count=excluded.row_count;
 return n;
end $$;
revoke all on function public.sync_product_label_observations(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_product_label_observations(jsonb,timestamptz) to service_role;
