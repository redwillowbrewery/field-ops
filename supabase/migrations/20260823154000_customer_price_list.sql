create or replace function public.customer_effective_price_list(p_account_id uuid)
returns table(
  product_id uuid,
  product_name text,
  product_variant_id uuid,
  package_type text,
  broad_format text,
  list_price numeric,
  customer_price numeric,
  pricing_source text,
  pricing_formula text,
  effective_discount numeric,
  price_list_code text
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as product_id,
    p.name::text as product_name,
    v.id as product_variant_id,
    v.package_type::text,
    v.broad_format::text,
    ep.list_price,
    ep.customer_price,
    ep.pricing_source,
    ep.pricing_formula,
    ep.effective_discount,
    ep.price_list_code
  from public.product_variants v
  join public.products p on p.id = v.product_id
  cross join lateral public.effective_customer_variant_price(p_account_id, v.id) ep
  where v.allow_sale = true
    and coalesce(ep.customer_price, ep.list_price) is not null
  order by p.name, v.broad_format, v.package_type;
$$;

grant execute on function public.customer_effective_price_list(uuid) to authenticated;
