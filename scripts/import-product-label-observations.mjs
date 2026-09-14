import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {productLabelCandidate} from '../src/lib/product-label-candidates.mjs';
const file=process.argv[2],apply=process.argv.includes('--apply');
if(!file)throw new Error('Usage: node --env-file=.env.local scripts/import-product-label-observations.mjs <product-label-detail.json> [--apply]');
const report=JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
if(report.complete!==true||report.source!=='tblBrew_Type'||!Array.isArray(report.rows)||!report.rows.length||report.rows.length!==report.row_count||report.rows.length>10000||!Number.isFinite(Date.parse(report.observed_at)))throw new Error('Expected a complete focused ViewPlan product export');
const candidates=report.rows.map(productLabelCandidate);
console.log(JSON.stringify({mode:apply?'stage observations':'preview only',rows:candidates.length,missingLabels:candidates.filter(r=>r.review_flags.includes('missing_label')).length,claimsRequireReview:true}));
if(apply){
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const {data,error}=await db.rpc('sync_product_label_observations',{p_rows:report.rows,p_observed_at:report.observed_at});
 if(error)throw new Error(error.message);
 console.log('Staged '+data+' source observations; reviewed product information unchanged.');
}
