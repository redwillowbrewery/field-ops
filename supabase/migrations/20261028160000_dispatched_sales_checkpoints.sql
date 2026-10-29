-- Dispatched orders are immutable Account history (merchant rule, 28 October).
-- Upgrade the already-applied full-history migration; do not rerun it.
create table public.viewplan_sales_checkpoint(
 singleton boolean primary key default true check(singleton),
 revision bigint not null check(revision>0),state jsonb not null,updated_at timestamptz not null default now()
);
alter table public.viewplan_sales_checkpoint enable row level security;
revoke all on public.viewplan_sales_checkpoint from public,anon,authenticated;
revoke all on public.viewplan_sales_checkpoint from service_role;
grant select on public.viewplan_sales_checkpoint to service_role;
create index sales_orders_dispatched_account_date on public.sales_orders(account_id,order_date desc) where dispatched=true;
-- Enforce the history boundary for already-deployed readers as well as new UI.
-- Operational/open orders continue to use the separate fulfilment tables.
alter policy "authenticated read sales orders" on public.sales_orders using(dispatched=true);
alter policy "authenticated read sales order lines" on public.sales_order_lines
 using(exists(select 1 from public.sales_orders h where h.id=order_id and h.dispatched=true));

create function public.sync_viewplan_dispatched_sales(
 payload jsonb, snapshot_at timestamptz, complete boolean,
 run_id uuid, checkpoint jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 o record; l record; target uuid; source_target uuid; mapped uuid;
 order_total integer; active_total integer; line_total integer; latest timestamptz;
 c record; saved jsonb; version bigint; scan_high bigint; next_state jsonb;
begin
 if complete is distinct from true or snapshot_at is null
    or snapshot_at > now()+interval '5 minutes'
    or jsonb_typeof(payload) is distinct from 'array'
    or jsonb_array_length(payload) not between 0 and 2000
    or jsonb_typeof(checkpoint) is distinct from 'object' then
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
 select * into c from jsonb_to_record(checkpoint) as x(
   expected_revision bigint, scan_mode text, scan_from timestamp, scan_through timestamp,
   scan_started_at timestamptz, cursor bigint, next_cursor bigint, high_id bigint,
   has_more boolean, restart_full boolean, bootstrap_success_at timestamptz
 );
 if c.expected_revision is null or c.expected_revision<0 or c.scan_mode is null
   or c.scan_mode not in ('backfill','incremental') or c.scan_through is null
   or c.scan_started_at is null or c.scan_started_at>snapshot_at
   or c.cursor is null or c.cursor<0 or c.next_cursor is null or c.next_cursor<c.cursor
   or c.high_id is null or c.high_id<0 or c.has_more is null
   or (c.scan_mode='backfill' and c.scan_from is not null)
   or (c.scan_mode='incremental' and c.scan_from is null)
   or c.scan_from>c.scan_through then raise exception 'Invalid sales checkpoint'; end if;
 select revision,state into version,saved from viewplan_sales_checkpoint where singleton for update;
 if c.expected_revision<>coalesce(version,0) then raise exception 'Sales checkpoint changed; resume from committed state'; end if;
 if coalesce(c.restart_full,false) then
   if c.scan_mode<>'backfill' or c.cursor<>0 or c.high_id<>0 then raise exception 'Invalid backfill restart'; end if;
 elsif saved is not null and saved->>'mode'<>'idle' then
   if c.scan_mode is distinct from saved->>'mode'
     or c.scan_from is distinct from (saved->>'scan_from')::timestamp
     or c.scan_through is distinct from (saved->>'scan_through')::timestamp
     or c.scan_started_at is distinct from (saved->>'scan_started_at')::timestamptz
     or c.cursor is distinct from (saved->>'cursor')::bigint
     or c.high_id is distinct from (saved->>'high_id')::bigint then
     raise exception 'Incorrect sales continuation'; end if;
 elsif saved is not null then
   if c.scan_mode<>'incremental' or c.cursor<>0
     or c.scan_from is distinct from (saved->>'through')::timestamp
     or c.high_id is distinct from (saved->>'last_source_order_id')::bigint then
     raise exception 'Incorrect sales checkpoint window'; end if;
 elsif c.scan_mode='incremental' then
   if c.cursor<>0 or latest is null or c.bootstrap_success_at is distinct from latest
     or not exists(select 1 from sales_orders where viewplan_source_order_id is not null and dispatched=true)
     or c.high_id is distinct from (select max(viewplan_source_order_id) from sales_orders where dispatched=true) then
     raise exception 'No successful full import to bootstrap'; end if;
 elsif c.cursor<>0 or c.high_id<>0 then raise exception 'Initial backfill must start at zero';
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
   or nullif(btrim(order_no),'') is null or eligible is distinct from true or dispatched is distinct from true
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
 if exists(select 1 from sales_incoming_orders where source_order_id<=c.cursor)
   or c.next_cursor<>coalesce((select max(source_order_id) from sales_incoming_orders),c.cursor)
   or (c.has_more and order_total=0) then raise exception 'Invalid sales batch boundary'; end if;
 create temporary table sales_affected_accounts on commit drop as
 select a.id from accounts a join sales_incoming_orders s on s.customer_id=a.brewery_customer_id
 union select h.account_id from sales_orders h join sales_incoming_orders s
 on h.viewplan_source_order_id=s.source_order_id or h.viewplan_order_no=s.order_no;

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

 -- Dispatched history is immutable. A batch/window omission never deletes it.
 -- Existing Account list and visit-planning consumers use this summary table.
 -- Derive it from the same canonical history, without changing CRM state.
 insert into account_sales_snapshot(account_id,total_orders,total_spend,average_order_value,
   maximum_order_value,first_order_date,last_order_date,last_delivery_date,imported_at)
 select a.id,count(h.id)::integer,coalesce(sum(h.net_amount),0),coalesce(avg(h.net_amount),0),
   max(h.net_amount),min(h.order_date),max(h.order_date),
   max(h.delivery_date) filter(where h.delivery_date<=current_date),snapshot_at
 from accounts a join sales_affected_accounts changed on changed.id=a.id
 left join sales_orders h on h.account_id=a.id and h.dispatched=true group by a.id
 on conflict(account_id) do update set total_orders=excluded.total_orders,total_spend=excluded.total_spend,
   average_order_value=excluded.average_order_value,maximum_order_value=excluded.maximum_order_value,
   first_order_date=excluded.first_order_date,last_order_date=excluded.last_order_date,
   last_delivery_date=excluded.last_delivery_date,imported_at=excluded.imported_at;

 scan_high:=greatest(c.high_id,coalesce((saved->>'scan_high_id')::bigint,0),c.next_cursor);
 if c.has_more then
   next_state:=jsonb_build_object('mode',c.scan_mode,'scan_from',c.scan_from,'scan_through',c.scan_through,
     'scan_started_at',c.scan_started_at,'cursor',c.next_cursor,'high_id',c.high_id,'scan_high_id',scan_high);
 else
   next_state:=jsonb_build_object('mode','idle','through',c.scan_through,'last_source_order_id',scan_high);
 end if;
 insert into viewplan_sales_checkpoint(singleton,revision,state,updated_at)
 values(true,coalesce(version,0)+1,next_state,now()) on conflict(singleton) do update
 set revision=excluded.revision,state=excluded.state,updated_at=excluded.updated_at;
 update connector_sync_runs set status=case when c.has_more then 'running' else 'completed' end,
   rows_read=coalesce(rows_read,0)+order_total,rows_written=coalesce(rows_written,0)+active_total,
   completed_at=case when c.has_more then null else now() end,
   notes='Dispatched order/product history; resumable batches' where id=run_id;
 if not c.has_more then
   insert into connector_sync_state(source_system,module,last_source_lud,last_success_at,last_full_sync_at,last_row_count,last_error,updated_at)
   values('viewplan','sales',null,c.scan_started_at,case when c.scan_mode='backfill' then c.scan_started_at else null end,
     (select count(*)::integer from sales_orders where dispatched=true),null,now())
   on conflict(source_system,module) do update set
     last_success_at=excluded.last_success_at,
     last_full_sync_at=coalesce(excluded.last_full_sync_at,connector_sync_state.last_full_sync_at),
     last_row_count=excluded.last_row_count,last_error=null,updated_at=now();
 end if;
 return jsonb_build_object('orders',active_total,'lines',line_total,'next_cursor',c.next_cursor,
   'checkpoint_revision',coalesce(version,0)+1,'done',not c.has_more,
   'mode',c.scan_mode,'snapshot_at',snapshot_at);
end;
$$;

revoke all on function public.sync_viewplan_dispatched_sales(jsonb,timestamptz,boolean,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sync_viewplan_dispatched_sales(jsonb,timestamptz,boolean,uuid,jsonb) to service_role;
-- An outdated connector must not reintroduce undispatched history or clear good data.
revoke execute on function public.sync_viewplan_sales(jsonb,timestamptz,boolean,uuid,boolean) from service_role;

create or replace function public.account_sales_summary(p_account_id uuid,p_year integer)
returns table(order_count bigint,revenue numeric,average_order numeric,last_order date)
language sql stable security invoker set search_path=public as $$
 select count(*)::bigint,coalesce(sum(net_amount),0)::numeric,coalesce(avg(net_amount),0)::numeric,max(order_date)
 from public.sales_orders where account_id=p_account_id and dispatched=true
 and order_date>=make_date(p_year,1,1) and order_date<make_date(p_year+1,1,1);
$$;
create or replace function public.account_latest_order_dates(p_account_ids uuid[])
returns table(account_id uuid,last_order_date date)
language sql stable security invoker set search_path=public as $$
 select orders.account_id,max(orders.order_date) from public.sales_orders orders
 where orders.dispatched=true and orders.account_id=any(coalesce(p_account_ids,'{}'::uuid[])) group by orders.account_id;
$$;

-- Apply the dispatched-only rule to existing list/planning summaries immediately.
-- Existing order records and CRM data are retained; undispatched rows are hidden.
insert into public.account_sales_snapshot(account_id,total_orders,total_spend,average_order_value,maximum_order_value,
 first_order_date,last_order_date,last_delivery_date,imported_at)
select a.id,count(h.id)::integer,coalesce(sum(h.net_amount),0),coalesce(avg(h.net_amount),0),max(h.net_amount),
 min(h.order_date),max(h.order_date),max(h.delivery_date) filter(where h.delivery_date<=current_date),now()
from public.accounts a left join public.sales_orders h on h.account_id=a.id and h.dispatched=true
where a.brewery_customer_id is not null group by a.id
on conflict(account_id) do update set total_orders=excluded.total_orders,total_spend=excluded.total_spend,
 average_order_value=excluded.average_order_value,maximum_order_value=excluded.maximum_order_value,
 first_order_date=excluded.first_order_date,last_order_date=excluded.last_order_date,
 last_delivery_date=excluded.last_delivery_date,imported_at=excluded.imported_at;
