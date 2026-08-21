-- ============================================================
-- FIELD OPS - STABLE BMS CONTACT IMPORT KEY
-- ============================================================
-- ViewPlan exports contacts in fixed slots (Primary Contact, Contact 2 ... 5).
-- Preserve the source slot so subsequent imports update those contacts rather
-- than creating duplicates. CRM-created contacts leave this column NULL.

alter table contacts
  add column if not exists brewery_contact_slot smallint
    check (brewery_contact_slot between 1 and 5);

alter table contacts
  add constraint contacts_account_brewery_slot_unique
    unique (account_id, brewery_contact_slot);

comment on column contacts.brewery_contact_slot is
  'ViewPlan BMS contact slot 1-5. NULL for contacts created directly in Field Ops.';
