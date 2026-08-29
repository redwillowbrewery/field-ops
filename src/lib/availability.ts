import {packageAllowedForAccount,type AccountContainerPreference,type CanonicalPackage} from "@/lib/package-eligibility";
import type {SupabaseClient} from "@supabase/supabase-js";

type Presentation={description:string|null;image_url:string|null;hero_image_url:string|null;abv:number|string|null;gluten_free:boolean|null;vegan:boolean|null;lactose_free:boolean|null};
type JoinedRow={available_quantity:number|string;source_system:string;source_observed_at:string;refreshed_at:string;variant:{id:string;package_type:string;broad_format:string;allow_sale:boolean;product:{id:string;name:string;presentation:Presentation|Presentation[]|null}|{id:string;name:string;presentation:Presentation|Presentation[]|null}[]|null;package:CanonicalPackage|CanonicalPackage[]|null}|null};
export type AvailabilityItem={variantId:string;productId:string;productName:string;packageType:string;broadFormat:string;package:CanonicalPackage;availableQuantity:number;sourceSystem:string;observedAt:string;refreshedAt:string;presentation:Presentation|null};
export type AvailabilityResult={items:AvailabilityItem[];observedAt:string|null;lastRefreshError:string|null};

export async function getAccountAvailability(db:SupabaseClient,preference:AccountContainerPreference):Promise<AvailabilityResult>{
 const {data,error}=await db.from("availability_snapshots").select("available_quantity,source_system,source_observed_at,refreshed_at,variant:product_variants!inner(id,package_type,broad_format,allow_sale,product:products!inner(id,name,presentation:product_presentations(description,image_url,hero_image_url,abv,gluten_free,vegan,lactose_free)),package:packages!inner(id,name,broad_format,package_system,lifecycle,procurement_mode))").gt("available_quantity",0);
 if(error)throw error;
 const items:AvailabilityItem[]=[];
 for(const row of (data||[]) as unknown as JoinedRow[]){const variant=row.variant;const product=single(variant?.product);const pkg=single(variant?.package);if(!variant?.allow_sale||!product||!pkg||!packageAllowedForAccount(pkg,preference))continue;items.push({variantId:variant.id,productId:product.id,productName:product.name,packageType:variant.package_type,broadFormat:pkg.broad_format,package:pkg,availableQuantity:Number(row.available_quantity),sourceSystem:row.source_system,observedAt:row.source_observed_at,refreshedAt:row.refreshed_at,presentation:single(product.presentation)});}
 items.sort((a,b)=>a.productName.localeCompare(b.productName)||a.package.name.localeCompare(b.package.name));
 const observedAt=items.map(i=>i.observedAt).sort().at(-1)||null;
 const {data:state}=await db.from("connector_sync_state").select("last_error").eq("source_system","sellar").eq("module","availability").maybeSingle();
 return{items,observedAt,lastRefreshError:state?.last_error||null};
}
function single<T>(v:T|T[]|null|undefined){return Array.isArray(v)?v[0]||null:v||null}
