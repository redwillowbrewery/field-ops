-- Keep CRM workflow writes atomic so retries cannot leave partial records.

create unique index if not exists appointments_interaction_unique
  on public.appointments(interaction_id) where interaction_id is not null;

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
  if p_contact_id is not null and not exists(select 1 from public.contacts where id = p_contact_id and account_id = p_account_id) then
    raise exception 'That Contact does not belong to this Account';
  end if;
  if p_channel not in ('call','email','whatsapp') then raise exception 'Choose a valid channel'; end if;
  if p_outcome not in ('contacted','no_answer','left_message','no_requirement','follow_up_required') then raise exception 'Choose a valid outcome'; end if;
  if p_outcome = 'follow_up_required' and p_follow_up_due_date is null and not p_schedule_appointment then
    raise exception 'Choose a follow-up date or schedule an appointment';
  end if;
  if char_length(coalesce(p_note,'')) > 2000 then raise exception 'The note is too long'; end if;

  if p_follow_up_due_date is not null then
    v_due_at := (p_follow_up_due_date + time '09:00') at time zone 'Europe/London';
  end if;

  insert into public.interactions(account_id,contact_id,actor_id,channel,outcome,note,source_context)
  values(p_account_id,p_contact_id,v_user_id,p_channel,p_outcome,nullif(btrim(p_note),''),case when p_weekly_plan_id is null then 'account' else 'weekly_sales' end)
  returning id into v_interaction_id;

  if v_due_at is not null then
    insert into public.tasks(account_id,contact_id,interaction_id,assigned_to,task_type,title,due_at,status)
    values(p_account_id,p_contact_id,v_interaction_id,v_user_id,
      case when p_channel = 'whatsapp' then 'other'::public.task_type else p_channel::public.task_type end,
      'Follow up after ' || case when p_channel = 'whatsapp' then 'WhatsApp' else p_channel end,
      v_due_at,'open');
  end if;

  if p_weekly_plan_id is not null then
    select status into v_current from public.weekly_sales_account_progress
      where plan_id = p_weekly_plan_id and account_id = p_account_id;
    v_next := case
      when v_current = 'complete' then 'complete'::public.weekly_sales_progress_status
      when v_due_at is not null or p_schedule_appointment or v_current = 'follow_up' then 'follow_up'::public.weekly_sales_progress_status
      else 'contacted'::public.weekly_sales_progress_status end;
    insert into public.weekly_sales_account_progress(plan_id,account_id,status,updated_by,updated_at)
    values(p_weekly_plan_id,p_account_id,v_next,v_user_id,now())
    on conflict(plan_id,account_id) do update set status=excluded.status,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  end if;
  return v_interaction_id;
end;
$$;

