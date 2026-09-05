-- Preserve the same weekly-plan eligibility enforced by RLS when the atomic
-- interaction function writes through its security-definer transaction.

create or replace function public.record_account_interaction(
  p_account_id uuid,
  p_contact_id uuid,
  p_channel text,
  p_outcome text,
  p_note text,
  p_weekly_plan_id uuid,
  p_follow_up_due_date date,
  p_schedule_appointment boolean default false
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_interaction_id uuid;
  v_due_at timestamptz;
  v_current public.weekly_sales_progress_status;
  v_next public.weekly_sales_progress_status;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.accounts where id = p_account_id) then raise exception 'Account not found'; end if;
  if p_contact_id is not null and not exists(select 1 from public.contacts where id = p_contact_id and account_id = p_account_id) then raise exception 'That Contact does not belong to this Account'; end if;
  if p_channel not in ('call','email','whatsapp') then raise exception 'Choose a valid channel'; end if;
  if p_outcome not in ('contacted','no_answer','left_message','no_requirement','follow_up_required') then raise exception 'Choose a valid outcome'; end if;
  if p_outcome = 'follow_up_required' and p_follow_up_due_date is null and not coalesce(p_schedule_appointment,false) then raise exception 'Choose a follow-up date or schedule an appointment'; end if;
  if char_length(coalesce(p_note,'')) > 2000 then raise exception 'The note is too long'; end if;
  if p_weekly_plan_id is not null and not exists(
    select 1 from public.accounts a
    join public.weekly_sales_plan_territories pt on pt.territory_id = a.territory_id
    join public.weekly_sales_plans p on p.id = pt.plan_id
    where a.id = p_account_id and p.id = p_weekly_plan_id and a.sales_service_model = 'territory'
      and a.active and coalesce(a.brewery_available,true) and a.relationship_status <> 'closed'
  ) then raise exception 'This Account is not in that weekly sales plan'; end if;

  if p_follow_up_due_date is not null then v_due_at := (p_follow_up_due_date + time '09:00') at time zone 'Europe/London'; end if;
  insert into public.interactions(account_id,contact_id,actor_id,channel,outcome,note,source_context)
  values(p_account_id,p_contact_id,v_user_id,p_channel,p_outcome,nullif(btrim(p_note),''),case when p_weekly_plan_id is null then 'account' else 'weekly_sales' end)
  returning id into v_interaction_id;
  if v_due_at is not null then
    insert into public.tasks(account_id,contact_id,interaction_id,assigned_to,task_type,title,due_at,status)
    values(p_account_id,p_contact_id,v_interaction_id,v_user_id,case when p_channel='whatsapp' then 'other'::public.task_type else p_channel::public.task_type end,
      'Follow up after ' || case when p_channel='whatsapp' then 'WhatsApp' else p_channel end,v_due_at,'open');
  end if;
  if p_weekly_plan_id is not null then
    select status into v_current from public.weekly_sales_account_progress where plan_id=p_weekly_plan_id and account_id=p_account_id;
    v_next := case when v_current='complete' then 'complete'::public.weekly_sales_progress_status
      when v_due_at is not null or coalesce(p_schedule_appointment,false) or v_current='follow_up' then 'follow_up'::public.weekly_sales_progress_status
      else 'contacted'::public.weekly_sales_progress_status end;
    insert into public.weekly_sales_account_progress(plan_id,account_id,status,updated_by,updated_at)
    values(p_weekly_plan_id,p_account_id,v_next,v_user_id,now())
    on conflict(plan_id,account_id) do update set status=excluded.status,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  end if;
  return v_interaction_id;
end;
$$;
