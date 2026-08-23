create table if not exists public.viewplan_current_prices (
  brew_type_id integer not null,
  beer_name text not null,
  packaging_type text not null,
  wholesale_price numeric(12,2),
  wholesale_price2 numeric(12,2),
  wholesale_price3 numeric(12,2),
  wholesale_price4 numeric(12,2),
  wholesale_price5 numeric(12,2),
  wholesale_price6 numeric(12,2),
  wholesale_price7 numeric(12,2),
  wholesale_price8 numeric(12,2),
  wholesale_price9 numeric(12,2),
  wholesale_price10 numeric(12,2),
  allow_sale boolean not null default true,
  synced_at timestamptz not null default now(),
  primary key (brew_type_id, packaging_type)
);

create index if not exists viewplan_current_prices_beer_idx
  on public.viewplan_current_prices (lower(beer_name));

alter table public.viewplan_current_prices enable row level security;

create policy "Authenticated users can read ViewPlan current prices"
  on public.viewplan_current_prices for select to authenticated using (true);
