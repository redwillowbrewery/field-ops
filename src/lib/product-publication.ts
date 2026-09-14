import type {SupabaseClient} from "@supabase/supabase-js";
import type {ProductInformation} from "./product-information";
export type ProductFamily={fining:"fined"|"unfined"|null;vegan:boolean|null;allergens_override:boolean;allergens:string|null};
export type ProductSpecification={name:string;description:string;abv:number|null;artwork_path:string|null;allergens:string|null;gluten_free:boolean|null;lactose_free:boolean|null;cask:ProductFamily;keg_can:ProductFamily};
export type PublishedProduct={product_id:string;specification:ProductSpecification};
export async function readPublishedProducts(db:SupabaseClient,ids:string[]):Promise<PublishedProduct[]>{
 const unique=[...new Set(ids)],result:PublishedProduct[]=[];
 for(let i=0;i<unique.length;i+=100){
  const {data,error}=await db.rpc("published_product_specs",{p_ids:unique.slice(i,i+100)});
  if(error)throw new Error("Published product information unavailable");
  result.push(...data as PublishedProduct[]);
 }
 return result;
}
export function publishedInformation(spec:ProductSpecification,format:string):ProductInformation{
 const family=format==="cask"?spec.cask:format==="keg"||format==="can"?spec.keg_can:null;
 return {allergens:family?.allergens_override?family.allergens:spec.allergens,gluten_free:spec.gluten_free,lactose_free:spec.lactose_free,vegan:family?.vegan??null,fining_status:family?.fining??null};
}
export function artworkUrl(productId:string,path:string|null){return path?"/product-artwork/"+encodeURIComponent(productId)+"/"+encodeURIComponent(path.split("/").at(-1)||""):null;}
