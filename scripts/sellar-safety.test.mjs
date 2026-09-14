import test from 'node:test';import assert from 'node:assert/strict';
import {fetchProducts} from '../src/lib/sellar-availability-sync.mjs';
function source(pages){let i=0;return async()=>({ok:true,json:async()=>pages[i++]});}
const page=Array.from({length:100},(_,id)=>({id,availableStock:10}));
test('malformed later page is not a valid end of availability',async()=>{await assert.rejects(fetchProducts('https://example.test','fake',{fetchImpl:source([page,{error:'bad shape'}])}),/Invalid Sellar page/);});
test('valid zero stock and empty final page preserve complete traversal',async()=>{const rows=await fetchProducts('https://example.test','fake',{fetchImpl:source([page,[]])});assert.equal(rows.length,100);const zero=await fetchProducts('https://example.test','fake',{fetchImpl:source([[{id:1,availableStock:0}]])});assert.equal(zero[0].validatedStock,0);});
test('missing, non-numeric and blank stock fail closed',async()=>{for(const stock of [undefined,null,'',false,'bad',Infinity])await assert.rejects(fetchProducts('https://example.test','fake',{fetchImpl:source([[{id:1,availableStock:stock}]])}),/stock/);});
test('repeated identities and pagination exhaustion fail closed',async()=>{await assert.rejects(fetchProducts('https://example.test','fake',{fetchImpl:source([page,page])}),/Duplicate/);await assert.rejects(fetchProducts('https://example.test','fake',{fetchImpl:source([page]),maxRows:100}),/pagination limit/);});
test('invalid envelopes and product identities fail closed',async()=>{for(const value of [{ok:true},null])await assert.rejects(fetchProducts('https://example.test','fake',{fetchImpl:source([value])}));for(const id of [null,{},'',NaN])await assert.rejects(fetchProducts('https://example.test','fake',{fetchImpl:source([[{id,availableStock:1}]])}),/identity/);});

test('negative Sellar availability is zero sellable units, not a malformed snapshot',async()=>{const rows=await fetchProducts('https://example.test','fake',{fetchImpl:source([[{id:68342,availableStock:-1,stock:0},{id:2,availableStock:5}]])});assert.equal(rows[0].validatedStock,0);assert.equal(rows[1].validatedStock,5);});
