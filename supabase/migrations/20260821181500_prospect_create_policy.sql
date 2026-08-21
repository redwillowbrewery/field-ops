-- ============================================================
-- FIELD OPS - PROSPECT CREATION
-- ============================================================
-- Reps may create CRM-owned prospects while out in the field.
-- Imported/BMS account identity remains protected.

alter table accounts enable row level security;

drop policy if exists "Authenticated users can create own prospects" on accounts;
create policy "Authenticated users can create own prospects"
on accounts for insert
to authenticated
with check (
  relationship_status = 'prospect'
  and brewery_customer_id is null
  and brewery_customer_ref is null
  and assigned_rep_id = auth.uid()
);
