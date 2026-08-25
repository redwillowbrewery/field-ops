-- Brewery Ops - satisfy guarded DELETE policy inside container snapshot RPC

create or replace function public.sync_viewplan_containers(payload jsonb)
returns table(
  source_rows integer,
  mapped_rows integer,
  unmatched_customers integer,
  collectible_rows integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  account_uuid uuid;
  source_customer_id integer;
  package_type_value text;
  returnable_value boolean;
  source_count integer := 0;
  mapped_count integer := 0;
  collectible_count integer := 0;
  unmatched_ids integer[] := '{}';
begin
  if payload is null or jsonb_typeof(payload) <> 'array' then
    raise exception 'payload must be a JSON array';
  end if;

  source_count := jsonb_array_length(payload);

  -- Validate the customer mapping before touching the existing snapshot.
  for item in select value from jsonb_array_elements(payload)
  loop
    source_customer_id := nullif(item->>'viewplan_customer_id','')::integer;
    account_uuid := null;

    if source_customer_id is not null then
      select a.id into account_uuid
      from public.accounts a
      where a.brewery_customer_id = source_customer_id
      limit 1;

      if account_uuid is null then
        select x.account_id into account_uuid
        from public.account_external_ids x
        where x.system = 'viewplan'
          and x.external_id = source_customer_id::text
        limit 1;
      end if;
    end if;

    if account_uuid is null then
      if source_customer_id is not null and not (source_customer_id = any(unmatched_ids)) then
        unmatched_ids := array_append(unmatched_ids, source_customer_id);
      end if;
    else
      mapped_count := mapped_count + 1;
    end if;
  end loop;

  if source_count > 0 and mapped_count = 0 then
    raise exception 'Container sync aborted: ViewPlan returned % off-site rows but none mapped to Brewery Ops accounts. Existing snapshot has NOT been replaced.', source_count;
  end if;

  if source_count > 0 and mapped_count < floor(source_count * 0.90) then
    raise exception 'Container sync aborted: only % of % off-site rows mapped to Brewery Ops accounts. Existing snapshot has NOT been replaced.', mapped_count, source_count;
  end if;

  -- Explicit predicate required by database delete guard.
  delete from public.account_containers_snapshot
  where id is not null;

  for item in select value from jsonb_array_elements(payload)
  loop
    source_customer_id := nullif(item->>'viewplan_customer_id','')::integer;
    account_uuid := null;

    if source_customer_id is not null then
      select a.id into account_uuid
      from public.accounts a
      where a.brewery_customer_id = source_customer_id
      limit 1;

      if account_uuid is null then
        select x.account_id into account_uuid
        from public.account_external_ids x
        where x.system = 'viewplan'
          and x.external_id = source_customer_id::text
        limit 1;
      end if;
    end if;

    if account_uuid is null then
      continue;
    end if;

    package_type_value := coalesce(item->>'container_type','');
    select c.is_returnable into returnable_value
    from public.packaging_type_classification c
    where c.package_type = package_type_value;
    returnable_value := coalesce(returnable_value, false);

    insert into public.account_containers_snapshot (
      account_id,
      viewplan_packaging_inventory_id,
      viewplan_customer_id,
      viewplan_item_no,
      container_type,
      contents,
      gyle,
      package_date,
      best_before,
      stock_location,
      off_site_date,
      off_site_days,
      order_no,
      source_customer_display,
      customer_town,
      customer_postcode,
      delivery_postcode,
      customer_class,
      location_zone,
      dispatched,
      delivered,
      usage_count,
      leased,
      lease_expiry,
      serial_no,
      comment,
      lost,
      on_site,
      is_empty,
      blocked,
      deleted,
      is_returnable,
      imported_at
    ) values (
      account_uuid,
      nullif(item->>'viewplan_packaging_inventory_id','')::bigint,
      source_customer_id,
      coalesce(nullif(item->>'viewplan_item_no',''), item->>'viewplan_packaging_inventory_id'),
      package_type_value,
      nullif(item->>'contents',''),
      nullif(item->>'gyle',''),
      nullif(item->>'package_date','')::date,
      nullif(item->>'best_before','')::date,
      nullif(item->>'stock_location',''),
      nullif(item->>'off_site_date','')::date,
      nullif(item->>'off_site_days','')::integer,
      nullif(item->>'order_no',''),
      nullif(item->>'source_customer_display',''),
      nullif(item->>'customer_town',''),
      nullif(item->>'customer_postcode',''),
      nullif(item->>'delivery_postcode',''),
      nullif(item->>'customer_class',''),
      nullif(item->>'location_zone',''),
      coalesce((item->>'dispatched')::boolean,false),
      coalesce((item->>'delivered')::boolean,false),
      nullif(item->>'usage_count','')::integer,
      coalesce((item->>'leased')::boolean,false),
      nullif(item->>'lease_expiry','')::date,
      nullif(item->>'serial_no',''),
      nullif(item->>'comment',''),
      coalesce((item->>'lost')::boolean,false),
      coalesce((item->>'on_site')::boolean,false),
      coalesce((item->>'is_empty')::boolean,false),
      coalesce((item->>'blocked')::boolean,false),
      coalesce((item->>'deleted')::boolean,false),
      returnable_value,
      coalesce(nullif(item->>'imported_at','')::timestamptz, now())
    );

    if returnable_value and not coalesce((item->>'lost')::boolean,false) then
      collectible_count := collectible_count + 1;
    end if;
  end loop;

  source_rows := source_count;
  mapped_rows := mapped_count;
  unmatched_customers := coalesce(array_length(unmatched_ids,1),0);
  collectible_rows := collectible_count;
  return next;
end;
$$;

revoke all on function public.sync_viewplan_containers(jsonb) from public;
grant execute on function public.sync_viewplan_containers(jsonb) to service_role;
