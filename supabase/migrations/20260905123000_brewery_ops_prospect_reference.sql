-- Transitional exact identity bridge for Brewery Ops-created prospects.
-- Staff copy this reference into ViewPlan's External Ref ID when creating the
-- trading customer; the read-only connector can then retain the original Account.

create sequence if not exists public.brewery_ops_prospect_reference_seq;

alter table public.accounts
  add column if not exists brewery_ops_reference text;

do $$
declare
  account_uuid uuid;
  reference_number bigint;
begin
  for account_uuid in
    select id
    from public.accounts
    where brewery_customer_id is null
      and relationship_status = 'prospect'
      and brewery_ops_reference is null
    order by created_at, id
  loop
    reference_number := nextval('public.brewery_ops_prospect_reference_seq');
    update public.accounts
       set brewery_ops_reference = 'BOP-' || lpad(
         reference_number::text,
         greatest(6, length(reference_number::text)),
         '0'
       )
     where id = account_uuid;
  end loop;
end;
$$;

create unique index if not exists accounts_brewery_ops_reference_key
  on public.accounts(brewery_ops_reference)
  where brewery_ops_reference is not null;

create or replace function public.assign_brewery_ops_prospect_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reference_number bigint;
begin
  if tg_op = 'UPDATE' then
    if old.brewery_ops_reference is distinct from new.brewery_ops_reference then
      raise exception 'Brewery Ops prospect reference is immutable';
    end if;
    return new;
  end if;

  if new.brewery_customer_id is null
     and new.relationship_status = 'prospect'
     and new.brewery_ops_reference is null then
    reference_number := nextval('public.brewery_ops_prospect_reference_seq');
    new.brewery_ops_reference := 'BOP-' || lpad(
      reference_number::text,
      greatest(6, length(reference_number::text)),
      '0'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists accounts_assign_brewery_ops_prospect_reference on public.accounts;
create trigger accounts_assign_brewery_ops_prospect_reference
before insert or update of brewery_ops_reference on public.accounts
for each row execute function public.assign_brewery_ops_prospect_reference();

alter table public.account_external_identity_audit
  alter column linked_by drop not null;

alter table public.account_external_identity_audit
  add column if not exists link_method text not null default 'manual'
    check (link_method in ('manual','connector_reference'));

create or replace function public.sync_viewplan_customers(payload jsonb)
returns table(rows_written integer, max_source_lud timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  account_uuid uuid;
  source_id integer;
  source_lud timestamptz;
  source_reference text;
  contact_item jsonb;
  linked_by_reference boolean;
  written integer := 0;
  max_lud timestamptz := null;
begin
  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'payload must be a JSON array';
  end if;

  for item in select value from jsonb_array_elements(payload)
  loop
    source_id := nullif(item->>'customer_id','')::integer;
    if source_id is null or nullif(btrim(item->>'name'),'') is null then
      continue;
    end if;

    source_lud := nullif(item->>'lud','')::timestamptz;
    if source_lud is not null and (max_lud is null or source_lud > max_lud) then
      max_lud := source_lud;
    end if;

    account_uuid := null;
    linked_by_reference := false;
    source_reference := upper(nullif(btrim(item->>'external_ref'),''));

    select id into account_uuid
    from public.accounts
    where brewery_customer_id = source_id;

    if account_uuid is null and source_reference ~ '^BOP-[0-9]{6,}$' then
      select id into account_uuid
      from public.accounts
      where brewery_ops_reference = source_reference
        and brewery_customer_id is null
      for update;

      linked_by_reference := account_uuid is not null;
    end if;

    if account_uuid is null then
      insert into public.accounts (
        brewery_customer_id, brewery_customer_ref, external_ref, name, classification,
        relationship_status, brewery_available, address_line_1, address_line_2, town,
        county, postcode, phone, email, website, preferred_contact_method,
        do_not_call, do_not_email, brewery_sales_channel, brewery_last_call_date,
        brewery_next_call_date, brewery_call_days, brewery_call_time,
        brewery_call_schedule, brewery_last_synced_at
      ) values (
        source_id,
        nullif(item->>'customer_ref',''),
        nullif(item->>'external_ref',''),
        btrim(item->>'name'),
        nullif(item->>'classification',''),
        case
          when coalesce((item->>'is_available')::boolean,false) = false then 'closed'::account_relationship_status
          when coalesce((item->>'is_prospect')::boolean,false) then 'prospect'::account_relationship_status
          else 'dormant'::account_relationship_status
        end,
        coalesce((item->>'is_available')::boolean,false),
        nullif(item->>'address_line_1',''),
        nullif(item->>'address_line_2',''),
        nullif(item->>'town',''),
        nullif(item->>'county',''),
        nullif(upper(item->>'postcode'),''),
        nullif(item->>'phone',''),
        nullif(lower(item->>'email'),''),
        nullif(item->>'website',''),
        nullif(item->>'preferred_contact_method',''),
        coalesce((item->>'do_not_call')::boolean,false),
        coalesce((item->>'do_not_email')::boolean,false),
        nullif(item->>'sales_channel',''),
        nullif(item->>'last_call_date','')::date,
        nullif(item->>'next_call_date','')::date,
        nullif(item->>'call_days',''),
        nullif(item->>'call_time',''),
        nullif(item->>'call_schedule',''),
        now()
      )
      on conflict (brewery_customer_id) do update set
        brewery_customer_ref = excluded.brewery_customer_ref,
        external_ref = excluded.external_ref,
        name = excluded.name,
        classification = excluded.classification,
        brewery_available = excluded.brewery_available,
        address_line_1 = excluded.address_line_1,
        address_line_2 = excluded.address_line_2,
        town = excluded.town,
        county = excluded.county,
        postcode = excluded.postcode,
        phone = excluded.phone,
        email = excluded.email,
        website = excluded.website,
        preferred_contact_method = excluded.preferred_contact_method,
        do_not_call = excluded.do_not_call,
        do_not_email = excluded.do_not_email,
        brewery_sales_channel = excluded.brewery_sales_channel,
        brewery_last_call_date = excluded.brewery_last_call_date,
        brewery_next_call_date = excluded.brewery_next_call_date,
        brewery_call_days = excluded.brewery_call_days,
        brewery_call_time = excluded.brewery_call_time,
        brewery_call_schedule = excluded.brewery_call_schedule,
        brewery_last_synced_at = now()
      returning id into account_uuid;
    else
      update public.accounts set
        brewery_customer_id = source_id,
        brewery_customer_ref = nullif(item->>'customer_ref',''),
        external_ref = nullif(item->>'external_ref',''),
        name = btrim(item->>'name'),
        classification = nullif(item->>'classification',''),
        brewery_available = coalesce((item->>'is_available')::boolean,false),
        address_line_1 = nullif(item->>'address_line_1',''),
        address_line_2 = nullif(item->>'address_line_2',''),
        town = nullif(item->>'town',''),
        county = nullif(item->>'county',''),
        postcode = nullif(upper(item->>'postcode'),''),
        phone = nullif(item->>'phone',''),
        email = nullif(lower(item->>'email'),''),
        website = nullif(item->>'website',''),
        preferred_contact_method = nullif(item->>'preferred_contact_method',''),
        do_not_call = coalesce((item->>'do_not_call')::boolean,false),
        do_not_email = coalesce((item->>'do_not_email')::boolean,false),
        brewery_sales_channel = nullif(item->>'sales_channel',''),
        brewery_last_call_date = nullif(item->>'last_call_date','')::date,
        brewery_next_call_date = nullif(item->>'next_call_date','')::date,
        brewery_call_days = nullif(item->>'call_days',''),
        brewery_call_time = nullif(item->>'call_time',''),
        brewery_call_schedule = nullif(item->>'call_schedule',''),
        brewery_last_synced_at = now()
      where id = account_uuid;
    end if;

    delete from public.account_external_ids
     where account_id = account_uuid
       and system = 'viewplan'
       and external_id <> source_id::text;

    insert into public.account_external_ids(account_id, system, external_id)
      values(account_uuid, 'viewplan', source_id::text)
      on conflict (system, external_id) do update set
        account_id = excluded.account_id;

    if linked_by_reference then
      insert into public.account_external_identity_audit(
        account_id, system, external_id, linked_by, note, link_method
      ) values (
        account_uuid,
        'viewplan',
        source_id::text,
        null,
        'Matched exact Brewery Ops prospect reference ' || source_reference,
        'connector_reference'
      );
    end if;

    update public.contacts
       set active = false, updated_at = now()
     where account_id = account_uuid
       and brewery_contact_slot between 1 and 5;

    for contact_item in
      select value from jsonb_array_elements(coalesce(item->'contacts','[]'::jsonb))
    loop
      if nullif(contact_item->>'slot','') is null then continue; end if;
      if nullif(btrim(coalesce(contact_item->>'full_name','')),'') is null
         and nullif(btrim(coalesce(contact_item->>'email','')),'') is null
         and nullif(btrim(coalesce(contact_item->>'phone','')),'') is null then
        continue;
      end if;

      insert into public.contacts(
        account_id, brewery_contact_slot, full_name, email, phone, is_primary, active
      ) values (
        account_uuid,
        (contact_item->>'slot')::integer,
        nullif(contact_item->>'full_name',''),
        nullif(lower(contact_item->>'email'),''),
        nullif(contact_item->>'phone',''),
        coalesce((contact_item->>'is_primary')::boolean,false),
        true
      )
      on conflict (account_id, brewery_contact_slot) do update set
        full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone,
        is_primary = excluded.is_primary,
        active = true,
        updated_at = now();
    end loop;

    written := written + 1;
  end loop;

  rows_written := written;
  max_source_lud := max_lud;
  return next;
end;
$$;

revoke all on function public.sync_viewplan_customers(jsonb) from public;
grant execute on function public.sync_viewplan_customers(jsonb) to service_role;

comment on column public.accounts.brewery_ops_reference is
  'Immutable Brewery Ops prospect reference copied into ViewPlan External Ref ID for exact read-only reconciliation.';

comment on function public.sync_viewplan_customers(jsonb) is
  'Batch merges ViewPlan-owned customer/contact fields, first reconciling an exact BOP reference to its canonical Brewery Ops Account.';
