-- Sprint 2C: canonical Interaction foundation and explicit prospect reconciliation.

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  channel text not null check (channel in ('call','email','whatsapp','visit')),
  outcome text check (outcome is null or outcome in ('contacted','no_answer','left_message','no_requirement','follow_up_required')),
  note text check (note is null or char_length(note) <= 2000),
  occurred_at timestamptz not null default now(),
  source_context text not null default 'account' check (source_context in ('account','weekly_sales','visit')),
  visit_id uuid unique references public.visits(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((channel = 'visit') = (visit_id is not null))
);

alter table public.tasks add column interaction_id uuid references public.interactions(id) on delete set null;
alter table public.appointments add column interaction_id uuid references public.interactions(id) on delete set null;

create index interactions_account_occurred_idx on public.interactions(account_id, occurred_at desc);
create index interactions_actor_occurred_idx on public.interactions(actor_id, occurred_at desc);
create index tasks_interaction_idx on public.tasks(interaction_id) where interaction_id is not null;
create index appointments_interaction_idx on public.appointments(interaction_id) where interaction_id is not null;

alter table public.interactions enable row level security;
create policy "Authenticated users can read interactions" on public.interactions for select to authenticated using (true);
create policy "Authenticated users can create own interactions" on public.interactions for insert to authenticated with check (actor_id = auth.uid());
create policy "Authenticated users can update own interactions" on public.interactions for update to authenticated using (actor_id = auth.uid()) with check (actor_id = auth.uid());

-- Existing Visits have unambiguous event semantics. Link them without copying
-- specialist Visit notes/outcome into an unrelated duplicate activity record.
insert into public.interactions(account_id, contact_id, actor_id, channel, occurred_at, source_context, visit_id)
select v.account_id, v.contact_id, v.salesperson_id, 'visit', coalesce(v.completed_at,v.started_at,v.created_at), 'visit', v.id
from public.visits v
where v.salesperson_id is not null
on conflict (visit_id) do nothing;

create table public.account_external_identity_audit (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  system text not null,
  external_id text not null,
  linked_by uuid not null references public.profiles(id) on delete restrict,
  linked_at timestamptz not null default now(),
  note text
);

create index account_external_identity_audit_lookup_idx on public.account_external_identity_audit(system,external_id,linked_at desc);

alter table public.account_external_identity_audit enable row level security;
create policy "Authenticated users can read account identity audit" on public.account_external_identity_audit for select to authenticated using (true);

create or replace function public.link_viewplan_account(p_account_id uuid,p_viewplan_customer_id integer,p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_account uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_viewplan_customer_id is null or p_viewplan_customer_id <= 0 then raise exception 'A valid ViewPlan customer ID is required'; end if;
  if not exists(select 1 from public.accounts where id=p_account_id) then raise exception 'Account not found'; end if;

  select id into existing_account from public.accounts where brewery_customer_id=p_viewplan_customer_id and id<>p_account_id;
  if existing_account is null then
    select account_id into existing_account from public.account_external_ids where system='viewplan' and external_id=p_viewplan_customer_id::text and account_id<>p_account_id;
  end if;
  if existing_account is not null then raise exception 'That ViewPlan customer ID is already linked to another Account'; end if;

  update public.accounts set brewery_customer_id=p_viewplan_customer_id where id=p_account_id and brewery_customer_id is null;
  if not found and not exists(select 1 from public.accounts where id=p_account_id and brewery_customer_id=p_viewplan_customer_id) then
    raise exception 'This Account already has a different ViewPlan identity';
  end if;

  insert into public.account_external_ids(account_id,system,external_id)
  values(p_account_id,'viewplan',p_viewplan_customer_id::text)
  on conflict(system,external_id) do update set account_id=excluded.account_id;

  insert into public.account_external_identity_audit(account_id,system,external_id,linked_by,note)
  values(p_account_id,'viewplan',p_viewplan_customer_id::text,auth.uid(),nullif(btrim(p_note),''));
end;
$$;

revoke all on function public.link_viewplan_account(uuid,integer,text) from public;
grant execute on function public.link_viewplan_account(uuid,integer,text) to authenticated;
