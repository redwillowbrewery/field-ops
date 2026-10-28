-- Refresh the existing Account order/line history; ViewPlan remains read-only.
alter table public.sales_orders add column viewplan_source_order_id bigint unique;
alter table public.sales_order_lines add column viewplan_source_line_id bigint unique;

alter table public.connector_runner_runs drop constraint connector_runner_runs_requested_module_check;
alter table public.connector_runner_runs add constraint connector_runner_runs_requested_module_check
 check(requested_module in ('all','customers','products','pricing','sales','containers','take-off','orders'));

create function public.sync_viewplan_sales(
 payload jsonb, snapshot_at timestamptz, complete boolean,
 run_id uuid, allow_large_reduction boolean default false
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 o record; l record; target uuid; source_target uuid; mapped uuid;
 order_total integer; active_total integer; line_total integer; previous_total integer;
 removed_total integer := 0; affected integer; latest timestamptz;
begin
 if complete is distinct from true or snapshot_at is null
    or snapshot_at > now()+interval '5 minutes'
    or jsonb_typeof(payload) is distinct from 'array'
    or jsonb_array_length(payload) not between 1 and 100000 then
   raise exception 'Incomplete or invalid sales snapshot';
 end if;
 perform pg_advisory_xact_lock(hashtext('viewplan_account_sales'));
 select last_success_at into latest from connector_sync_state
 where source_system='viewplan' and module='sales';
 if snapshot_at <= latest then raise exception 'Outdated sales snapshot'; end if;
 if not exists(select 1 from connector_sync_runs r where r.id=run_id
   and r.source_system='viewplan' and r.module='sales' and r.status='running') then
   raise exception 'Sales attempt not registered';
 end if;

 create temporary table sales_incoming_orders on commit drop as
 select * from jsonb_to_recordset(payload) as x(
   source_order_id bigint, order_no text, customer_id integer, eligible boolean,
   order_date date, delivery_date date, invoice_date date, customer_order_ref text,
   comment text, order_source text, sales_channel text, customer_class text,
   source_customer_display text, dispatched boolean, dispatched_date date,
   delivered boolean, invoice_no text, invoice_year integer, invoice_month integer, lines jsonb
 );
 if exists(select 1 from sales_incoming_orders where source_order_id is null or source_order_id<=0
   or nullif(btrim(order_no),'') is null or eligible is null
   or jsonb_typeof(lines) is distinct from 'array'
   or (eligible and (customer_id is null or order_date is null)))
   or exists(select 1 from sales_incoming_orders group by source_order_id having count(*)>1)
   or exists(select 1 from sales_incoming_orders group by order_no having count(*)>1) then
   raise exception 'Invalid or duplicate source order';
 end if;
 -- Resolve customer identity independently of names and the legacy pricing map.
 if exists(select 1 from sales_incoming_orders s left join accounts a
   on a.brewery_customer_id=s.customer_id where s.eligible and a.id is null) then
   raise exception 'Unmapped ViewPlan sales customer; run customer reconciliation first';
 end if;
 create temporary table sales_incoming_lines on commit drop as
 select incoming.source_order_id, detail.* from sales_incoming_orders incoming
 cross join lateral jsonb_to_recordset(incoming.lines) as detail(
   source_line_id bigint, product_name text, package_type text, quantity numeric,
   package_unit_litres numeric, total_litres numeric, draught boolean,
   standard_unit_price numeric, net_amount numeric, vat_amount numeric,
   net_after_discount numeric, vat_after_discount numeric, gross_amount numeric,
   line_weight_kg numeric, line_type text
 ) where incoming.eligible;
 if (select count(*) from sales_incoming_lines)>1000000
   or exists(select 1 from sales_incoming_lines where source_line_id is null
     or source_line_id not between 1 and 2147483647
     or line_type is null or line_type not in ('product','discount','credit','misc'))
   or exists(select 1 from sales_incoming_lines group by source_line_id having count(*)>1)
   or exists(select 1 from sales_incoming_lines where
     net_amount::text in ('NaN','Infinity','-Infinity') or vat_amount::text in ('NaN','Infinity','-Infinity')
     or net_after_discount::text in ('NaN','Infinity','-Infinity')
     or vat_after_discount::text in ('NaN','Infinity','-Infinity')
     or quantity::text in ('NaN','Infinity','-Infinity')) then
   raise exception 'Invalid or duplicate source sales line';
 end if;

 select count(*) into order_total from sales_incoming_orders;
 select count(*) into active_total from sales_incoming_orders where eligible;
 select count(*) into line_total from sales_incoming_lines;
 select count(*) into previous_total from sales_orders where viewplan_source_order_id is not null;
 if active_total=0 or (not coalesce(allow_large_reduction,false)
   and previous_total>0 and active_total<previous_total*0.8) then
   raise exception 'Unexpected reduction in sales history; previous snapshot retained';
 end if;

 -- Detect conflicting stable-ID/number pairs before any history is changed.
 if exists(select 1 from sales_incoming_orders s join sales_orders h
   on h.viewplan_order_no=s.order_no where h.viewplan_source_order_id is not null
   and h.viewplan_source_order_id<>s.source_order_id) then
   raise exception 'Conflicting source order number mapping';
 end if;
 create unique index on sales_incoming_orders(source_order_id);
 create index on sales_incoming_lines(source_order_id);
 create unique index on sales_incoming_lines(source_line_id);

 for o in select * from sales_incoming_orders order by source_order_id loop
   select id into target from sales_orders where viewplan_source_order_id=o.source_order_id;
   select id into source_target from sales_orders where viewplan_order_no=o.order_no;
   if target is not null and source_target is not null and target<>source_target then
     raise exception 'Conflicting existing sales history identity';
   end if;
   target:=coalesce(target,source_target);
   if not o.eligible then
     delete from sales_orders where id=target;
     get diagnostics affected=row_count; removed_total:=removed_total+affected;
     continue;
   end if;
   select id into mapped from accounts where brewery_customer_id=o.customer_id;
   if target is null then
     insert into sales_orders(account_id,viewplan_order_no,order_date)
       values(mapped,o.order_no,o.order_date) returning id into target;
   end if;
   update sales_orders set
     account_id=mapped, viewplan_source_order_id=o.source_order_id,viewplan_order_no=o.order_no,
     order_date=o.order_date,delivery_date=o.delivery_date,invoice_date=o.invoice_date,
     customer_order_ref=o.customer_order_ref,comment=o.comment,order_source=o.order_source,
     sales_channel=o.sales_channel,customer_class=o.customer_class,
     source_customer_display=o.source_customer_display,dispatched=o.dispatched,
     dispatched_date=o.dispatched_date,delivered=o.delivered,invoice_no=o.invoice_no,
     invoice_year=o.invoice_year,invoice_month=o.invoice_month,
     net_amount=coalesce((select sum(net_after_discount) from sales_incoming_lines where source_order_id=o.source_order_id),0),
     vat_amount=coalesce((select sum(vat_after_discount) from sales_incoming_lines where source_order_id=o.source_order_id),0),
     gross_amount=coalesce((select sum(gross_amount) from sales_incoming_lines where source_order_id=o.source_order_id),0),
     total_litres=coalesce((select sum(total_litres) from sales_incoming_lines where source_order_id=o.source_order_id),0),
     imported_at=snapshot_at,updated_at=now()
   where id=target;
   -- Retire only absent/legacy line identities; unchanged source lines keep UUIDs.
   delete from sales_order_lines h where h.order_id=target and not exists(
     select 1 from sales_incoming_lines s where s.source_order_id=o.source_order_id
       and s.source_line_id=h.viewplan_source_line_id);
   for l in select * from sales_incoming_lines where source_order_id=o.source_order_id loop
     if exists(select 1 from sales_order_lines where viewplan_source_line_id=l.source_line_id and order_id<>target) then
       raise exception 'Conflicting source line parent';
     end if;
     insert into sales_order_lines(
       order_id,line_number,viewplan_source_line_id,product_name,package_type,quantity,
       package_unit_litres,total_litres,draught,standard_unit_price,net_amount,vat_amount,
       net_after_discount,vat_after_discount,gross_amount,line_weight_kg,line_type
     ) values(target,l.source_line_id::integer,l.source_line_id,l.product_name,l.package_type,l.quantity,
       l.package_unit_litres,l.total_litres,l.draught,l.standard_unit_price,l.net_amount,l.vat_amount,
       l.net_after_discount,l.vat_after_discount,l.gross_amount,l.line_weight_kg,l.line_type)
     on conflict(viewplan_source_line_id) do update set
       product_name=excluded.product_name,package_type=excluded.package_type,quantity=excluded.quantity,
       package_unit_litres=excluded.package_unit_litres,total_litres=excluded.total_litres,
       draught=excluded.draught,standard_unit_price=excluded.standard_unit_price,
       net_amount=excluded.net_amount,vat_amount=excluded.vat_amount,
       net_after_discount=excluded.net_after_discount,vat_after_discount=excluded.vat_after_discount,
       gross_amount=excluded.gross_amount,line_weight_kg=excluded.line_weight_kg,line_type=excluded.line_type;
   end loop;
 end loop;

 -- Only previously adopted source IDs can be reconciled by full-source absence.
 -- Unadopted workbook history is preserved rather than guessed to be deleted.
 delete from sales_orders h where h.viewplan_source_order_id is not null and not exists(
   select 1 from sales_incoming_orders s where s.source_order_id=h.viewplan_source_order_id);
 get diagnostics affected=row_count;removed_total:=removed_total+affected;

 -- Existing Account list and visit-planning consumers use this summary table.
 -- Derive it from the same canonical history, without changing CRM state.
 insert into account_sales_snapshot(account_id,total_orders,total_spend,average_order_value,
   maximum_order_value,first_order_date,last_order_date,last_delivery_date,imported_at)
 select a.id,count(h.id)::integer,coalesce(sum(h.net_amount),0),coalesce(avg(h.net_amount),0),
   max(h.net_amount),min(h.order_date),max(h.order_date),
   max(h.delivery_date) filter(where h.delivery_date<=current_date),snapshot_at
 from accounts a left join sales_orders h on h.account_id=a.id
 where a.brewery_customer_id is not null group by a.id
 on conflict(account_id) do update set total_orders=excluded.total_orders,total_spend=excluded.total_spend,
   average_order_value=excluded.average_order_value,maximum_order_value=excluded.maximum_order_value,
   first_order_date=excluded.first_order_date,last_order_date=excluded.last_order_date,
   last_delivery_date=excluded.last_delivery_date,imported_at=excluded.imported_at;

 insert into connector_sync_state(source_system,module,last_source_lud,last_success_at,last_full_sync_at,last_row_count,last_error,updated_at)
 values('viewplan','sales',null,snapshot_at,snapshot_at,active_total,null,now())
 on conflict(source_system,module) do update set last_source_lud=null,
   last_success_at=excluded.last_success_at,last_full_sync_at=excluded.last_full_sync_at,
   last_row_count=excluded.last_row_count,last_error=null,updated_at=now();
 update connector_sync_runs set status='completed',rows_read=order_total,rows_written=active_total,
   completed_at=now(),notes='Full Account order/product history refresh' where id=run_id;
 return jsonb_build_object('orders',active_total,'lines',line_total,'removed_orders',removed_total,'snapshot_at',snapshot_at);
end;
$$;
revoke all on function public.sync_viewplan_sales(jsonb,timestamptz,boolean,uuid,boolean) from public,anon,authenticated;
grant execute on function public.sync_viewplan_sales(jsonb,timestamptz,boolean,uuid,boolean) to service_role;
