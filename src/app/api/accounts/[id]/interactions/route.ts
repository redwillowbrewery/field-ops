import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorised"},{status:401});
 const body=await request.json().catch(()=>null) as {interaction_type?:string;target?:string}|null;
 const type=body?.interaction_type;
 if(type!=="call"&&type!=="email")return NextResponse.json({error:"Invalid interaction type"},{status:400});
 const {error}=await supabase.from("account_interactions").insert({account_id:id,interaction_type:type,target:body?.target||null});
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({ok:true});
}
