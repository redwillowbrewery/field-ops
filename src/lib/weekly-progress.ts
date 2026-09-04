import type {SupabaseClient} from "@supabase/supabase-js";

export async function transitionWeeklyProgress(db:SupabaseClient,{planId,accountId,userId,hasFollowUp}:{planId:string;accountId:string;userId:string;hasFollowUp:boolean}){
 if(!planId)return;
 const {data:current,error:readError}=await db.from("weekly_sales_account_progress").select("status").eq("plan_id",planId).eq("account_id",accountId).maybeSingle();
 if(readError)throw readError;
 if(current?.status==="complete")return;
 const status=hasFollowUp?"follow_up":current?.status==="follow_up"?"follow_up":"contacted";
 const {error}=await db.from("weekly_sales_account_progress").upsert({plan_id:planId,account_id:accountId,status,updated_by:userId});
 if(error)throw error;
}
