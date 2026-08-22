create table if not exists public.account_notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists account_notes_account_created_idx
  on public.account_notes(account_id, created_at desc);

alter table public.account_notes enable row level security;

create policy "Authenticated users can read account notes"
  on public.account_notes for select to authenticated using (true);

create policy "Authenticated users can add account notes"
  on public.account_notes for insert to authenticated
  with check (author_id is null or author_id = auth.uid());
