import {readPublishedProducts,publishedInformation,artworkUrl,type PublishedProduct} from "@/lib/product-publication";
import {readProductInformation,effectiveProductInformation,type InformationData,type ProductInformation} from "@/lib/product-information";
import type {SupabaseClient} from "@supabase/supabase-js";
import {getEffectivePrices} from "@/lib/account-selling";
import {packageAllowedForAccount,packageSalesLabel,type AccountContainerPreference,type CanonicalPackage} from "@/lib/package-eligibility";

export type ComingSoonItem={productId:string;productName:string;description:string;imageUrl:string|null;abv:number|string|null;estimatedDate:string|null;packages:{id:string;label:string;broadFormat:string;price:number|null;estimatedDate:string|null;information?:ProductInformation}[]};
export type ComingSoonResult={status:"fresh"|"unavailable";observedAt:string|null;items:ComingSoonItem[]};
export type PlanningPreview={productId:string;productName:string;description:string;imageUrl:string|null;abv:number|string|null;package:(CanonicalPackage&{id:string})|null;variantId:string|null;estimatedDate:string|null};
type Price={product_variant_id:string;customer_price:number|string|null;list_price:number|string|null};
const earlier=(a:string|null,b:string|null)=>a&&b?(a<b?a:b):a||b;
const money=(v:number|string|null|undefined)=>v==null||!Number.isFinite(Number(v))?null:Number(v);

export function composeComingSoon(rows:PlanningPreview[],prices:Price[],preference:AccountContainerPreference,information:InformationData={products:[],packages:[]},publications:PublishedProduct[]=[]):ComingSoonItem[]{
 const result=new Map<string,ComingSoonItem>();
 const priceMap=new Map(prices.map(p=>[p.product_variant_id,p]));
 for(const row of rows){
  if(row.package&&!packageAllowedForAccount(row.package,preference))continue;
  const spec=publications.find(p=>p.product_id===row.productId)?.specification;
  let item=result.get(row.productId);
  if(!item){item={productId:row.productId,productName:spec?.name??row.productName,description:spec?.description??row.description,imageUrl:spec?artworkUrl(row.productId,spec.artwork_path):row.imageUrl,abv:spec?spec.abv:row.abv,estimatedDate:null,packages:[]};result.set(row.productId,item);}
  item.estimatedDate=earlier(item.estimatedDate,row.estimatedDate);
  if(!row.package)continue;
  const existing=item.packages.find(p=>p.id===row.package!.id);
  if(existing){existing.estimatedDate=earlier(existing.estimatedDate,row.estimatedDate);continue;}
  const price=row.variantId?priceMap.get(row.variantId):undefined;
  item.packages.push({id:row.package.id,label:packageSalesLabel(row.package,row.package.name),broadFormat:row.package.broad_format,price:money(price?.customer_price??price?.list_price),estimatedDate:row.estimatedDate,information:spec?publishedInformation(spec,row.package.broad_format):effectiveProductInformation(information,row.productId,row.package.id)});
 }
 return [...result.values()].sort((a,b)=>(a.estimatedDate||"9999").localeCompare(b.estimatedDate||"9999")||a.productName.localeCompare(b.productName));
}

export async function getComingSoon(db:SupabaseClient,accountId:string|null,preference:AccountContainerPreference):Promise<ComingSoonResult>{
 // A failed planning read must not remove the existing available-beer price list.
 try{
  const {data,error}=await db.rpc("price_list_coming_soon");
  if(error||!data||data.status!=="fresh")return{status:"unavailable",observedAt:data?.observedAt||null,items:[]};
  const rows=data.items as PlanningPreview[];
  const permitted=rows.filter(row=>!row.package||packageAllowedForAccount(row.package,preference));
  const ids=[...new Set(permitted.flatMap(row=>row.variantId?[row.variantId]:[]))];
  const [prices,information,publications]=await Promise.all([getEffectivePrices(db,accountId,ids),readProductInformation(db,permitted.map(row=>row.productId)),readPublishedProducts(db,permitted.map(row=>row.productId))]);
  return{status:"fresh",observedAt:data.observedAt,items:composeComingSoon(permitted,prices,preference,information,publications)};
 }catch{return{status:"unavailable",observedAt:null,items:[]};}
}
