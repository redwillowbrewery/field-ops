
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const compiled={exports:{}};
runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/take-off.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:compiled,exports:compiled.exports,require:()=>({}),Map,Set,Date,Number});
const {volumeSummary,rootOf}=compiled.exports;
test('request and approval are separate volume scenarios with explicit extra input',()=>{
 const r={quantity:10,package_id:'p',approved_quantity:8,extra_input_percent:6,approval_context:'current'};
 const s=volumeSummary([r],[{id:'p',capacity_litres:30}],'current',300);
 assert.equal(s.requested,300);assert.equal(s.agreed,240);assert.equal(s.input,254.4);assert.ok(Math.abs(s.remaining-45.6)<1e-9);
});
test('stale approvals, withdrawn requests and unknown package volumes do not become approved demand',()=>{
 const r={quantity:10,package_id:'p',approved_quantity:8,extra_input_percent:6,approval_context:'old'};
 let s=volumeSummary([r],[{id:'p',capacity_litres:null}],'current',null);
 assert.equal(s.requested,null);assert.equal(s.pending,1);assert.equal(s.remaining,null);
 s=volumeSummary([{...r,withdrawn:true}],[{id:'p',capacity_litres:30}],'current',100);
 assert.equal(s.requested,0);assert.equal(s.pending,0);
});
test('exact source link survives transfer while similarly named plans remain distinct',()=>{
 const b={id:'batch',source_key:'batch:4184'};
 const p={id:'plan',source_key:'plan:4590',source_link_key:b.source_key};
 assert.equal(rootOf(p,[p,b]),'batch');
 assert.equal(rootOf({id:'other',source_key:'plan:4591'},[p,b]),'other');
});

test('carbonation totals, case capacities, unknown data and over-requesting',()=>{
 const packages=[{id:'c',capacity_litres:40.9,broad_format:'cask'},{id:'k',capacity_litres:30,broad_format:'keg'},{id:'can',capacity_litres:5.28,broad_format:'can'}];
 const s=compiled.exports.requestedSplit([{package_id:'c',quantity:2},{package_id:'k',quantity:3},{package_id:'can',quantity:10}],packages,200);
 assert.equal(s.nonCarbonated,81.8);assert.equal(s.carbonated,142.8);assert.ok(Math.abs(s.remaining+24.6)<1e-9);
 assert.equal(compiled.exports.requestedSplit([{package_id:'missing',quantity:1}],packages,200).remaining,null);
 assert.equal(compiled.exports.requestedSplit([],packages,null).remaining,null);
 assert.equal(compiled.exports.packagingGroup({broad_format:'bottle'}),'unclassified');
});
test('packaging dates use calendar days, preserve unknown and allow explicit zero',()=>{
 const date=compiled.exports.estimatedPackagingDate;
 assert.equal(date('2026-09-25',10),'2026-10-05');
 assert.equal(date('2026-09-08',0),'2026-09-08');
 assert.equal(date('2026-09-08',null),null);assert.equal(date(null,10),null);
 assert.equal(date('2026-09-08',-1),null);
});
