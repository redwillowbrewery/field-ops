import {NextResponse} from "next/server";
import {syncSellarAvailability} from "@/lib/sellar-availability-sync.mjs";

export const maxDuration=60;

export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({ok:false,error:"Unauthorized"},{status:401});
 try{const result=await syncSellarAvailability({supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY,sellarToken:process.env.SELLAR_API_TOKEN,sellarBaseUrl:process.env.SELLAR_API_BASE_URL});return NextResponse.json({ok:true,...result});}
 catch(error){const message=error instanceof Error?error.message:"Availability refresh failed";return NextResponse.json({ok:false,error:message},{status:500});}
}
