"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabase";
import {transitionWeeklyProgress} from "@/lib/weekly-progress";

export type InteractionState={error?:string};
const CHANNELS=new Set(["call","email","whatsapp"]);const OUTCOMES=new Set(["contacted","no_answer","left_message","no_requirement","follow_up_required"]);

export async function recordInteraction(_previous:InteractionState,formData:FormData):Promise<InteractionState>{
 const accountId=String(formData.get("account_id")||"");const contactId=String(formData.get("contact_id")||"")||null;const channel=String(formData.get("channel")||"");const outcome=String(formData.get("outcome")||"");const note=String(formData.get("note")||"").trim();const weeklyPlanId=String(formData.get("weekly_plan_id")||"");const followUp=String(formData.get("follow_up")||"none");const customDate=String(formData.get("follow_up_date")||"");
 if(!accountId||!CHANNELS.has(channel)||!OUTCOMES.has(outcome))return{error:"Choose a valid channel and outcome."};
 const db=await createSupabaseServerClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 if(contactId){const {data:contact}=await db.from("contacts").select("id").eq("id",contactId).eq("account_id",accountId).maybeSingle();if(!contact)return{error:"That Contact does not belong to this Account."}}
 const {data:interaction,error}=await db.from("interactions").insert({account_id:accountId,contact_id:contactId,actor_id:user.id,channel,outcome,note:note||null,source_context:weeklyPlanId?"weekly_sales":"account"}).select("id").single();
 if(error)return{error:error.message};
 const dueAt=followUpDate(followUp,customDate);const hasFollowUp=Boolean(dueAt);
 if(hasFollowUp){const {error:taskError}=await db.from("tasks").insert({account_id:accountId,contact_id:contactId,interaction_id:interaction.id,assigned_to:user.id,task_type:channel==="whatsapp"?"other":channel,title:`Follow up after ${label(channel)}`,due_at:dueAt,status:"open"});if(taskError)return{error:`Interaction saved, but follow-up failed: ${taskError.message}`}}
 try{await transitionWeeklyProgress(db,{planId:weeklyPlanId,accountId,userId:user.id,hasFollowUp})}catch(error){return{error:`Interaction saved, but weekly progress failed: ${error instanceof Error?error.message:"Unknown error"}`}}
 revalidatePath(`/accounts/${accountId}`);revalidatePath("/sales");revalidatePath("/tasks");revalidatePath("/today");redirect(`/accounts/${accountId}`);
}

function followUpDate(choice:string,custom:string){const date=new Date();date.setHours(9,0,0,0);if(choice==="tomorrow")date.setDate(date.getDate()+1);else if(choice==="later_week"){const day=date.getDay();date.setDate(date.getDate()+Math.max(1,5-day))}else if(choice==="next_week"){const day=date.getDay();date.setDate(date.getDate()+((8-day)%7||7))}else if(choice==="choose"&&/^\d{4}-\d{2}-\d{2}$/.test(custom))return new Date(`${custom}T09:00:00`).toISOString();else return null;return date.toISOString()}
function label(value:string){return value==="whatsapp"?"WhatsApp":value}
