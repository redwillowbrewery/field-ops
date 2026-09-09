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
const productInformation=load('lib/product-information.ts');
const informationReader={...productInformation,readProductInformation:async()=>({products:[],packages:[]})};
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
    '@/lib/product-information':informationReader,
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
    '@/lib/coming-soon':{getComingSoon:async()=>({status:'fresh',observedAt:null,items:[]})},
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
  assert.deepEqual(Object.keys(result).sort(),['accountName','comingSoon','selling']);
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

const packagePolicy=load('lib/package-eligibility.ts');
let comingCalls=[];
const soon=load('lib/coming-soon.ts',{
 '@/lib/product-information':informationReader,
 '@/lib/package-eligibility':packagePolicy,
 '@/lib/account-selling':{getEffectivePrices:async(_db,account,ids)=>{comingCalls.push({account,ids});return ids.map(id=>({product_variant_id:id,customer_price:account?80:100,list_price:100}));}},
});
const preview={productId:'p',productName:'Future beer',description:'Tasting notes',imageUrl:null,abv:4.5,estimatedDate:'2026-10-01',variantId:'v',package:{id:'k',name:'30L Keg',broad_format:'keg',package_system:'Steel',capacity_litres:30,lifecycle:'brewery_returnable'}};
test('coming soon applies account restrictions before prices and retains approved formats without a sales variant',async()=>{
 comingCalls=[];
 const db={rpc:async()=>({data:{status:'fresh',observedAt:'2026-09-08',items:[preview]}})};
 assert.equal((await soon.getComingSoon(db,null,'any')).items[0].packages[0].price,100);
 assert.equal((await soon.getComingSoon(db,'a','any')).items[0].packages[0].price,80);
 assert.equal((await soon.getComingSoon(db,'a','one_way_only')).items.length,0);
 assert.equal(comingCalls[0].account,null);assert.equal(comingCalls[1].account,'a');assert.equal(comingCalls[2].ids.length,0);
 const rows=soon.composeComingSoon([{...preview,variantId:null,package:{...preview.package,lifecycle:'one_way'}}],[],'one_way_only');
 assert.equal(rows[0].packages[0].price,null);
});
test('coming soon groups batches, uses earliest known estimate, and permits beer-only previews',()=>{
 const rows=soon.composeComingSoon([preview,{...preview,estimatedDate:'2026-09-25'},{...preview,productId:'new',package:null,variantId:null}],[],'any');
 assert.equal(rows.length,2);assert.equal(rows.find(x=>x.productId==='p').packages.length,1);
 assert.equal(rows.find(x=>x.productId==='p').packages[0].estimatedDate,'2026-09-25');
 assert.equal(rows.find(x=>x.productId==='new').packages.length,0);
 assert.equal(JSON.stringify(rows).includes('variantId'),false);
});
test('failed and stale planning reads suppress coming soon without throwing',async()=>{
 for(const db of [{rpc:async()=>({error:{message:'private diagnostic'}})},{rpc:async()=>({data:{status:'unavailable',items:[preview]}})},{rpc:async()=>{throw Error('private')}}]){
  const r=await soon.getComingSoon(db,null,'any');assert.equal(r.status,'unavailable');assert.equal(r.items.length,0);
  assert.equal(JSON.stringify(r).includes('private'),false);
 }
});

test('local package details override beer defaults, including explicit unknown',()=>{
 const info={products:[{product_id:'p',details:{vegan:true,allergens:'Contains barley',fining_status:'unfined',gluten_free:true}}],packages:[{product_id:'p',package_id:'cask',details:{vegan:false,fining_status:'fined',gluten_free:null}}]};
 const cask=productInformation.effectiveProductInformation(info,'p','cask');
 assert.equal(cask.vegan,false);assert.equal(cask.fining_status,'fined');assert.equal(cask.allergens,'Contains barley');assert.equal(cask.gluten_free,null);
 const keg=productInformation.effectiveProductInformation(info,'p','keg');
 assert.equal(keg.vegan,true);assert.equal(keg.fining_status,'unfined');
 const unknown=productInformation.effectiveProductInformation({products:[],packages:[]},'p','cask');
 assert.equal(unknown.allergens,null);assert.equal(unknown.vegan,null);assert.equal(unknown.fining_status,null);
 const upcoming=soon.composeComingSoon([{...preview,package:{...preview.package,id:'cask'}}],[],'any',info);
 assert.equal(upcoming[0].packages[0].information.vegan,false);
});

test('product information reader does not lose package overrides past the database page limit',async()=>{
 const rows=Array.from({length:1001},(_,i)=>({product_id:'p',package_id:String(i),details:{vegan:false}}));
 const db={from(table){return{select(){return this},in(){return this},order(){return this},async range(start,end){return{data:table==='product_information'?[]:rows.slice(start,end+1),error:null}}}}};
 const info=await productInformation.readProductInformation(db,['p']);
 assert.equal(info.packages.length,1001);
 assert.equal(productInformation.effectiveProductInformation(info,'p','1000').vegan,false);
});
test('editor submits explicit unknown separately from inherited package values',async()=>{
 let args;
 const actions=load('app/products/information/actions.ts',{
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'brewer'}}})},rpc:async(_name,a)=>{args=a;return{error:null}}})},
  'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:()=>{throw Error('redirect')}},
 });
 const f=new FormData();for(const [k,v]of Object.entries({product:'p',package:'k',revision:'2',vegan:'no',gluten_free:'unknown',lactose_free:'inherit',fining_status:'fined',allergen_mode:'inherit'}))f.set(k,v);
 await assert.rejects(actions.saveInformation(f),/redirect/);
 assert.equal(args.p_details.vegan,false);assert.equal(args.p_details.gluten_free,null);
 assert.equal('lactose_free' in args.p_details,false);assert.equal('allergens' in args.p_details,false);
 assert.equal(args.p_details.fining_status,'fined');
});
