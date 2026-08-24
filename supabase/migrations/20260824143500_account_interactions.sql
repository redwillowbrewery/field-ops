create table if not exists public.account_interactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  interaction_type text not null check (interaction_type in ('call','email')),
  target text,
  created_at timestamptz not null default now()
);

create index if not exists account_interactions_account_created_idx
  on public.account_interactions(account_id, created_at desc);

alter table public.account_interactions enable row level security;

create policy "authenticated users can read account interactions"
  on public.account_interactions for select
  to authenticated
  using (true);

create policy "authenticated users can add account interactions"
  on public.account_interactions for insert
  to authenticated
  with check (true);
