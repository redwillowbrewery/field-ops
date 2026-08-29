-- Canonical availability: Brewery Ops persists Sellar observations and serves them to application workflows.

create table public.product_presentations (
  product_id uuid primary key references public.products(id) on delete cascade,
  description text,
  image_url text,
  hero_image_url text,
  abv numeric(5,2),
  gluten_free boolean,
  vegan boolean,
  lactose_free boolean,
  source_system text not null,
  source_observed_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.availability_snapshots (
  product_variant_id uuid primary key references public.product_variants(id) on delete cascade,
  available_quantity numeric(12,3) not null check (available_quantity >= 0),
  source_system text not null,
  source_reference text not null,
  source_observed_at timestamptz not null,
  refreshed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_reference)
);

create index availability_snapshots_observed_idx
  on public.availability_snapshots(source_observed_at desc);

comment on table public.product_presentations is
  'Slow-changing canonical product presentation populated by bounded external adapters.';
comment on table public.availability_snapshots is
  'Last known-good application-facing availability by canonical Product Variant.';
comment on column public.availability_snapshots.source_observed_at is
  'When the upstream availability was observed. Failed refreshes do not change this value or delete the snapshot.';

alter table public.product_presentations enable row level security;
alter table public.availability_snapshots enable row level security;

create policy product_presentations_authenticated_read
  on public.product_presentations for select to authenticated using (true);
create policy availability_snapshots_authenticated_read
  on public.availability_snapshots for select to authenticated using (true);

