"use server";
import {createSupabaseServerClient} from "@/lib/supabase";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
export async function savePlan(f:FormData){
 const db=await createSupabaseServerClient();
 const {error}=await db.rpc("plan_fulfilment_order",{p_source:Number(f.get("source")),p_source_revision:Number(f.get("source_revision")),p_plan_revision:Number(f.get("plan_revision")),p_date:String(f.get("date")||""),p_vehicle:f.get("vehicle")?Number(f.get("vehicle")):null});
 revalidatePath("/fulfilment");
 const week=String(f.get("week")||"");
 redirect("/fulfilment?week="+encodeURIComponent(week)+(error?"&error="+encodeURIComponent(error.message):"&saved=1"));
}

export async function saveRouteDraft(rows:{source:number;source_revision:number;plan_revision:number;date:string;vehicle:number|null;position:number}[]){
 const db=await createSupabaseServerClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return {error:"Sign in required"};
 if(!Array.isArray(rows)||!rows.length||rows.length>1000)return {error:"Invalid planning scope"};
 const {error}=await db.rpc("save_fulfilment_sequence",{p_rows:rows});
 if(error)return {error:error.message};
 revalidatePath("/fulfilment");
 return {error:null};
}
