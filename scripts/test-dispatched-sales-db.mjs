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
await db.exec(readFileSync(new URL('../supabase/migrations/20261028160000_dispatched_sales_checkpoints.sql',import.meta.url),'utf8'));
let clock=Date.now()-600000;
const order=(id,no=String(id))=>({source_order_id:id,order_no:no,customer_id:9,eligible:true,dispatched:true,order_date:'2026-10-28',lines:[{source_line_id:id*100,product_name:'Wreckless',package_type:'Firkin',quantity:2,net_amount:100,vat_amount:20,net_after_discount:90,vat_after_discount:18,gross_amount:120,line_type:'product'}]});
const checkpoint=async()=>{await db.exec('reset role');return (await db.query('select * from viewplan_sales_checkpoint')).rows[0];};
async function metadata(overrides={}){
 const cp=await checkpoint();const s=cp?.state;
 const m={expected_revision:cp?.revision??0,scan_mode:'backfill',scan_from:null,scan_through:new Date(clock).toISOString().slice(0,19),scan_started_at:new Date(clock).toISOString(),cursor:0,high_id:0,next_cursor:0,has_more:false,restart_full:false,bootstrap_success_at:null};
 if(s?.mode==='idle'){m.scan_mode='incremental';m.scan_from=s.through;m.high_id=s.last_source_order_id;}
 else if(s){m.scan_mode=s.mode;for(const key of ['scan_from','scan_through','scan_started_at','cursor','high_id'])m[key]=s[key];}
 return {...m,...overrides};
}
async function sync(payload,m,run=crypto.randomUUID()){
 await db.exec('reset role');
 await db.query("insert into connector_sync_runs(id,source_system,module,mode,status,started_at) values($1,'viewplan','sales','full','running',now()) on conflict(id) do nothing",[run]);
 await db.exec('set role service_role');
 return (await db.query('select sync_viewplan_dispatched_sales($1::jsonb,$2::timestamptz,true,$3::uuid,$4::jsonb) result',[JSON.stringify(payload),new Date(clock+=1000).toISOString(),run,JSON.stringify(m)])).rows[0].result;
}
const facts=async()=>{
 await db.exec('reset role');
 return JSON.stringify({orders:(await db.query('select * from sales_orders order by viewplan_order_no')).rows,lines:(await db.query('select * from sales_order_lines order by line_number')).rows,summary:(await db.query('select * from account_sales_snapshot order by account_id')).rows,checkpoint:await checkpoint()});
};
try{
 await db.exec("insert into sales_orders(account_id,viewplan_order_no,order_date,dispatched,net_amount) values('00000000-0000-0000-0000-000000000001','pending','2030-01-01',false,999)");
 const first=order(42,'123');
 let result=await sync([first],await metadata({next_cursor:42,has_more:true}));
 assert.equal(result.done,false);assert.equal(Number((await checkpoint()).revision),1);
 assert.equal((await checkpoint()).state.cursor,42);
 assert.equal((await db.query("select id from sales_orders where viewplan_order_no='123'")).rows[0].id,'00000000-0000-0000-0000-000000000042');
 assert.equal((await db.query("select count(*)::int n from connector_sync_state where last_success_at is not null")).rows[0].n,0);
 const preserved=await facts();
 await assert.rejects(sync([{...order(43),customer_id:999}],await metadata({next_cursor:43})));
 assert.equal(await facts(),preserved);
 // Restarting the process resumes from the first committed batch, not zero.
 result=await sync([order(43,'VP-ID:43')],await metadata({next_cursor:43}));
 assert.equal(result.done,true);assert.equal((await checkpoint()).state.mode,'idle');
 const ids=(await db.query('select id from sales_order_lines order by viewplan_source_line_id')).rows.map(r=>r.id);
 assert.equal((await db.query("select last_order_date from account_latest_order_dates(array['00000000-0000-0000-0000-000000000001']::uuid[])")).rows[0].last_order_date.toISOString().slice(0,10),'2026-10-28');
 assert.equal((await db.query("select order_count from account_sales_summary('00000000-0000-0000-0000-000000000001',2026)")).rows[0].order_count,2);
 assert.equal((await db.query("select total_orders from account_sales_snapshot where account_id='00000000-0000-0000-0000-000000000001'")).rows[0].total_orders,2);
 // No new dispatched orders is a successful no-op, with an advanced watermark.
 const oldThrough=(await checkpoint()).state.through;
 result=await sync([],await metadata());assert.equal(result.done,true);
 assert.notEqual((await checkpoint()).state.through,oldThrough);
 assert.deepEqual((await db.query('select id from sales_order_lines order by viewplan_source_line_id')).rows.map(r=>r.id),ids);
 // An old-created order can enter history when it is newly dispatched.
 await sync([order(20)],await metadata({next_cursor:20}));
 assert.equal((await db.query('select count(*)::int n from sales_orders where dispatched=true')).rows[0].n,3);
 const before=await facts();
 const bad=order(45);bad.lines[0].net_after_discount=1e30;
 const stale=await metadata({next_cursor:44});stale.expected_revision--;
 const cases=[
  [[order(44)],stale],
  [[{...order(44),dispatched:false}],await metadata({next_cursor:44})],
  [[order(44),order(44)],await metadata({next_cursor:44})],
  [[order(44)],await metadata({next_cursor:45})],
  [[],await metadata({has_more:true})],
  [[order(44),bad],await metadata({next_cursor:45})]
 ];
 for(const [rows,m] of cases){await assert.rejects(sync(rows,m));assert.equal(await facts(),before);}
 // The initial successful full import can bootstrap without rereading all history.
 await db.exec('reset role;delete from viewplan_sales_checkpoint');
 const success=(await db.query("select last_success_at from connector_sync_state where module='sales'")).rows[0].last_success_at.toISOString();
 const bootstrap=await metadata({scan_mode:'incremental',scan_from:success.slice(0,19),high_id:43,bootstrap_success_at:success});
 await assert.rejects(sync([], {...bootstrap,bootstrap_success_at:'2000-01-01T00:00:00Z'}));
 await sync([],bootstrap);assert.equal((await checkpoint()).state.mode,'idle');
 // A manual backfill is additive and preserves history not in an individual batch.
 await sync([first],await metadata({scan_mode:'backfill',scan_from:null,cursor:0,high_id:0,next_cursor:42,restart_full:true}));
 assert.equal((await db.query('select count(*)::int n from sales_orders where dispatched=true')).rows[0].n,3);
 for(const role of ['anon','authenticated']){
  await db.exec('reset role;set role '+role);
  await assert.rejects(db.query('select * from viewplan_sales_checkpoint'));
  await assert.rejects(db.query('select sync_viewplan_dispatched_sales($1,now(),true,$2,$3)',[JSON.stringify([]),crypto.randomUUID(),'{}']));
 }
 await db.exec('reset role;grant select on sales_orders,sales_order_lines to authenticated;set role authenticated');
 assert.equal((await db.query("select count(*)::int n from sales_orders where viewplan_order_no='pending'")).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from sales_orders')).rows[0].n,3);
 assert.equal((await db.query('select count(*)::int n from sales_order_lines')).rows[0].n,3);
 await db.exec('reset role;set role service_role');
 await assert.rejects(db.exec("update viewplan_sales_checkpoint set state='{}'"));
 await assert.rejects(db.query('select sync_viewplan_sales($1,now(),true,$2,false)',[JSON.stringify([first]),crypto.randomUUID()]));
 console.log('Dispatched sales: checkpointed batches, retry/resume, empty increments, old-created dispatch, legacy IDs, blank-number fallback, dispatched-only summaries, atomic rollback, stale leases, bootstrap and permissions passed.');
}finally{await db.close();}
