-- Sprint 0: canonical Package model.
-- Package lifecycle/procurement semantics belong to Brewery Ops and must not be inferred by UI code.

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  broad_format text not null check (broad_format in ('cask','keg','can','bottle','other')),
  package_system text,
  capacity_litres numeric(10,3),
  lifecycle text not null check (lifecycle in ('brewery_returnable','third_party_returnable','one_way','non_container')),
  procurement_mode text not null check (procurement_mode in ('consumable','reusable_asset','externally_supplied','none')),
  draught boolean not null default false,
  active boolean not null default true,
  source_system text,
  source_reference text,
  material_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_reference)
);

comment on table public.packages is 'Canonical Brewery Ops package semantics. External systems are adapters; their flags/names are not lifecycle authority.';
comment on column public.packages.package_system is 'Optional physical/commercial system, e.g. Firkin, E-Cask, Steel, E-Keg, Key Keg, Kegstar, Poly Keg.';
comment on column public.packages.lifecycle is 'Physical package lifecycle, deliberately separate from batch/product traceability.';
comment on column public.packages.procurement_mode is 'How packaging capacity/material is replenished/planned.';
comment on column public.packages.material_id is 'Reserved future link to canonical Material for packaging consumables/MRP.';

alter table public.product_variants
  add column if not exists package_id uuid references public.packages(id);

create index if not exists product_variants_package_id_idx
  on public.product_variants(package_id);

-- Read access follows the existing authenticated catalogue model. Writes are server-side only.
alter table public.packages enable row level security;

drop policy if exists packages_authenticated_read on public.packages;
create policy packages_authenticated_read
  on public.packages
  for select
  to authenticated
  using (true);

-- Guardrail: once migration/backfill is complete this audit view should return zero live variants.
create or replace view public.product_variants_without_package as
select
  pv.id,
  pv.product_id,
  pv.package_type,
  pv.broad_format,
  pv.allow_sale
from public.product_variants pv
where pv.allow_sale = true
  and pv.package_id is null;
