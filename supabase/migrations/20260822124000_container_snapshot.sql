create table if not exists public.account_containers_snapshot (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  viewplan_item_no text not null,
  container_type text not null,
  contents text,
  gyle text,
  package_date date,
  best_before date,
  stock_location text,
  off_site_date date,
  off_site_days integer,
  order_no text,
  source_customer_display text,
  customer_town text,
  customer_postcode text,
  delivery_postcode text,
  customer_class text,
  location_zone text,
  dispatched boolean,
  delivered boolean,
  usage_count integer,
  leased boolean,
  lease_expiry date,
  serial_no text,
  comment text,
  lost boolean not null default false,
  imported_at timestamptz not null default now(),
  unique (viewplan_item_no)
);

create index if not exists account_containers_snapshot_account_idx on public.account_containers_snapshot(account_id);
create index if not exists account_containers_snapshot_age_idx on public.account_containers_snapshot(off_site_days desc);

alter table public.account_containers_snapshot enable row level security;

drop policy if exists "Authenticated users can read container snapshots" on public.account_containers_snapshot;
create policy "Authenticated users can read container snapshots"
on public.account_containers_snapshot for select
to authenticated
using (true);
