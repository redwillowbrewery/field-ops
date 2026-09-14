import {createClient} from "@supabase/supabase-js";

export async function syncSellarAvailability({supabaseUrl,serviceRoleKey,sellarToken,sellarBaseUrl="https://api.sellar.io"}){
 if(!supabaseUrl||!serviceRoleKey||!sellarToken)throw new Error("Missing Supabase service credentials or SELLAR_API_TOKEN.");
 const db=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});const startedAt=new Date().toISOString();let runId=null;
 try{
  const {data:run,error:runError}=await db.from("connector_sync_runs").insert({source_system:"sellar",module:"availability",mode:"full",status:"running",started_at:startedAt}).select("id").single();if(runError)throw runError;runId=run.id;
  const products=await fetchProducts(sellarBaseUrl,sellarToken);if(!products.length)throw new Error("Sellar returned zero products; preserving the previous snapshot.");
  const ids=products.map(p=>String(p.id));const mappings=[];
  for(let i=0;i<ids.length;i+=200){const {data,error}=await db.from("product_variant_external_ids").select("external_id,product_variant_id").eq("system","sellar").in("external_id",ids.slice(i,i+200));if(error)throw error;mappings.push(...(data||[]));}
  const byExternal=new Map(mappings.map(m=>[String(m.external_id),m.product_variant_id]));const variantIds=[...new Set(mappings.map(m=>m.product_variant_id))];const variantProduct=new Map();
  for(let i=0;i<variantIds.length;i+=200){const {data,error}=await db.from("product_variants").select("id,product_id,allow_sale,package_id").in("id",variantIds.slice(i,i+200));if(error)throw error;for(const v of data||[])if(v.allow_sale&&v.package_id)variantProduct.set(v.id,v.product_id);}
  const observedAt=new Date().toISOString();const snapshots=[];const observedProducts=new Set();let unmapped=0;
  for(const p of products){const variantId=byExternal.get(String(p.id));const productId=variantId&&variantProduct.get(variantId);if(!variantId||!productId){unmapped+=1;continue;}snapshots.push({product_variant_id:variantId,available_quantity:p.validatedStock,source_system:"sellar",source_reference:String(p.id),source_observed_at:observedAt,refreshed_at:observedAt,updated_at:observedAt});observedProducts.add(productId);}
  if(!snapshots.length)throw new Error("No Sellar rows resolved to saleable canonical variants with packages; preserving the previous snapshot.");
  const observedVariantIds=new Set(snapshots.map(row=>row.product_variant_id));const previous=[];
  for(let offset=0;;offset+=500){const {data,error}=await db.from("availability_snapshots").select("product_variant_id,source_reference").eq("source_system","sellar").order("product_variant_id").range(offset,offset+499);if(error)throw error;previous.push(...(data||[]));if((data||[]).length<500)break;}
  for(const row of previous||[])if(!observedVariantIds.has(row.product_variant_id))snapshots.push({product_variant_id:row.product_variant_id,available_quantity:0,source_system:"sellar",source_reference:String(row.source_reference),source_observed_at:observedAt,refreshed_at:observedAt,updated_at:observedAt});
  const {error:snapshotError}=await db.from("availability_snapshots").upsert(snapshots,{onConflict:"product_variant_id"});if(snapshotError)throw snapshotError;
  // Existing presentation snapshots are retained as adoption evidence. Routine Sellar sync owns availability only.
  const completedAt=new Date().toISOString();await checked(db.from("connector_sync_state").upsert({source_system:"sellar",module:"availability",last_success_at:completedAt,last_full_sync_at:completedAt,last_row_count:snapshots.length,last_error:null,updated_at:completedAt},{onConflict:"source_system,module"}));await checked(db.from("connector_sync_runs").update({status:"completed",rows_read:products.length,rows_written:snapshots.length,completed_at:completedAt,notes:`${unmapped} rows skipped because no eligible exact canonical mapping was found.`}).eq("id",runId));
  return{variants:snapshots.length,products:observedProducts.size,skipped:unmapped,completedAt};
 }catch(error){
  const message=errorMessage(error),failedAt=new Date().toISOString();const reportingErrors=[];
  try{await checked(db.from('connector_sync_state').upsert({source_system:'sellar',module:'availability',last_row_count:0,last_error:message,updated_at:failedAt},{onConflict:'source_system,module'}));}catch{reportingErrors.push('state');}
  if(runId){try{await checked(db.from('connector_sync_runs').update({status:'failed',notes:message,completed_at:failedAt}).eq('id',runId));}catch{reportingErrors.push('run');}}
  throw new Error(message+(reportingErrors.length?' (Could not record '+reportingErrors.join(' and ')+' failure.)':''));
 }
}

async function checked(query){const result=await query;if(result.error)throw result.error;return result;}
export async function fetchProducts(base,token,{fetchImpl=fetch,pageSize=100,maxRows=100000}={}){
 const all=[],seen=new Set();
 for(let offset=0;offset<maxRows;offset+=pageSize){
  const request=new URL('/products',base);
  request.searchParams.set('limit',String(pageSize));request.searchParams.set('offset',String(offset));
  const response=await fetchImpl(request,{signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,Accept:'application/json','User-Agent':'RedWillow-BreweryOps-Availability/1.0'}});
  if(!response.ok)throw new Error('Sellar products failed: '+response.status);
  const body=await response.json();
  const rows=Array.isArray(body)?body:Array.isArray(body?.data)?body.data:Array.isArray(body?.data?.rows)?body.data.rows:Array.isArray(body?.rows)?body.rows:null;
  if(!rows||rows.length>pageSize)throw new Error('Invalid Sellar page; preserving previous availability.');
  for(const row of rows){
   if(!row||typeof row!=='object'||!['string','number'].includes(typeof row.id)||!String(row.id).trim()||(typeof row.id==='number'&&!Number.isSafeInteger(row.id)))throw new Error('Invalid Sellar product identity.');
   const id=String(row.id);if(seen.has(id))throw new Error('Duplicate Sellar identity or repeated page.');seen.add(id);
   const stock=row.availableStock??row.stock;
   if(!['number','string'].includes(typeof stock)||String(stock).trim()===''||!Number.isFinite(Number(stock))||Number(stock)<0)throw new Error('Invalid or missing Sellar stock; preserving previous availability.');
   all.push({...row,validatedStock:Number(stock)});
  }
  if(rows.length<pageSize)return all;
 }
 throw new Error('Sellar pagination limit reached; completeness unproven.');
}
export function errorMessage(error){if(error instanceof Error)return error.message;if(error&&typeof error==="object"){const parts=[error.message,error.details,error.hint,error.code].filter(Boolean);if(parts.length)return parts.join(" | ");try{return JSON.stringify(error)}catch{}}return String(error)}
