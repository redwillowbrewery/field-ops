"use server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
const text=(f:FormData,k:string)=>String(f.get(k)||"");
const number=(f:FormData,k:string)=>text(f,k)===""?null:Number(text(f,k));
async function run(name:string,args:Record<string,unknown>,brew:string){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const {error}=await db.rpc(name,args);
 revalidatePath("/take-off");
 // RPC validation messages contain no source query or credentials.
 redirect("/take-off?brew="+encodeURIComponent(brew)+"&"+(error?"error="+encodeURIComponent(error.message):"saved=1"));
}
export async function saveRequest(f:FormData){
 await run("save_take_off_request",{p_subject:text(f,"subject"),p_package:text(f,"package"),p_quantity:number(f,"quantity"),p_date:text(f,"date"),p_notes:text(f,"notes"),p_id:text(f,"id")||null,p_revision:number(f,"revision"),p_withdraw:text(f,"withdraw")==="true",p_account:text(f,"account")||null},text(f,"brew"));
}
export async function approveRequest(f:FormData){
 await run("approve_take_off_request",{p_id:text(f,"id"),p_revision:number(f,"revision"),p_context:text(f,"context"),p_quantity:number(f,"quantity"),p_date:text(f,"date"),p_extra:number(f,"extra"),p_response:text(f,"response")},text(f,"brew"));
}
export async function linkPlan(f:FormData){
 await run("link_take_off_plan",{p_plan:text(f,"plan"),p_batch:text(f,"batch"),p_revision:number(f,"revision"),p_reason:text(f,"reason")},text(f,"batch"));
}

export async function saveGrid(f:FormData){
 let items:unknown;
 try{items=JSON.parse(text(f,"items"));}catch{redirect("/take-off?error=Invalid%20quantities");}
 await run("save_take_off_grid",{p_subject:text(f,"brew"),p_context:text(f,"context"),p_requests_context:text(f,"requests_context"),p_items:items},text(f,"brew"));
}
