-- ============================================================
-- FIELD OPS - BMS CUSTOMER IMPORT STAGING
-- ============================================================
-- Raw BMS customer exports are staged here before being transformed into
-- CRM-owned tables. This keeps imports repeatable and prevents source data
-- from overwriting field-sales notes, visits, tasks or appointments.

create table import_batches (
  id uuid primary key default gen_random_uuid(),

  source_system text not null default 'ViewPlan BMS',
  source_file_name text,
  source_file_sha256 text,

  status text not null default 'staged'
    check (status in ('staged', 'processing', 'completed', 'failed')),

  row_count integer,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,

  notes text,
  started_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now()
);

create table customer_import_staging (
  id uuid primary key default gen_random_uuid(),

  batch_id uuid not null
    references import_batches(id)
    on delete cascade,

  source_row_number integer not null,

  -- BMS customer ID is copied out of the raw payload so rows can be indexed
  -- and matched without repeatedly reading JSON.
  brewery_customer_id integer,

  -- Complete source row exactly as supplied by the export. Keeping the raw
  -- payload makes the import auditable and lets us add mappings later without
  -- requiring another export.
  raw_data jsonb not null,

  -- Normalised/transformed data produced by the import process before it is
  -- written into accounts, contacts, territories and sales snapshots.
  transformed_data jsonb,

  status text not null default 'pending'
    check (status in ('pending', 'ready', 'imported', 'skipped', 'error')),

  error_message text,

  created_at timestamptz not null default now(),
  processed_at timestamptz,

  unique(batch_id, source_row_number)
);

create index customer_import_staging_batch_idx
  on customer_import_staging(batch_id);

create index customer_import_staging_brewery_customer_idx
  on customer_import_staging(brewery_customer_id);

create index customer_import_staging_status_idx
  on customer_import_staging(status);

-- Track source-system fields on accounts that are useful for later refreshes
-- but should not be treated as CRM-owned data.
alter table accounts
  add column if not exists brewery_location_zone text,
  add column if not exists brewery_sales_channel text,
  add column if not exists brewery_customer_rep text,
  add column if not exists brewery_telesales_rep text,
  add column if not exists brewery_last_call_date date,
  add column if not exists brewery_next_call_date date,
  add column if not exists brewery_call_days text,
  add column if not exists brewery_call_time text,
  add column if not exists brewery_call_schedule text;

-- Helper for text fields exported by the BMS. The current customer export uses
-- the literal value '119' in many otherwise-empty text fields. We only apply
-- this normalisation to fields known to be textual/optional during transform;
-- the raw staging payload is never altered.
create or replace function normalise_bms_optional_text(value text)
returns text
language sql
immutable
as $$
  select case
    when value is null then null
    when btrim(value) = '' then null
    when btrim(value) = '119' then null
    else btrim(value)
  end;
$$;

comment on table import_batches is
  'One row per brewery-management-system customer export/import run.';

comment on table customer_import_staging is
  'Raw customer export rows staged before transformation into CRM tables.';

comment on function normalise_bms_optional_text(text) is
  'Normalises optional BMS text fields; current exports use literal 119 for many empty values.';
