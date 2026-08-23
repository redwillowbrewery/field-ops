create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abv numeric(5,2),
  status text not null default 'active',
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_external_ids (
  product_id uuid not null references public.products(id) on delete cascade,
  system text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  primary key (system, external_id),
  unique (product_id, system)
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  broad_format text not null check (broad_format in ('cask','keg','can','other')),
  package_type text not null,
  volume_litres numeric(12,3),
  pack_quantity integer,
  allow_sale boolean not null default true,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, package_type)
);

create table if not exists public.product_variant_external_ids (
  product_variant_id uuid not null references public.product_variants(id) on delete cascade,
  system text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  primary key (system, external_id),
  unique (product_variant_id, system)
);

create table if not exists public.price_lists (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  source_system text,
  source_external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_prices (
  product_variant_id uuid not null references public.product_variants(id) on delete cascade,
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  price numeric(12,2),
  source_system text not null,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_variant_id, price_list_id)
);

create table if not exists public.account_external_ids (
  account_id uuid not null references public.accounts(id) on delete cascade,
  system text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  primary key (system, external_id),
  unique (account_id, system)
);

create table if not exists public.account_pricing (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  price_list_id uuid references public.price_lists(id) on delete set null,
  discount numeric(8,5) not null default 0,
  discount_application integer,
  parent_pricing_account_id uuid references public.accounts(id) on delete set null,
  source_system text,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.account_price_overrides (
  account_id uuid not null references public.accounts(id) on delete cascade,
  product_variant_id uuid not null references public.product_variants(id) on delete cascade,
  fixed_price numeric(12,2),
  formula text,
  apply_line_discount boolean not null default true,
  source_system text not null,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (account_id, product_variant_id)
);

create index if not exists products_name_idx on public.products(lower(name));
create index if not exists product_variants_product_idx on public.product_variants(product_id);
create index if not exists product_variants_format_idx on public.product_variants(broad_format);
create index if not exists account_external_ids_account_idx on public.account_external_ids(account_id);

insert into public.price_lists(code,name,source_system,source_external_id)
values
 ('WHOLESALE_1','Wholesale 1','viewplan','1'),
 ('WHOLESALE_2','Wholesale 2','viewplan','2'),
 ('WHOLESALE_3','Wholesale 3','viewplan','3'),
 ('WHOLESALE_4','Wholesale 4','viewplan','4'),
 ('WHOLESALE_5','Wholesale 5','viewplan','5'),
 ('WHOLESALE_6','Wholesale 6','viewplan','6'),
 ('WHOLESALE_7','Wholesale 7','viewplan','7'),
 ('WHOLESALE_8','Wholesale 8','viewplan','8'),
 ('WHOLESALE_9','Wholesale 9','viewplan','9'),
 ('WHOLESALE_10','Wholesale 10','viewplan','10')
on conflict (code) do update set
 name=excluded.name,
 source_system=excluded.source_system,
 source_external_id=excluded.source_external_id,
 updated_at=now();

alter table public.products enable row level security;
alter table public.product_external_ids enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_variant_external_ids enable row level security;
alter table public.price_lists enable row level security;
alter table public.product_prices enable row level security;
alter table public.account_external_ids enable row level security;
alter table public.account_pricing enable row level security;
alter table public.account_price_overrides enable row level security;

create policy "Authenticated users can read products" on public.products for select to authenticated using (true);
create policy "Authenticated users can read product external ids" on public.product_external_ids for select to authenticated using (true);
create policy "Authenticated users can read product variants" on public.product_variants for select to authenticated using (true);
create policy "Authenticated users can read product variant external ids" on public.product_variant_external_ids for select to authenticated using (true);
create policy "Authenticated users can read price lists" on public.price_lists for select to authenticated using (true);
create policy "Authenticated users can read product prices" on public.product_prices for select to authenticated using (true);
create policy "Authenticated users can read account external ids" on public.account_external_ids for select to authenticated using (true);
create policy "Authenticated users can read account pricing" on public.account_pricing for select to authenticated using (true);
create policy "Authenticated users can read account price overrides" on public.account_price_overrides for select to authenticated using (true);
