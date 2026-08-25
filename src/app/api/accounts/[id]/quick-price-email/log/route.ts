import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const body=await request.json().catch(()=>({}));const recipient=String(body.recipient||"").trim();const formats=Array.isArray(body.formats)?body.formats.map((v:unknown)=>String(v)).filter(Boolean):[];
 const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorised"},{status:401});
 const label=formats.map((f:string)=>f.charAt(0).toUpperCase()+f.slice(1)).join(" + ")||"current";
 const text=`Quick price list prepared for ${recipient||"customer"} · ${label}`;
 const {error}=await supabase.from("account_notes").insert({account_id:id,author_id:user.id,body:text});if(error)return NextResponse.json({error:error.message},{status:500});
 return NextResponse.json({ok:true});
}
