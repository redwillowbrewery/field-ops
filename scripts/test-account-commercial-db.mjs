// Set PGLITE_MODULE_PATH to a separately installed @electric-sql/pglite module URL.
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table accounts(id uuid primary key, brewery_customer_id integer unique, name text);
create table connector_sync_state(source_system text,module text,last_success_at timestamptz,last_full_sync_at timestamptz,last_row_count integer,last_error text,updated_at timestamptz,primary key(source_system,module));
grant select on accounts to authenticated;
insert into accounts values ('00000000-0000-0000-0000-000000000001',1,'Existing Account'),('00000000-0000-0000-0000-000000000002',null,'Prospect');
`);
await db.exec(readFileSync(new URL('../supabase/migrations/20260907100000_account_commercial_snapshot.sql', import.meta.url),'utf8'));
const stamp='2026-09-07T01:00:00Z';
const row={customer_id:1,balance:5000,credit_limit:1000,order_blocked:false,dispatch_blocked:true,source_status:'Payment required'};
const sync=(payload,time=stamp)=>db.query('select sync_viewplan_account_commercial($1::jsonb,$2::timestamptz,$3)',[JSON.stringify(payload),time,'GBP']);
await sync([row,{...row,customer_id:99}]);
let result=await db.query('select * from account_commercial_snapshots');
assert.equal(result.rows.length,1);
assert.equal(result.rows[0].order_blocked,false);
assert.equal(result.rows[0].dispatch_blocked,true);
const before=JSON.stringify(result.rows);
for(const payload of [[],[row,row],[{...row,balance:'bad'}],[row,{customer_id:2}]]) {
  await assert.rejects(sync(payload));
  assert.equal(JSON.stringify((await db.query('select * from account_commercial_snapshots')).rows),before);
}
await assert.rejects(sync([row],'2026-09-06T01:00:00Z'));
await sync([{...row,credit_limit:null,order_blocked:null,balance:null}],'2026-09-07T02:00:00Z');
result=await db.query('select * from account_commercial_snapshots');
assert.equal(result.rows[0].balance,null);
assert.equal(result.rows[0].credit_limit,null);
assert.equal(result.rows[0].order_blocked,null);
await db.exec('set role authenticated');
assert.equal((await db.query('select * from account_commercial_snapshots')).rows.length,1);
await assert.rejects(db.exec('update account_commercial_snapshots set order_blocked=false'));
await assert.rejects(sync([row]));
await db.exec('reset role; update accounts set brewery_customer_id=2 where brewery_customer_id=1; set role authenticated');
assert.equal((await db.query('select * from account_commercial_snapshots')).rows.length,0);
await db.exec('reset role; set role anon');
await assert.rejects(db.query('select * from account_commercial_snapshots'));
await db.close();
console.log('PostgreSQL migration, atomic rollback, null preservation, stale retry, identity remapping and read-only permission checks passed.');

