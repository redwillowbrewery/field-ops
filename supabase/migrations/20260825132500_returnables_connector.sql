alter table public.account_containers_snapshot
  add column if not exists viewplan_packaging_inventory_id bigint,
  add column if not exists viewplan_customer_id bigint,
  add column if not exists on_site boolean,
  add column if not exists is_empty boolean,
  add column if not exists blocked boolean,
  add column if not exists deleted boolean,
  add column if not exists is_returnable boolean not null default true;

create unique index if not exists account_containers_snapshot_viewplan_inventory_uidx
  on public.account_containers_snapshot(viewplan_packaging_inventory_id)
  where viewplan_packaging_inventory_id is not null;

create table if not exists public.packaging_type_classification (
  package_type text primary key,
  is_returnable boolean not null,
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.packaging_type_classification(package_type,is_returnable,notes) values
  ('E-Cask',false,'One-way container'),
  ('E-Keg',false,'One-way container'),
  ('50L E-Keg',false,'One-way container'),
  ('50L E-Key',false,'One-way container'),
  ('Key Keg',false,'One-way container'),
  ('Firkin',true,'Returnable brewery container'),
  ('Pin',true,'Returnable brewery container'),
  ('Pin (Flat Bottom)',true,'Returnable brewery container'),
  ('Kilderkin',true,'Returnable brewery container'),
  ('30 Litre Steel',true,'Returnable brewery container'),
  ('50 Litre Keg',true,'Returnable brewery container'),
  ('Wooden Firkin',true,'Returnable brewery container')
on conflict (package_type) do nothing;

alter table public.packaging_type_classification enable row level security;
drop policy if exists "Authenticated users can read packaging classifications" on public.packaging_type_classification;
create policy "Authenticated users can read packaging classifications"
on public.packaging_type_classification for select to authenticated using (true);

create or replace view public.account_returnables_summary as
select
  s.account_id,
  count(*) filter (where s.is_returnable and not coalesce(s.lost,false))::integer as returnable_count,
  max(s.off_site_days) filter (where s.is_returnable and not coalesce(s.lost,false))::integer as oldest_days,
  jsonb_object_agg(s.container_type, s.qty) filter (where s.is_returnable and not coalesce(s.lost,false)) as package_breakdown
from (
  select account_id, container_type, is_returnable, lost, max(off_site_days) as off_site_days, count(*)::integer as qty
  from public.account_containers_snapshot
  where coalesce(on_site,false)=false
  group by account_id, container_type, is_returnable, lost
) s
group by s.account_id;

grant select on public.account_returnables_summary to authenticated;
