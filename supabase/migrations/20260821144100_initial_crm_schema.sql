-- ============================================================
-- FIELD OPS - INITIAL CRM SCHEMA
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================

create type account_relationship_status as enum (
  'prospect',
  'current',
  'cooling',
  'lapsed',
  'dormant',
  'closed'
);

create type appointment_status as enum (
  'planned',
  'completed',
  'cancelled',
  'no_show'
);

create type visit_outcome as enum (
  'good',
  'neutral',
  'problem',
  'opportunity'
);

create type task_status as enum (
  'open',
  'completed',
  'cancelled'
);

create type task_type as enum (
  'call',
  'email',
  'quote',
  'samples',
  'revisit',
  'order',
  'other'
);

-- ============================================================
-- USER PROFILES
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- TERRITORIES
-- ============================================================

create table territories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(name)
);

-- ============================================================
-- ACCOUNTS
-- ============================================================

create table accounts (
  id uuid primary key default gen_random_uuid(),
  brewery_customer_id integer unique,
  brewery_customer_ref text,
  external_ref text,
  name text not null,
  classification text,
  relationship_status account_relationship_status not null default 'prospect',
  brewery_status text,
  brewery_available boolean,
  territory_id uuid references territories(id) on delete set null,
  assigned_rep_id uuid references profiles(id) on delete set null,
  address_line_1 text,
  address_line_2 text,
  town text,
  county text,
  postcode text,
  country text default 'United Kingdom',
  latitude double precision,
  longitude double precision,
  geocoded_at timestamptz,
  phone text,
  mobile text,
  email text,
  website text,
  preferred_contact_method text,
  do_not_call boolean not null default false,
  do_not_email boolean not null default false,
  notes text,
  priority smallint check (priority between 1 and 5),
  last_visit_at timestamptz,
  next_visit_due date,
  active boolean not null default true,
  brewery_last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CONTACTS
-- ============================================================

create table contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  first_name text,
  last_name text,
  full_name text,
  job_title text,
  email text,
  phone text,
  mobile text,
  preferred_contact_method text,
  is_primary boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- SALES SNAPSHOT
-- Read-only-ish information imported from BMS
-- ============================================================

create table account_sales_snapshot (
  account_id uuid primary key references accounts(id) on delete cascade,
  total_orders integer,
  total_spend numeric(12,2),
  average_order_value numeric(12,2),
  maximum_order_value numeric(12,2),
  first_order_date date,
  last_order_date date,
  last_delivery_date date,
  years_as_customer numeric(6,2),
  imported_at timestamptz not null default now()
);

-- ============================================================
-- APPOINTMENTS
-- ============================================================

create table appointments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  purpose text,
  status appointment_status not null default 'planned',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

-- ============================================================
-- VISITS
-- ============================================================

create table visits (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  salesperson_id uuid references profiles(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  outcome visit_outcome,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or started_at is null or completed_at >= started_at)
);

-- ============================================================
-- TASKS / FOLLOW-UP ACTIONS
-- ============================================================

create table tasks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  visit_id uuid references visits(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,
  task_type task_type not null default 'other',
  title text not null,
  notes text,
  due_at timestamptz,
  status task_status not null default 'open',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index accounts_name_idx on accounts(name);
create index accounts_postcode_idx on accounts(postcode);
create index accounts_territory_idx on accounts(territory_id);
create index accounts_relationship_status_idx on accounts(relationship_status);
create index accounts_assigned_rep_idx on accounts(assigned_rep_id);
create index contacts_account_idx on contacts(account_id);
create index appointments_account_idx on appointments(account_id);
create index appointments_assigned_starts_idx on appointments(assigned_to, starts_at);
create index visits_account_idx on visits(account_id);
create index visits_salesperson_idx on visits(salesperson_id);
create index visits_completed_idx on visits(completed_at);
create index tasks_account_idx on tasks(account_id);
create index tasks_assigned_due_idx on tasks(assigned_to, due_at);
create index tasks_status_idx on tasks(status);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on profiles
for each row execute function set_updated_at();

create trigger territories_set_updated_at
before update on territories
for each row execute function set_updated_at();

create trigger accounts_set_updated_at
before update on accounts
for each row execute function set_updated_at();

create trigger contacts_set_updated_at
before update on contacts
for each row execute function set_updated_at();

create trigger appointments_set_updated_at
before update on appointments
for each row execute function set_updated_at();

create trigger visits_set_updated_at
before update on visits
for each row execute function set_updated_at();

create trigger tasks_set_updated_at
before update on tasks
for each row execute function set_updated_at();
