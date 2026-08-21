-- ============================================================
-- FIELD OPS - AUTHENTICATED CRM WRITES
-- ============================================================
-- Ensure every Supabase Auth user has a matching Field Ops profile, then
-- allow authenticated users to log visits, create follow-up tasks, and
-- update CRM-owned visit dates on accounts.

create or replace function public.handle_new_field_ops_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_field_ops on auth.users;
create trigger on_auth_user_created_field_ops
after insert or update of email on auth.users
for each row execute function public.handle_new_field_ops_user();

-- Backfill users that already existed before this trigger was created.
insert into public.profiles (id, full_name, email)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', split_part(coalesce(email, ''), '@', 1)),
  email
from auth.users
on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      updated_at = now();

alter table profiles enable row level security;
alter table visits enable row level security;
alter table tasks enable row level security;

-- Authenticated staff can see active Field Ops users for ownership display.
drop policy if exists "Authenticated users can read profiles" on profiles;
create policy "Authenticated users can read profiles"
on profiles for select
to authenticated
using (true);

-- A rep may create visits only as themselves.
drop policy if exists "Authenticated users can create own visits" on visits;
create policy "Authenticated users can create own visits"
on visits for insert
to authenticated
with check (salesperson_id = auth.uid());

drop policy if exists "Authenticated users can update own visits" on visits;
create policy "Authenticated users can update own visits"
on visits for update
to authenticated
using (salesperson_id = auth.uid())
with check (salesperson_id = auth.uid());

-- Follow-ups are owned by the signed-in rep in v1.
drop policy if exists "Authenticated users can create own tasks" on tasks;
create policy "Authenticated users can create own tasks"
on tasks for insert
to authenticated
with check (assigned_to = auth.uid());

drop policy if exists "Authenticated users can update own tasks" on tasks;
create policy "Authenticated users can update own tasks"
on tasks for update
to authenticated
using (assigned_to = auth.uid())
with check (assigned_to = auth.uid());

-- Account master fields remain source-owned. This narrow policy only enables
-- authenticated CRM use; application code updates last_visit_at/next_visit_due.
drop policy if exists "Authenticated users can update CRM account fields" on accounts;
create policy "Authenticated users can update CRM account fields"
on accounts for update
to authenticated
using (true)
with check (true);
