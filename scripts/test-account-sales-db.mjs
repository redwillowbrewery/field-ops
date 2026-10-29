import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create table accounts(id uuid primary key,brewery_customer_id integer unique,notes text);
create table account_sales_snapshot(account_id uuid primary key references accounts(id),total_orders integer,total_spend numeric(12,2),average_order_value numeric(12,2),maximum_order_value numeric(12,2),first_order_date date,last_order_date date,last_delivery_date date,imported_at timestamptz);
create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
create table connector_sync_state(source_system text,module text,last_source_lud timestamptz,last_success_at timestamptz,last_full_sync_at timestamptz,last_row_count integer,last_error text,updated_at timestamptz,primary key(source_system,module));
create table connector_sync_runs(id uuid primary key,source_system text,module text,mode text,status text,started_at timestamptz,completed_at timestamptz,rows_read integer,rows_written integer,notes text);
create table connector_runner_runs(requested_module text constraint connector_runner_runs_requested_module_check check(requested_module in ('all','orders')));
insert into accounts values('00000000-0000-0000-0000-000000000001',9,'Keep CRM notes'),('00000000-0000-0000-0000-000000000002',10,'Another Account');`);
await db.exec(readFileSync(new URL('../supabase/migrations/20260822120500_sales_history.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260829101500_account_sales_summary.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260904100000_canonical_latest_account_order.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261028150000_nightly_account_sales.sql',import.meta.url),'utf8'));
await db.exec(`grant all on all tables in schema public to service_role;
insert into sales_orders(id,account_id,viewplan_order_no,order_date,net_amount)
values('00000000-0000-0000-0000-000000000042','00000000-0000-0000-0000-000000000001','123','2026-01-01',1);
insert into sales_order_lines(order_id,line_number,product_name) values('00000000-0000-0000-0000-000000000042',1,'Old workbook line');`);
let clock=Date.now()-600000;
const order=(id=42,no='123')=>({source_order_id:id,order_no:no,customer_id:9,eligible:true,order_date:'2026-10-27',lines:[
 {source_line_id:id*100,product_name:'Wreckless',package_type:'Firkin',quantity:2,net_amount:100,vat_amount:20,net_after_discount:90,vat_after_discount:18,gross_amount:120,line_type:'product'},
 {source_line_id:id*100+1,product_name:'Heartless',package_type:'30 Litre Steel',quantity:1,net_amount:50,vat_amount:10,net_after_discount:45,vat_after_discount:9,gross_amount:60,line_type:'product'}]});
const sync=async (payload,extra={})=>{
 const run=crypto.randomUUID();const stamp=new Date(clock+=1000).toISOString();
 await db.exec('reset role');
 await db.query("insert into connector_sync_runs(id,source_system,module,mode,status,started_at) values($1,'viewplan','sales','full','running',now())",[run]);
 await db.exec('set role service_role');
 return db.query('select sync_viewplan_sales($1::jsonb,$2::timestamptz,$3,$4::uuid,$5) result',[JSON.stringify(payload),extra.stamp??stamp,extra.complete??true,run,extra.allow??false]);
};
const history=async()=>JSON.stringify((await db.query('select * from sales_orders order by viewplan_order_no')).rows);
const lines=async()=>JSON.stringify((await db.query('select * from sales_order_lines order by viewplan_source_line_id')).rows);
const state=async()=>JSON.stringify((await db.query("select * from connector_sync_state where module='sales'")).rows);
try {
 await sync([order()]);
 const first=(await db.query('select * from sales_orders')).rows[0];
 assert.equal(first.id,'00000000-0000-0000-0000-000000000042');
 assert.equal(Number(first.net_amount),135);
 let rowLines=(await db.query('select * from sales_order_lines order by line_number')).rows;
 assert.deepEqual(rowLines.map(l=>l.product_name),['Wreckless','Heartless']);
 const ids=rowLines.map(l=>l.id);
 await sync([order()]);
 assert.deepEqual((await db.query('select id from sales_order_lines order by line_number')).rows.map(l=>l.id),ids);
 assert.equal((await db.query('select count(*)::int n from sales_orders')).rows[0].n,1);
 const changed=order();changed.lines[0].quantity=4;changed.lines[0].net_after_discount=180;
 changed.lines=changed.lines.slice(0,1);changed.order_date='2025-12-01';
 const recent=order(43,'124');recent.order_date='2026-10-28';
 await sync([changed,recent]);
 assert.equal((await db.query('select quantity from sales_order_lines where viewplan_source_line_id=4200')).rows[0].quantity,'4.000');
 assert.equal((await db.query('select count(*)::int n from sales_order_lines where viewplan_source_line_id=4201')).rows[0].n,0);
 assert.equal((await db.query("select last_order_date from account_latest_order_dates(array['00000000-0000-0000-0000-000000000001']::uuid[])")).rows[0].last_order_date.toISOString().slice(0,10),'2026-10-28');
 assert.equal(Number((await db.query("select revenue from account_sales_summary('00000000-0000-0000-0000-000000000001',2026)")).rows[0].revenue),135);
 assert.equal((await db.query('select notes from accounts where brewery_customer_id=9')).rows[0].notes,'Keep CRM notes');
 assert.equal((await db.query('select total_orders from account_sales_snapshot where account_id=$1',[first.account_id])).rows[0].total_orders,2);
 assert.equal(Number((await db.query('select total_spend from account_sales_snapshot where account_id=$1',[first.account_id])).rows[0].total_spend),315);
 const before=await history(),beforeLines=await lines(),beforeState=await state();
 const bad=structuredClone(recent);bad.lines[0].net_after_discount=1e30;
 for(const [payload,extra] of [
   [[],{}],[[changed,changed],{}],[[{...changed,customer_id:999},recent],{}],
   [[changed,recent],{complete:false}],[[changed,recent],{stamp:'2000-01-01T00:00:00Z'}],
   [[changed],{}],[[{...changed,lines:[...changed.lines,...changed.lines]},recent],{}],
   [[{...changed,comment:'Must roll back'},bad],{}]
 ]) {
   await assert.rejects(sync(payload,extra));
   assert.equal(await history(),before);assert.equal(await lines(),beforeLines);assert.equal(await state(),beforeState);
 }
 const credit=structuredClone(changed);credit.lines[0].net_amount=-20;credit.lines[0].net_after_discount=-20;
 credit.lines[0].line_type='credit';
 await sync([credit,recent]);
 assert.equal(Number((await db.query("select net_amount from sales_orders where viewplan_order_no='123'")).rows[0].net_amount),-20);
 // Explicit source cancellation is processed only after a validated full read.
 await sync([{...credit,eligible:false,lines:[]},recent],{allow:true});
 assert.equal((await db.query("select count(*)::int n from sales_orders where viewplan_order_no='123'")).rows[0].n,0);
 // Legacy workbook rows absent from this source are not guessed away.
 await db.exec('reset role');await db.exec("insert into sales_orders(account_id,viewplan_order_no,order_date) values('00000000-0000-0000-0000-000000000001','legacy','2024-01-01')");
 await sync([recent]);
 assert.equal((await db.query("select count(*)::int n from sales_orders where viewplan_order_no='legacy'")).rows[0].n,1);
 const last=(await db.query('select max(last_success_at) t from connector_sync_state')).rows[0].t;
 assert.ok(last);
 for(const role of ['anon','authenticated']){
   await db.exec('reset role;set role '+role);
   await assert.rejects(db.query('select sync_viewplan_sales($1,now(),true,$2,false)',[JSON.stringify([recent]),crypto.randomUUID()]));
 }
 await db.exec('reset role');
 await db.exec("insert into connector_runner_runs values('sales'),('all'),('orders')");
 await assert.rejects(db.exec("insert into connector_runner_runs values('unknown')"));
 console.log('Account sales DB: legacy identity adoption, stable order/line IDs, products, old amendments, removals, latest dates, totals, atomic rollback, cancellations, credits, stale runs, reduction guard and service-only access passed.');
} finally {await db.close();}
