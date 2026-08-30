import {NextResponse} from "next/server";
import {syncSellarAvailability} from "@/lib/sellar-availability-sync.mjs";

export const maxDuration=60;

export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});
 const required={NEXT_PUBLIC_SUPABASE_URL:process.env.NEXT_PUBLIC_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY,SELLAR_API_TOKEN:process.env.SELLAR_API_TOKEN};
 const missing=Object.entries(required).filter(([,value])=>!value).map(([name])=>name);
 if(missing.length)return NextResponse.json({ok:false,error:"Missing required environment variables",missing},{status:500});
 try{const result=await syncSellarAvailability({supabaseUrl:required.NEXT_PUBLIC_SUPABASE_URL,serviceRoleKey:required.SUPABASE_SERVICE_ROLE_KEY,sellarToken:required.SELLAR_API_TOKEN,sellarBaseUrl:process.env.SELLAR_API_BASE_URL});return NextResponse.json({ok:true,...result});}
 catch(error){const message=error instanceof Error?error.message:"Availability refresh failed";return NextResponse.json({ok:false,error:message},{status:500});}
}
