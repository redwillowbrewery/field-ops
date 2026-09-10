import type {SupabaseClient} from '@supabase/supabase-js';
export function searchPage(value:unknown){const n=Number(value);return Number.isSafeInteger(n)&&n>0?Math.min(n,100000):1;}
export async function searchProducts(db:SupabaseClient,text:string,page:number,source=false){
 const name=source?'source_name':'name',id=source?'external_id':'id';
 let query=source?db.from('product_source_observations').select('external_id,source_name',{count:'exact'}).is('product_id',null).eq('present_in_latest',true).eq('source_is_system',false).eq('source_business_exchange',false):db.from('products').select('id,name,active',{count:'exact'}).eq('business_exchange',false);
 // Single field filter, not a PostgREST expression. Escape LIKE metacharacters.
 const term=text.trim().slice(0,200).replace(/[\\%_]/g,c=>'\\'+c);
 if(term)query=query.ilike(name,'%'+term+'%');
 const result=await query.order(name).order(id).range((page-1)*50,page*50-1);
 if(result.error)throw new Error('Product search unavailable');
 return result;
}
export async function selectedProduct(db:SupabaseClient,id?:string){
 if(!id||!/^[a-f0-9-]{36}$/.test(id))return null;
 const {data,error}=await db.from('products').select('id,name,active').eq('id',id).eq('business_exchange',false).maybeSingle();
 if(error)throw new Error('Product unavailable');return data;
}
