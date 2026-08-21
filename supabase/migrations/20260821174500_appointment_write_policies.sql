-- ============================================================
-- FIELD OPS - APPOINTMENT WRITES
-- ============================================================

alter table appointments enable row level security;

-- Reps create appointments assigned to themselves.
drop policy if exists "Authenticated users can create own appointments" on appointments;
create policy "Authenticated users can create own appointments"
on appointments for insert
to authenticated
with check (assigned_to = auth.uid());

-- Reps can update appointments assigned to themselves.
drop policy if exists "Authenticated users can update own appointments" on appointments;
create policy "Authenticated users can update own appointments"
on appointments for update
to authenticated
using (assigned_to = auth.uid())
with check (assigned_to = auth.uid());
