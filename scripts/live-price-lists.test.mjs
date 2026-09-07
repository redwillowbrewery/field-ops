import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(path, overrides = {}) {
  const code = ts.transpileModule(readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  runInNewContext(code, { module: compiledModule, exports: compiledModule.exports, require: name => name in overrides ? overrides[name] : require(name), URL, process, fetch, Date, console });
  return compiledModule.exports;
}
const policy = load('lib/price-list-policy.ts');
test('customer links accept only the random token format and safe image URLs', () => {
  assert.equal(policy.validPriceListToken('a'.repeat(64)), true);
  for (const invalid of ['', '../accounts/1', 'a'.repeat(63), 'A'.repeat(64), '00000000-0000-0000-0000-000000000001']) assert.equal(policy.validPriceListToken(invalid), false);
  assert.equal(policy.allowedPriceListImage('javascript:alert(1)'), null);
  assert.equal(policy.allowedPriceListImage('https://user:secret@example.com/image'), null);
  assert.equal(policy.allowedPriceListImage('https://example.com/image'), 'https://example.com/image');
});
test('generic price list passes no customer identity into the canonical pricing RPC', async () => {
  const calls = [];
  const selling = load('lib/account-selling.ts', {
    '@/lib/availability': { getAccountAvailability: async (_db, preference) => { calls.push(preference); return { items: [{variantId:'v',productId:'p',productName:'Beer',package:{name:'Cask'},packageType:'Cask',availableQuantity:2}], observedAt:null,lastRefreshError:null }; } },
    '@/lib/package-eligibility': { packageSalesLabel: () => 'Cask' },
  });
  const db = { rpc: async (_name,args) => { calls.push(args.p_account_id); return {data:[{product_variant_id:'v',list_price:100,customer_price:args.p_account_id?80:100}],error:null}; } };
  assert.equal((await selling.getGenericSellingData(db)).rows[0].customerPrice,100);
  assert.equal((await selling.getAccountSellingData(db,'customer-a','one_way_only')).rows[0].customerPrice,80);
  assert.deepEqual(calls,['any',null,'one_way_only','customer-a']);
});
function reader(responses) {
  let pricingCalls=0;
  const selections=[];
  const db={from(table){return{select(fields){selections.push([table,fields]);return this},eq(){return this},is(){return this},async maybeSingle(){return responses.shift()??{data:null,error:null}}}}};
  const api=load('lib/public-price-list.ts', {
    'server-only': {}, '@supabase/supabase-js':{createClient:()=>db},
    '@/lib/price-list-policy':policy,
    '@/lib/account-selling':{getAccountSellingData:async()=>{pricingCalls++;return{rows:[]}},getGenericSellingData:async()=>({rows:[]})},
  });
  return {module:api,selections,get pricingCalls(){return pricingCalls}};
}
process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-not-a-real-key';
test('unknown and revoked links never fetch prices or fall back to generic', async()=>{
  const r=reader([{data:null,error:null}]);
  assert.equal(await r.module.getPublicPriceList('a'.repeat(64)),null);
  assert.equal(r.pricingCalls,0);
  assert.equal(await r.module.getPublicPriceList('invalid'),null);
});
test('inactive Accounts and revocation during pricing never return prices', async()=>{
  const inactive=reader([{data:{account_id:'a'}},{data:{name:'Customer',active:false}}]);
  assert.equal(await inactive.module.getPublicPriceList('a'.repeat(64)),null);
  assert.equal(inactive.pricingCalls,0);
  const revoked=reader([{data:{account_id:'a'}},{data:{name:'Customer',active:true,relationship_status:'current',container_preference:'any'}},{data:null}]);
  assert.equal(await revoked.module.getPublicPriceList('a'.repeat(64)),null);
});
test('public result contains only display name and selling data', async()=>{
  const r=reader([{data:{account_id:'a'}},{data:{name:'Customer',active:true,relationship_status:'current',container_preference:'any',balance:1234,notes:'private'}},{data:{account_id:'a'}}]);
  const result=await r.module.getPublicPriceList('a'.repeat(64));
  assert.deepEqual(Object.keys(result).sort(),['accountName','selling']);
  assert.equal(JSON.stringify(result).includes('private'),false);
  assert.equal(r.selections[1][1],'name,container_preference,active,relationship_status');
});

test('package labels preserve keg size and small-pack quantity',()=>{
 const {packageSalesLabel,packageAllowedForAccount}=load('lib/package-eligibility.ts');
 const keg={name:'E-Keg',broad_format:'keg',package_system:'E-Keg',lifecycle:'one_way'};
 assert.equal(packageSalesLabel({...keg,capacity_litres:30},''),'30L E-Keg');
 assert.equal(packageSalesLabel({...keg,capacity_litres:'50.000'},''),'50L E-Keg');
 assert.equal(packageSalesLabel({name:'Cans (12 x 440ml)',broad_format:'can',package_system:'Can'},''),'Cans (12 x 440ml)');
 assert.equal(packageAllowedForAccount(keg,'one_way_only'),true);
 assert.equal(packageAllowedForAccount({...keg,lifecycle:'brewery_returnable'},'one_way_only'),false);
});
