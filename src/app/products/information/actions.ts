"use server";
import {createClient} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
export async function saveInformation(form:FormData){
 const product=String(form.get("product")||"");const pkg=String(form.get("package")||"");
 const details:Record<string,string|boolean|null>={};
 for(const key of ["vegan","gluten_free","lactose_free","fining_status"]){
  const value=String(form.get(key)||"unknown");
  if(value==="inherit")continue;
  details[key]=value==="unknown"?null:value==="yes"?true:value==="no"?false:value;
 }
 const allergenMode=String(form.get("allergen_mode")||"unknown");
 if(allergenMode!=="inherit")details.allergens=allergenMode==="statement"?String(form.get("allergens")||"").trim():null;
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const {error}=await db.rpc("save_product_information",{p_product:product,p_package:pkg||null,p_revision:Number(form.get("revision")),p_details:details});
 revalidatePath("/products/information");revalidatePath("/price-list","layout");
 redirect("/products/information?product="+encodeURIComponent(product)+(pkg?"&package="+encodeURIComponent(pkg):"")+(error?"&error="+encodeURIComponent(error.message):"&saved=1"));
}
