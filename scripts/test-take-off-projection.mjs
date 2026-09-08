
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH);
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const sales='00000000-0000-0000-0000-000000000001',brewer='00000000-0000-0000-0000-000000000002',product='00000000-0000-0000-0000-000000000010',pkg='00000000-0000-0000-0000-000000000011';
await db.exec(`create role anon;create role authenticated;create role service_role;
create schema auth;create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table products(id uuid primary key);
create table packages(id uuid primary key,capacity_litres numeric);
create table accounts(id uuid primary key);
create table product_external_ids(product_id uuid,system text,external_id text);
create table product_variants(product_id uuid,package_id uuid,allow_sale boolean);
insert into auth.users values('${sales}','sales@example.test'),('${brewer}','toby@redwillowbrewery.com');
insert into products values('${product}');insert into packages values('${pkg}',30);
insert into product_external_ids values('${product}','viewplan','2005');
insert into product_variants values('${product}','${pkg}',true);
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
`);
await db.exec(readFileSync(new URL('../supabase/migrations/20260908120000_take_off_planning.sql',import.meta.url),'utf8'));

const projection=JSON.parse(readFileSync(process.argv[2],'utf8'));
await assert.rejects(db.query('select sync_take_off($1::jsonb,now())',[JSON.stringify(projection.rows)]),/Conflicting or unresolved source lineage/);
assert.equal((await db.query('select count(*)::int n from take_off_subjects')).rows[0].n,0);
await db.exec(readFileSync(new URL('../supabase/migrations/20260908140000_take_off_link_conflicts.sql',import.meta.url),'utf8'));
await db.query('select sync_take_off($1::jsonb,now())',[JSON.stringify(projection.rows)]);
const conflicts=await db.query('select source_key,phase,id,take_off_root(id) root from take_off_subjects where source_link_conflict');
assert.equal(conflicts.rows.length,5);
for(const row of conflicts.rows){assert.equal(row.root,row.id);assert.ok(['unresolved','cancelled'].includes(row.phase));}
assert.equal((await db.query('select count(*)::int n from take_off_subjects')).rows[0].n,projection.rows.length);
console.log('Reproduced original failure. Fixed migration imports all '+projection.rows.length+' rows; five conflicts stay isolated.');
await db.close();
