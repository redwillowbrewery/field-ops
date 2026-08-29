create or replace function public.account_sales_summary(p_account_id uuid, p_year integer)
returns table(order_count bigint, revenue numeric, average_order numeric, last_order date)
language sql stable security invoker set search_path = public
as $$
  select count(*)::bigint,
         coalesce(sum(net_amount),0)::numeric,
         coalesce(avg(net_amount),0)::numeric,
         max(order_date)
  from public.sales_orders
  where account_id = p_account_id
    and order_date >= make_date(p_year,1,1)
    and order_date < make_date(p_year+1,1,1);
$$;

grant execute on function public.account_sales_summary(uuid,integer) to authenticated;
