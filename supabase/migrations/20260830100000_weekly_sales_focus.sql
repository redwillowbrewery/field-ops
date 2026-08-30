-- Sprint 2A: canonical weekly sales focus and bounded working-list progress.

create type public.weekly_sales_plan_status as enum ('draft', 'active', 'closed');
create type public.weekly_sales_progress_status as enum ('not_contacted', 'contacted', 'follow_up', 'complete');
create type public.account_sales_service_model as enum ('territory', 'managed');

alter table public.accounts
  add column sales_service_model public.account_sales_service_model not null default 'territory';

comment on column public.accounts.sales_service_model is
  'Sales workflow lens only: territory accounts join weekly area pushes; managed accounts are handled through their due actions.';

create table public.weekly_sales_plans (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  title text not null check (char_length(trim(title)) between 1 and 100),
  message text not null default '' check (char_length(message) <= 1000),
  status public.weekly_sales_plan_status not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_start),
  check (extract(isodow from week_start) = 1)
);

create table public.weekly_sales_plan_territories (
  plan_id uuid not null references public.weekly_sales_plans(id) on delete cascade,
  territory_id uuid not null references public.territories(id) on delete restrict,
  primary key (plan_id, territory_id)
);

create table public.weekly_sales_plan_products (
  plan_id uuid not null references public.weekly_sales_plans(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  sales_note text check (char_length(sales_note) <= 240),
  primary key (plan_id, product_id)
);

create table public.weekly_sales_account_progress (
  plan_id uuid not null references public.weekly_sales_plans(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  status public.weekly_sales_progress_status not null default 'not_contacted',
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (plan_id, account_id)
);

create index weekly_sales_plans_week_idx on public.weekly_sales_plans(week_start desc);
create index weekly_sales_progress_status_idx on public.weekly_sales_account_progress(plan_id, status);
create index accounts_sales_service_model_idx on public.accounts(sales_service_model, territory_id);

create trigger weekly_sales_plans_set_updated_at before update on public.weekly_sales_plans
for each row execute function public.set_updated_at();

alter table public.weekly_sales_plans enable row level security;
alter table public.weekly_sales_plan_territories enable row level security;
alter table public.weekly_sales_plan_products enable row level security;
alter table public.weekly_sales_account_progress enable row level security;

create policy "Authenticated users can read weekly sales plans" on public.weekly_sales_plans
for select to authenticated using (true);
create policy "Authenticated users can create weekly sales plans" on public.weekly_sales_plans
for insert to authenticated with check (created_by = auth.uid());
create policy "Authenticated users can update weekly sales plans" on public.weekly_sales_plans
for update to authenticated using (true) with check (true);

create policy "Authenticated users can read weekly plan territories" on public.weekly_sales_plan_territories
for select to authenticated using (true);
create policy "Authenticated users can edit weekly plan territories" on public.weekly_sales_plan_territories
for all to authenticated using (true) with check (true);
create policy "Authenticated users can read weekly plan products" on public.weekly_sales_plan_products
for select to authenticated using (true);
create policy "Authenticated users can edit weekly plan products" on public.weekly_sales_plan_products
for all to authenticated using (true) with check (true);

create policy "Authenticated users can read weekly progress" on public.weekly_sales_account_progress
for select to authenticated using (true);
create policy "Authenticated users can add valid weekly progress" on public.weekly_sales_account_progress
for insert to authenticated with check (
  updated_by = auth.uid() and exists (
    select 1 from public.accounts a
    join public.weekly_sales_plan_territories pt on pt.territory_id = a.territory_id
    where pt.plan_id = plan_id and a.id = account_id
      and a.sales_service_model = 'territory' and a.active
      and coalesce(a.brewery_available, true) and a.relationship_status <> 'closed'
  )
);
create policy "Authenticated users can update weekly progress" on public.weekly_sales_account_progress
for update to authenticated using (true) with check (updated_by = auth.uid());

