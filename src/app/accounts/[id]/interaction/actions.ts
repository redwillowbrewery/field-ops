"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabase";

export type InteractionState={error?:string};
const CHANNELS=new Set(["call","email","whatsapp"]);const OUTCOMES=new Set(["contacted","no_answer","left_message","no_requirement","follow_up_required"]);

export async function recordInteraction(_previous:InteractionState,formData:FormData):Promise<InteractionState>{
 const accountId=String(formData.get("account_id")||"");const contactId=String(formData.get("contact_id")||"")||null;const channel=String(formData.get("channel")||"");const outcome=String(formData.get("outcome")||"");const note=String(formData.get("note")||"").trim();const weeklyPlanId=String(formData.get("weekly_plan_id")||"");const followUp=String(formData.get("follow_up")||"none");const customDate=String(formData.get("follow_up_date")||"");const intent=String(formData.get("intent")||"save");
 if(!accountId||!CHANNELS.has(channel)||!OUTCOMES.has(outcome))return{error:"Choose a valid channel and outcome."};
 const db=await createSupabaseServerClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const dueDate=followUpDate(followUp,customDate);const scheduleAppointment=intent==="schedule";
 if(outcome==="follow_up_required"&&!dueDate&&!scheduleAppointment)return{error:"Choose a follow-up date or save and schedule an appointment."};
 const {data:interactionId,error}=await db.rpc("record_account_interaction",{p_account_id:accountId,p_contact_id:contactId,p_channel:channel,p_outcome:outcome,p_note:note,p_weekly_plan_id:weeklyPlanId||null,p_follow_up_due_date:dueDate,p_schedule_appointment:scheduleAppointment});
 if(error)return{error:error.message};
 revalidatePath(`/accounts/${accountId}`);revalidatePath("/sales");revalidatePath("/tasks");revalidatePath("/today");
 if(scheduleAppointment)redirect(`/accounts/${accountId}/appointment?interaction_id=${interactionId}`);
 redirect(`/accounts/${accountId}`);
}

function followUpDate(choice:string,custom:string){const date=new Date();if(choice==="tomorrow")date.setDate(date.getDate()+1);else if(choice==="later_week"){const day=date.getDay();date.setDate(date.getDate()+Math.max(1,5-day))}else if(choice==="next_week"){const day=date.getDay();date.setDate(date.getDate()+((8-day)%7||7))}else if(choice==="choose"&&/^\d{4}-\d{2}-\d{2}$/.test(custom))return custom;else return null;return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`}
