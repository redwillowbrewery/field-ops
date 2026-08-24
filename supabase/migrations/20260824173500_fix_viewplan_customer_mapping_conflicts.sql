-- Brewery Ops - make ViewPlan customer mapping reconciliation idempotent

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
  contact_item jsonb;
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

    -- There must be exactly one ViewPlan identity per canonical account. Legacy
    -- imports may have left an older external_id on the same account, so remove
    -- that stale bridge before asserting the current ViewPlan customer ID.
    delete from public.account_external_ids
     where account_id = account_uuid
       and system = 'viewplan'
       and external_id <> source_id::text;

    insert into public.account_external_ids(account_id, system, external_id)
      values(account_uuid, 'viewplan', source_id::text)
      on conflict (system, external_id) do update set
        account_id = excluded.account_id;

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

comment on function public.sync_viewplan_customers(jsonb) is
  'Batch merges ViewPlan-owned customer/contact fields and reconciles each canonical account to exactly one ViewPlan external identity.';
