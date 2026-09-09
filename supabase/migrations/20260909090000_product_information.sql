-- Locally reviewed product information. Source connectors must not overwrite it.
create table public.product_information (
 product_id uuid primary key references products(id),details jsonb not null default '{}',
 revision integer not null default 1,updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
create table public.product_package_information (
 product_id uuid references products(id),package_id uuid references packages(id),details jsonb not null default '{}',
 revision integer not null default 1,updated_at timestamptz not null default now(),updated_by uuid references auth.users(id),
 primary key(product_id,package_id)
);
create table public.product_information_events (
 id bigint generated always as identity primary key,product_id uuid references products(id),package_id uuid references packages(id),
 actor_id uuid references auth.users(id),before_details jsonb,after_details jsonb,created_at timestamptz not null default now()
);
alter table public.product_information enable row level security;
alter table public.product_package_information enable row level security;
alter table public.product_information_events enable row level security;
create policy product_information_read on public.product_information for select to authenticated using(true);
create policy product_package_information_read on public.product_package_information for select to authenticated using(true);
create policy product_information_events_read on public.product_information_events for select to authenticated using(true);
revoke all on public.product_information,public.product_package_information,public.product_information_events from anon,authenticated;
grant select on public.product_information,public.product_package_information,public.product_information_events to authenticated;
grant all on public.product_information,public.product_package_information,public.product_information_events to service_role;
grant usage,select on sequence public.product_information_events_id_seq to service_role;

create function public.save_product_information(p_product uuid,p_package uuid,p_revision integer,p_details jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare old_details jsonb; old_revision integer; k text; v jsonb;
begin
 if auth.uid() is null or not take_off_is_approver() then raise exception 'Head Brewer approval required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_product::text,3090901));
 if not exists(select 1 from products where id=p_product) then raise exception 'Product not found'; end if;
 if p_package is not null and not exists(select 1 from packages where id=p_package and active) then raise exception 'Package unavailable'; end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'Invalid product information'; end if;
 for k,v in select * from jsonb_each(p_details) loop
  if k not in ('allergens','vegan','gluten_free','lactose_free','fining_status') then raise exception 'Unknown information field'; end if;
  if v='null'::jsonb then continue; end if;
  if k='allergens' then
   if jsonb_typeof(v)<>'string' or length(v#>>'{}')>1000 or length(trim(v#>>'{}'))=0 then raise exception 'Enter an allergen statement or mark it unknown'; end if;
  elsif k='fining_status' then
   if jsonb_typeof(v)<>'string' or v#>>'{}' not in ('fined','unfined') then raise exception 'Invalid fining status'; end if;
  elsif jsonb_typeof(v)<>'boolean' then raise exception 'Use yes, no or unknown'; end if;
 end loop;
 if p_package is null then
  select details,revision into old_details,old_revision from product_information where product_id=p_product for update;
 else
  select details,revision into old_details,old_revision from product_package_information where product_id=p_product and package_id=p_package for update;
 end if;
 if coalesce(old_revision,0) is distinct from p_revision then raise exception 'Information changed; reload before saving'; end if;
 if old_details is not distinct from p_details then return; end if;
 if p_package is null then
  insert into product_information(product_id,details,updated_by) values(p_product,p_details,auth.uid())
  on conflict(product_id) do update set details=excluded.details,revision=product_information.revision+1,updated_at=now(),updated_by=auth.uid();
 else
  insert into product_package_information(product_id,package_id,details,updated_by) values(p_product,p_package,p_details,auth.uid())
  on conflict(product_id,package_id) do update set details=excluded.details,revision=product_package_information.revision+1,updated_at=now(),updated_by=auth.uid();
 end if;
 insert into product_information_events(product_id,package_id,actor_id,before_details,after_details)
 values(p_product,p_package,auth.uid(),old_details,p_details);
end $$;
revoke all on function public.save_product_information(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_product_information(uuid,uuid,integer,jsonb) to authenticated;
