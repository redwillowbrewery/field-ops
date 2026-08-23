create or replace function public.effective_customer_variant_price(
  p_account_id uuid,
  p_product_variant_id uuid
)
returns table(
  list_price numeric,
  customer_price numeric,
  pricing_source text,
  pricing_formula text,
  effective_discount numeric,
  price_list_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_own public.account_pricing%rowtype;
  v_parent public.account_pricing%rowtype;
  v_effective public.account_pricing%rowtype;
  v_rule_account uuid;
  v_package text;
  v_standard numeric;
  v_selected numeric;
  v_override record;
  v_formula text;
  v_value numeric;
  v_discount numeric := 0;
  v_price_list_code text;
begin
  select * into v_own from public.account_pricing where account_id = p_account_id;

  if v_own.parent_pricing_account_id is not null then
    select * into v_parent from public.account_pricing where account_id = v_own.parent_pricing_account_id;
  end if;

  if v_parent.account_id is not null then
    v_effective := v_parent;
  else
    v_effective := v_own;
  end if;

  v_discount := coalesce(v_effective.discount, 0);

  select package_type into v_package
  from public.product_variants
  where id = p_product_variant_id;

  select pp.price into v_standard
  from public.product_prices pp
  join public.price_lists pl on pl.id = pp.price_list_id
  where pp.product_variant_id = p_product_variant_id
    and pl.code = 'WHOLESALE_1'
  limit 1;

  if v_effective.price_list_id is not null then
    select pp.price, pl.code into v_selected, v_price_list_code
    from public.product_prices pp
    join public.price_lists pl on pl.id = pp.price_list_id
    where pp.product_variant_id = p_product_variant_id
      and pp.price_list_id = v_effective.price_list_id
    limit 1;
  end if;

  if v_selected is null then
    v_selected := v_standard;
    v_price_list_code := 'WHOLESALE_1';
  end if;

  -- Child account rules always win, even when the base price list is inherited.
  select fixed_price, formula, apply_line_discount, 'exact'::text as source
    into v_override
  from public.account_price_overrides
  where account_id = p_account_id
    and product_variant_id = p_product_variant_id
    and source_system = 'viewplan'
  limit 1;

  if not found then
    select fixed_price, formula, apply_line_discount, 'package'::text as source
      into v_override
    from public.account_package_pricing_rules
    where account_id = p_account_id
      and package_type = v_package
      and source_system = 'viewplan'
    limit 1;
  end if;

  -- If using parent pricing and the child has no explicit rule, inherit parent rules.
  if v_override.source is null and v_parent.account_id is not null then
    select fixed_price, formula, apply_line_discount, 'parent exact'::text as source
      into v_override
    from public.account_price_overrides
    where account_id = v_parent.account_id
      and product_variant_id = p_product_variant_id
      and source_system = 'viewplan'
    limit 1;

    if not found then
      select fixed_price, formula, apply_line_discount, 'parent package'::text as source
        into v_override
      from public.account_package_pricing_rules
      where account_id = v_parent.account_id
        and package_type = v_package
        and source_system = 'viewplan'
      limit 1;
    end if;
  end if;

  if v_override.formula is not null and btrim(v_override.formula) <> '' then
    v_formula := upper(regexp_replace(v_override.formula, '\s+', '', 'g'));

    if v_standard is null then
      v_value := null;
    elsif v_formula = '[STANDARD]' then
      v_value := v_standard;
    elsif v_formula ~ '^\[STANDARD\]\*[0-9]+(\.[0-9]+)?$' then
      v_value := v_standard * substring(v_formula from '\*([0-9]+(?:\.[0-9]+)?)$')::numeric;
    elsif v_formula ~ '^\[STANDARD\]/[0-9]+(\.[0-9]+)?$' then
      v_value := v_standard / nullif(substring(v_formula from '/([0-9]+(?:\.[0-9]+)?)$')::numeric, 0);
    elsif v_formula ~ '^\[STANDARD\]\+[0-9]+(\.[0-9]+)?$' then
      v_value := v_standard + substring(v_formula from '\+([0-9]+(?:\.[0-9]+)?)$')::numeric;
    elsif v_formula ~ '^\[STANDARD\]-[0-9]+(\.[0-9]+)?$' then
      v_value := v_standard - substring(v_formula from '-([0-9]+(?:\.[0-9]+)?)$')::numeric;
    else
      v_value := null;
    end if;

    if v_value is not null and coalesce(v_override.apply_line_discount, false) then
      v_value := v_value * (1 - v_discount);
    end if;

    return query select
      v_selected,
      round(v_value, 2),
      coalesce(v_override.source, 'formula'),
      v_override.formula::text,
      v_discount,
      v_price_list_code;
    return;
  end if;

  if v_override.fixed_price is not null then
    v_value := v_override.fixed_price;
    if coalesce(v_override.apply_line_discount, false) then
      v_value := v_value * (1 - v_discount);
    end if;

    return query select
      v_selected,
      round(v_value, 2),
      coalesce(v_override.source, 'fixed'),
      null::text,
      v_discount,
      v_price_list_code;
    return;
  end if;

  return query select
    v_selected,
    case when v_selected is null then null else round(v_selected * (1 - v_discount), 2) end,
    'price list'::text,
    null::text,
    v_discount,
    v_price_list_code;
end;
$$;

grant execute on function public.effective_customer_variant_price(uuid, uuid) to authenticated;
