create table if not exists public.account_package_pricing_rules (
  account_id uuid not null references public.accounts(id) on delete cascade,
  package_type text not null,
  fixed_price numeric(12,2),
  formula text,
  apply_line_discount boolean not null default true,
  source_system text not null,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (account_id, package_type)
);

create index if not exists account_package_pricing_rules_account_idx
  on public.account_package_pricing_rules(account_id);

alter table public.account_package_pricing_rules enable row level security;

create policy "Authenticated users can read account package pricing rules"
  on public.account_package_pricing_rules
  for select to authenticated
  using (true);
