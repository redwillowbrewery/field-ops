-- One canonical definition of an Account's latest imported order date.
-- Snapshot aggregates remain useful for lifetime metrics, but their source export
-- can lag behind the incremental sales-order import.
create or replace function public.account_latest_order_dates(p_account_ids uuid[])
returns table(account_id uuid, last_order_date date)
language sql
stable
security invoker
set search_path = public
as $$
  select orders.account_id, max(orders.order_date) as last_order_date
  from public.sales_orders as orders
  where orders.account_id = any(coalesce(p_account_ids, '{}'::uuid[]))
  group by orders.account_id;
$$;

grant execute on function public.account_latest_order_dates(uuid[]) to authenticated;
