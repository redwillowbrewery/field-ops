-- ============================================================
-- FIELD OPS - AUTHENTICATED CRM READ ACCESS
-- ============================================================
-- CRM/customer data must never be anonymously readable.
-- Signed-in Supabase users may read the core Field Ops data.

alter table accounts enable row level security;
alter table contacts enable row level security;
alter table account_sales_snapshot enable row level security;
alter table territories enable row level security;
alter table appointments enable row level security;
alter table visits enable row level security;
alter table tasks enable row level security;
alter table profiles enable row level security;

drop policy if exists "authenticated read accounts" on accounts;
create policy "authenticated read accounts" on accounts
  for select to authenticated using (true);

drop policy if exists "authenticated read contacts" on contacts;
create policy "authenticated read contacts" on contacts
  for select to authenticated using (true);

drop policy if exists "authenticated read sales snapshots" on account_sales_snapshot;
create policy "authenticated read sales snapshots" on account_sales_snapshot
  for select to authenticated using (true);

drop policy if exists "authenticated read territories" on territories;
create policy "authenticated read territories" on territories
  for select to authenticated using (true);

drop policy if exists "authenticated read appointments" on appointments;
create policy "authenticated read appointments" on appointments
  for select to authenticated using (true);

drop policy if exists "authenticated read visits" on visits;
create policy "authenticated read visits" on visits
  for select to authenticated using (true);

drop policy if exists "authenticated read tasks" on tasks;
create policy "authenticated read tasks" on tasks
  for select to authenticated using (true);

drop policy if exists "authenticated read profiles" on profiles;
create policy "authenticated read profiles" on profiles
  for select to authenticated using (true);
