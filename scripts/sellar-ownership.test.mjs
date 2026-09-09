import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import ts from 'typescript';
test('Sellar refresh writes availability only and leaves existing presentation untouched',async()=>{
 const writes=[];
 const responses={product_variant_external_ids:[{external_id:'123',product_variant_id:'v'}],product_variants:[{id:'v',product_id:'p',allow_sale:true,package_id:'pkg'}],availability_snapshots:[]};
 const db={from(table){
  assert.notEqual(table,'product_presentations','Sellar must not write editorial content');
  let data=responses[table]||[];
  const q={insert(value){writes.push([table,'insert',value]);data={id:'run1'};return this;},upsert(value){writes.push([table,'upsert',value]);return this;},update(value){writes.push([table,'update',value]);return this;},select(){return this;},eq(){return this;},in(){return this;},single(){return Promise.resolve({data,error:null});},then(resolve){resolve({data,error:null});}};return q;
 }};
 const compiled=ts.transpileModule(readFileSync(new URL('../src/lib/sellar-availability-sync.mjs',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,allowJs:true}}).outputText;
 const mod={exports:{}};
 runInNewContext(compiled,{module:mod,exports:mod.exports,require:()=>({createClient:()=>db}),URL,Date,console,fetch:async()=>({ok:true,json:async()=>[{id:123,availableStock:7,Parent:{description:'Do not overwrite local description',imageUrl:'https://example.test/source.jpg',vegan:true}}]})});
 const result=await mod.exports.syncSellarAvailability({supabaseUrl:'https://example.test',serviceRoleKey:'test',sellarToken:'test'});
 assert.equal(result.variants,1);assert.equal(result.products,1);
 const snapshot=writes.find(([t,op])=>t==='availability_snapshots'&&op==='upsert')[2][0];
 assert.equal(snapshot.available_quantity,7);assert.equal(snapshot.product_variant_id,'v');
 assert.ok(!('description' in snapshot));assert.ok(!('vegan' in snapshot));assert.ok(!('image_url' in snapshot));
});
