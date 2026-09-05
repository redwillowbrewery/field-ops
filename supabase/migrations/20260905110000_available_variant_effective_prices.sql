create or replace function public.customer_effective_prices_for_variants(
  p_account_id uuid,
  p_product_variant_ids uuid[]
)
returns table(
  product_variant_id uuid,
  list_price numeric,
  customer_price numeric
)
language sql
security definer
set search_path = public
as $$
  select
    v.id as product_variant_id,
    ep.list_price,
    ep.customer_price
  from public.product_variants v
  cross join lateral public.effective_customer_variant_price(p_account_id, v.id) ep
  where v.id = any(coalesce(p_product_variant_ids, array[]::uuid[]))
    and v.allow_sale = true
    and coalesce(ep.customer_price, ep.list_price) is not null;
$$;

revoke all on function public.customer_effective_prices_for_variants(uuid, uuid[]) from public;
revoke all on function public.customer_effective_prices_for_variants(uuid, uuid[]) from anon;
grant execute on function public.customer_effective_prices_for_variants(uuid, uuid[]) to authenticated;
grant execute on function public.customer_effective_prices_for_variants(uuid, uuid[]) to service_role;
