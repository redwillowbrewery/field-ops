create or replace function public.materialize_viewplan_package_pricing()
returns table(materialized_count bigint, exact_preserved_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_materialized bigint := 0;
  v_exact bigint := 0;
begin
  delete from public.account_price_overrides
  where source_system = 'viewplan:package_rule';

  select count(*) into v_exact
  from public.account_package_pricing_rules r
  join public.product_variants v
    on v.package_type = r.package_type
   and v.allow_sale = true
  join public.account_price_overrides o
    on o.account_id = r.account_id
   and o.product_variant_id = v.id
   and o.source_system = 'viewplan';

  insert into public.account_price_overrides (
    account_id,
    product_variant_id,
    fixed_price,
    formula,
    apply_line_discount,
    source_system,
    source_updated_at,
    updated_at
  )
  select
    r.account_id,
    v.id,
    r.fixed_price,
    r.formula,
    r.apply_line_discount,
    'viewplan:package_rule',
    r.source_updated_at,
    now()
  from public.account_package_pricing_rules r
  join public.product_variants v
    on v.package_type = r.package_type
   and v.allow_sale = true
  where not exists (
    select 1
    from public.account_price_overrides o
    where o.account_id = r.account_id
      and o.product_variant_id = v.id
      and o.source_system = 'viewplan'
  )
  on conflict (account_id, product_variant_id) do nothing;

  get diagnostics v_materialized = row_count;

  return query select v_materialized, v_exact;
end;
$$;

grant execute on function public.materialize_viewplan_package_pricing() to authenticated;

select * from public.materialize_viewplan_package_pricing();
