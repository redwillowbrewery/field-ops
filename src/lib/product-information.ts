import type {SupabaseClient} from "@supabase/supabase-js";
export type ProductInformation={allergens:string|null;vegan:boolean|null;gluten_free:boolean|null;lactose_free:boolean|null;fining_status:"fined"|"unfined"|null};
export type InformationFields=Partial<ProductInformation>;
export type InformationRecord={product_id:string;package_id?:string;details:InformationFields};
export type InformationData={products:InformationRecord[];packages:InformationRecord[]};
export function effectiveProductInformation(data:InformationData,productId:string,packageId?:string):ProductInformation{
 const defaults=data.products.find(r=>r.product_id===productId)?.details||{};
 const override=packageId?data.packages.find(r=>r.product_id===productId&&r.package_id===packageId)?.details||{}:{};
 // Missing keys inherit; explicit null deliberately means unconfirmed for this package.
 return {allergens:null,vegan:null,gluten_free:null,lactose_free:null,fining_status:null,...defaults,...override};
}
export async function readProductInformation(db:SupabaseClient,ids:string[]):Promise<InformationData>{
 const result:InformationData={products:[],packages:[]};
 const unique=[...new Set(ids)];
 async function all(table:"product_information"|"product_package_information",batch:string[]){
  const rows:InformationRecord[]=[];
  for(let offset=0;;offset+=1000){
   let query=db.from(table).select(table==="product_information"?"product_id,details":"product_id,package_id,details").in("product_id",batch).order("product_id");
   if(table==="product_package_information")query=query.order("package_id");
   const {data,error}=await query.range(offset,offset+999);
   if(error)throw new Error("Product information is unavailable");
   rows.push(...data as unknown as InformationRecord[]);
   if(data.length<1000)return rows;
  }
 }
 for(let start=0;start<unique.length;start+=100){
  const batch=unique.slice(start,start+100);
  const [products,packages]=await Promise.all([all("product_information",batch),all("product_package_information",batch)]);
  result.products.push(...products);result.packages.push(...packages);
 }
 return result;
}
