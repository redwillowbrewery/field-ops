-- Reconcile an external Product Variant identity across both uniqueness rules in
-- one transaction. This supports authoritative adapter corrections without a
-- delete-then-insert gap that could leave a known mapping missing.

create or replace function public.reconcile_product_variant_external_id(
  p_product_variant_id uuid,
  p_system text,
  p_external_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_product_variant_id is null
     or nullif(trim(p_system), '') is null
     or nullif(trim(p_external_id), '') is null then
    raise exception 'Product Variant, system and external ID are required';
  end if;

  if not exists (
    select 1 from public.product_variants where id = p_product_variant_id
  ) then
    raise exception 'Unknown canonical Product Variant %', p_product_variant_id;
  end if;

  delete from public.product_variant_external_ids
  where product_variant_id = p_product_variant_id
    and system = trim(p_system)
    and external_id <> trim(p_external_id);

  insert into public.product_variant_external_ids (
    product_variant_id,
    system,
    external_id
  ) values (
    p_product_variant_id,
    trim(p_system),
    trim(p_external_id)
  )
  on conflict (system, external_id) do update
  set product_variant_id = excluded.product_variant_id;
end;
$$;

revoke all on function public.reconcile_product_variant_external_id(uuid, text, text) from public;
grant execute on function public.reconcile_product_variant_external_id(uuid, text, text) to service_role;

