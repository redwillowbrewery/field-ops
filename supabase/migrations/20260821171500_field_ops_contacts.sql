-- ============================================================
-- FIELD OPS - CRM OWNED CONTACTS
-- ============================================================

alter table contacts
  add column if not exists source text not null default 'field_ops';

update contacts
set source = 'viewplan'
where brewery_contact_slot is not null;

alter table contacts
  drop constraint if exists contacts_source_check;

alter table contacts
  add constraint contacts_source_check
  check (source in ('viewplan', 'field_ops'));

alter table contacts enable row level security;

-- Reps can add CRM-owned contacts they meet in the field.
drop policy if exists "Authenticated users can create field ops contacts" on contacts;
create policy "Authenticated users can create field ops contacts"
on contacts for insert
to authenticated
with check (source = 'field_ops' and brewery_contact_slot is null);

-- Reps can edit CRM-owned contacts. ViewPlan contacts remain source-owned.
drop policy if exists "Authenticated users can update field ops contacts" on contacts;
create policy "Authenticated users can update field ops contacts"
on contacts for update
to authenticated
using (source = 'field_ops' and brewery_contact_slot is null)
with check (source = 'field_ops' and brewery_contact_slot is null);
