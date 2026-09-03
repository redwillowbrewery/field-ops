import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorised"},{status:401});
 const body=await request.json().catch(()=>null) as {interaction_type?:string;target?:string;weekly_plan_id?:string}|null;
 const type=body?.interaction_type;
 if(type!=="call"&&type!=="email")return NextResponse.json({error:"Invalid interaction type"},{status:400});
 const target=String(body?.target||"").trim();
 const {error}=await supabase.from("account_notes").insert({account_id:id,author_id:user.id,body:`[${type}] ${target}`.trim()});
 if(error)return NextResponse.json({error:error.message},{status:400});
 const weeklyPlanId=String(body?.weekly_plan_id||"").trim();
 if(weeklyPlanId){
  const {error:progressError}=await supabase.from("weekly_sales_account_progress").upsert({plan_id:weeklyPlanId,account_id:id,status:"contacted",updated_by:user.id});
  if(progressError)return NextResponse.json({error:progressError.message},{status:400});
 }
 return NextResponse.json({ok:true});
}