create or replace function public.record_account_visit(
  p_account_id uuid,
  p_appointment_id uuid,
  p_contact_id uuid,
  p_new_contact_name text,
  p_new_contact_role text,
  p_new_contact_email text,
  p_new_contact_phone text,
  p_notes text,
  p_outcome text,
  p_task_type text,
  p_task_title text,
  p_due_date date
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_contact_id uuid := p_contact_id;
  v_visit_id uuid;
  v_interaction_id uuid;
  v_now timestamptz := now();
  v_due_at timestamptz;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.accounts where id=p_account_id) then raise exception 'Account not found'; end if;
  if p_outcome not in ('good','neutral','problem','opportunity') then raise exception 'Choose a valid visit outcome'; end if;
  if v_contact_id is not null and not exists(select 1 from public.contacts where id=v_contact_id and account_id=p_account_id) then
    raise exception 'That Contact does not belong to this Account';
  end if;
  if p_appointment_id is not null and not exists(select 1 from public.appointments where id=p_appointment_id and account_id=p_account_id and assigned_to=v_user_id) then
    raise exception 'Appointment not found';
  end if;
  if nullif(btrim(p_new_contact_name),'') is not null then
    if v_contact_id is not null then raise exception 'Choose an existing Contact or add a new one, not both'; end if;
    insert into public.contacts(account_id,full_name,job_title,email,phone,source,active)
    values(p_account_id,btrim(p_new_contact_name),nullif(btrim(p_new_contact_role),''),nullif(btrim(p_new_contact_email),''),nullif(btrim(p_new_contact_phone),''),'field_ops',true)
    returning id into v_contact_id;
  end if;
  if nullif(p_task_type,'') is not null and p_task_type not in ('call','email','quote','samples','revisit','order','other') then raise exception 'Choose a valid follow-up type'; end if;
  if p_due_date is not null then v_due_at := (p_due_date + time '09:00') at time zone 'Europe/London'; end if;

  insert into public.visits(account_id,appointment_id,contact_id,salesperson_id,started_at,completed_at,notes,outcome)
  values(p_account_id,p_appointment_id,v_contact_id,v_user_id,v_now,v_now,nullif(btrim(p_notes),''),p_outcome::public.visit_outcome)
  returning id into v_visit_id;
  insert into public.interactions(account_id,contact_id,actor_id,channel,occurred_at,source_context,visit_id)
  values(p_account_id,v_contact_id,v_user_id,'visit',v_now,'visit',v_visit_id) returning id into v_interaction_id;
  if nullif(p_task_type,'') is not null then
    insert into public.tasks(account_id,contact_id,visit_id,interaction_id,assigned_to,task_type,title,due_at,status)
    values(p_account_id,v_contact_id,v_visit_id,v_interaction_id,v_user_id,p_task_type::public.task_type,
      coalesce(nullif(btrim(p_task_title),''),initcap(replace(p_task_type,'_',' ')) || ' follow-up'),v_due_at,'open');
  end if;
  update public.accounts set last_visit_at=v_now,next_visit_due=case when p_task_type='revisit' then p_due_date else null end where id=p_account_id;
  if p_appointment_id is not null then update public.appointments set status='completed' where id=p_appointment_id; end if;
  return v_visit_id;
end;
$$;

create or replace function public.create_brewery_ops_prospect(
  p_name text, p_classification text, p_address_line_1 text, p_town text, p_postcode text,
  p_phone text, p_email text, p_website text, p_latitude double precision, p_longitude double precision,
  p_contact_name text, p_contact_role text, p_contact_phone text, p_contact_email text, p_notes text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid := auth.uid(); v_account_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'Prospect name is required'; end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then raise exception 'Latitude is invalid'; end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then raise exception 'Longitude is invalid'; end if;
  insert into public.accounts(name,classification,relationship_status,assigned_rep_id,address_line_1,town,postcode,country,phone,email,website,latitude,longitude,geocoded_at,active)
  values(btrim(p_name),nullif(btrim(p_classification),''),'prospect',v_user_id,nullif(btrim(p_address_line_1),''),nullif(btrim(p_town),''),nullif(btrim(p_postcode),''),'United Kingdom',nullif(btrim(p_phone),''),nullif(btrim(p_email),''),nullif(btrim(p_website),''),p_latitude,p_longitude,case when p_latitude is not null and p_longitude is not null then now() end,true)
  returning id into v_account_id;
  if nullif(btrim(p_contact_name),'') is not null then
    insert into public.contacts(account_id,full_name,job_title,phone,email,is_primary,active,source)
    values(v_account_id,btrim(p_contact_name),nullif(btrim(p_contact_role),''),nullif(btrim(p_contact_phone),''),nullif(btrim(p_contact_email),''),true,true,'field_ops');
  end if;
  if nullif(btrim(p_notes),'') is not null then insert into public.account_notes(account_id,author_id,body) values(v_account_id,v_user_id,btrim(p_notes)); end if;
  return v_account_id;
end;
$$;

revoke all on function public.record_account_interaction(uuid,uuid,text,text,text,uuid,date,boolean) from public;
revoke all on function public.record_account_visit(uuid,uuid,uuid,text,text,text,text,text,text,text,text,date) from public;
revoke all on function public.create_brewery_ops_prospect(text,text,text,text,text,text,text,text,double precision,double precision,text,text,text,text,text) from public;
grant execute on function public.record_account_interaction(uuid,uuid,text,text,text,uuid,date,boolean) to authenticated;
grant execute on function public.record_account_visit(uuid,uuid,uuid,text,text,text,text,text,text,text,text,date) to authenticated;
grant execute on function public.create_brewery_ops_prospect(text,text,text,text,text,text,text,text,double precision,double precision,text,text,text,text,text) to authenticated;
