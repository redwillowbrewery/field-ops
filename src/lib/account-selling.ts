import type {SupabaseClient} from "@supabase/supabase-js";
import {getAccountAvailability,type AvailabilityResult} from "@/lib/availability";
import {packageSalesLabel,type AccountContainerPreference} from "@/lib/package-eligibility";

type EffectivePriceRow={product_variant_id:string;list_price:number|string|null;customer_price:number|string|null};
export type AccountSellingRow={variantId:string;productId:string;productName:string;packageLabel:string;broadFormat:string;availableQuantity:number;customerPrice:number|null;listPrice:number|null;description:string;imageUrl:string|null;abv:number|string|null};
export type AccountSellingResult={rows:AccountSellingRow[];observedAt:string|null;lastRefreshError:string|null};

/** The canonical, account-aware dataset used by every customer selling surface. */
export async function getAccountSellingData(db:SupabaseClient,accountId:string,preference:AccountContainerPreference):Promise<AccountSellingResult>{
 const availability=await getAccountAvailability(db,preference);
 const prices=await getEffectivePrices(db,accountId,availability.items.map(item=>item.variantId));
 return composeAccountSellingRows(availability,prices);
}

export function composeAccountSellingRows(availability:AvailabilityResult,prices:EffectivePriceRow[]):AccountSellingResult{
 const priceByVariant=new Map(prices.map(row=>[row.product_variant_id,row]));
 const rows=availability.items.map(item=>{const price=priceByVariant.get(item.variantId);return{variantId:item.variantId,productId:item.productId,productName:item.productName,packageLabel:packageSalesLabel(item.package,item.packageType),broadFormat:item.broadFormat,availableQuantity:item.availableQuantity,customerPrice:toPrice(price?.customer_price),listPrice:toPrice(price?.list_price),description:item.presentation?.description||"",imageUrl:item.presentation?.image_url||null,abv:item.presentation?.abv??null}});
 return{rows,observedAt:availability.observedAt,lastRefreshError:availability.lastRefreshError};
}
function toPrice(value:number|string|null|undefined){if(value==null)return null;const number=Number(value);return Number.isFinite(number)?number:null}

async function getEffectivePrices(db:SupabaseClient,accountId:string,variantIds:string[]){
 if(!variantIds.length)return [];
 const {data,error}=await db.rpc("customer_effective_prices_for_variants",{p_account_id:accountId,p_product_variant_ids:variantIds});
 if(error)throw error;
 return(data||[]) as EffectivePriceRow[];
}
