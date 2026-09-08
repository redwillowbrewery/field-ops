
-- Sprint 3: source-owned planning projection and separately permissioned requests.
create table public.take_off_subjects (
 id uuid primary key default gen_random_uuid(),
 source_key text not null unique,
 kind text not null check(kind in ('plan','batch')),
 product_id uuid references public.products(id),
 product_name text not null,
 source_product_id text not null,
 source_link_key text,
 manual_batch_id uuid references public.take_off_subjects(id),
 brew_date date,
 gyle text,
 phase text not null check(phase in ('planned','staging','in_tank','finished','cancelled','unresolved')),
 volume_litres numeric check(volume_litres>=0),
 vessels jsonb not null default '[]',
 source_take_off jsonb not null default '[]',
 source_fingerprint text not null,
 revision integer not null default 1,
 missing boolean not null default false,
 snapshot_at timestamptz not null
);
create table public.take_off_sync (
 singleton boolean primary key default true check(singleton),
 snapshot_at timestamptz,
 last_error text,
 updated_at timestamptz not null default now()
);
insert into public.take_off_sync(singleton) values(true);
create table public.take_off_approvers (
 user_id uuid primary key references auth.users(id)
);
insert into public.take_off_approvers(user_id)
 select id from auth.users where lower(email)='toby@redwillowbrewery.com';

create table public.take_off_requests (
 id uuid primary key default gen_random_uuid(),
 subject_id uuid not null references public.take_off_subjects(id),
 package_id uuid not null references public.packages(id),
 quantity integer not null check(quantity>0),
 required_by date not null,
 account_id uuid references public.accounts(id),
 notes text not null default '' check(length(notes)<=2000),
 owner_id uuid not null references auth.users(id),
 owner_label text not null,
 revision integer not null default 1,
 withdrawn boolean not null default false,
 approved_quantity integer check(approved_quantity>=0),
 approved_date date,
 -- Explicit extra-input percentage chosen by the brewer, never a default 6%.
 extra_input_percent numeric check(extra_input_percent between 0 and 100),
 approval_context text,
 approved_by uuid references auth.users(id),
 response text not null default '' check(length(response)<=2000),
 updated_at timestamptz not null default now()
);
create table public.take_off_events (
 id bigint generated always as identity primary key,
 subject_id uuid not null references public.take_off_subjects(id),
 request_id uuid references public.take_off_requests(id),
 actor_id uuid references auth.users(id),
 action text not null,
 details jsonb not null,
 created_at timestamptz not null default now()
);
create index on public.take_off_requests(subject_id);
create index on public.take_off_events(subject_id);
create index on public.take_off_subjects(source_link_key);

alter table public.take_off_subjects enable row level security;
alter table public.take_off_requests enable row level security;
alter table public.take_off_events enable row level security;
alter table public.take_off_sync enable row level security;
alter table public.take_off_approvers enable row level security;
revoke all on public.take_off_subjects,public.take_off_requests,public.take_off_events,public.take_off_sync,public.take_off_approvers from public,anon,authenticated;
grant select on public.take_off_subjects,public.take_off_requests,public.take_off_events,public.take_off_sync,public.take_off_approvers to authenticated;
grant all on public.take_off_subjects,public.take_off_requests,public.take_off_events,public.take_off_sync,public.take_off_approvers to service_role;
create policy staff_read on public.take_off_subjects for select to authenticated using(true);
create policy staff_read on public.take_off_requests for select to authenticated using(true);
create policy staff_read on public.take_off_events for select to authenticated using(true);
create policy staff_read on public.take_off_sync for select to authenticated using(true);
create policy own_role on public.take_off_approvers for select to authenticated using(user_id=auth.uid());

create function public.take_off_is_approver() returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from take_off_approvers where user_id=auth.uid())
$$;
create function public.take_off_root(p_id uuid) returns uuid language sql stable security definer set search_path=public as $$
 select coalesce((select b.id from take_off_subjects b where b.source_key=s.source_link_key and b.kind='batch'),s.manual_batch_id,s.id)
 from take_off_subjects s where s.id=p_id
$$;
create function public.take_off_context(p_id uuid) returns text language sql stable security definer set search_path=public as $$
 select md5(string_agg(s.id::text||':'||s.revision::text,',' order by s.id))
 from take_off_subjects s where take_off_root(s.id)=take_off_root(p_id)
$$;

create function public.sync_take_off(payload jsonb, observed_at timestamptz) returns integer
language plpgsql security definer set search_path=public as $$
declare x jsonb; old take_off_subjects; fingerprint text; pid uuid; count_rows integer;
begin
 perform pg_advisory_xact_lock(3090801);
 if observed_at is null or observed_at>now()+interval '5 minutes' or observed_at<=coalesce((select snapshot_at from take_off_sync where singleton),'-infinity') then
  raise exception 'Invalid or outdated snapshot';
 end if;
 if jsonb_typeof(payload) is distinct from 'array' or jsonb_array_length(payload)=0 then raise exception 'Incomplete snapshot'; end if;
 if exists(select 1 from jsonb_array_elements(payload) a group by a->>'source_key' having count(*)>1) then raise exception 'Duplicate source identity'; end if;
 for x in select value from jsonb_array_elements(payload) loop
  if x->>'source_key' is null or x->>'product_name' is null or x->>'source_product_id' is null
    or jsonb_typeof(x->'vessels') is distinct from 'array' or jsonb_typeof(x->'source_take_off') is distinct from 'array' then raise exception 'Malformed source row'; end if;
  if x->>'source_key' !~ '^(plan|batch):[1-9][0-9]*$' or split_part(x->>'source_key',':',1)<>x->>'kind' then raise exception 'Invalid source key'; end if;
  select product_id into pid from product_external_ids where system='viewplan' and external_id=x->>'source_product_id';
  fingerprint=md5(x::text||coalesce(pid::text,''));
  select * into old from take_off_subjects where source_key=x->>'source_key';
  insert into take_off_subjects(source_key,kind,product_id,product_name,source_product_id,source_link_key,brew_date,gyle,phase,volume_litres,vessels,source_take_off,source_fingerprint,snapshot_at)
  values(x->>'source_key',x->>'kind',pid,x->>'product_name',x->>'source_product_id',x->>'source_link_key',
   (x->>'brew_date')::date,x->>'gyle',x->>'phase',(x->>'volume_litres')::numeric,x->'vessels',x->'source_take_off',fingerprint,observed_at)
  on conflict(source_key) do update set
   product_id=excluded.product_id,product_name=excluded.product_name,source_product_id=excluded.source_product_id,
   source_link_key=excluded.source_link_key,brew_date=excluded.brew_date,gyle=excluded.gyle,phase=excluded.phase,
   volume_litres=excluded.volume_litres,vessels=excluded.vessels,source_take_off=excluded.source_take_off,
   source_fingerprint=excluded.source_fingerprint,missing=false,snapshot_at=observed_at,
   revision=take_off_subjects.revision+case when take_off_subjects.source_fingerprint<>excluded.source_fingerprint or take_off_subjects.missing then 1 else 0 end;
  if old.id is not null and (old.source_fingerprint<>fingerprint or old.missing) then
   insert into take_off_events(subject_id,action,details) values(old.id,'source_changed',jsonb_build_object('before',to_jsonb(old),'after',x));
  end if;
 end loop;
 -- Every automatic lineage must resolve exactly to a batch with matching product.
 if exists(select 1 from take_off_subjects s left join take_off_subjects b on b.source_key=s.source_link_key
   where s.snapshot_at=observed_at and s.source_link_key is not null
   and (s.kind<>'plan' or b.id is null or b.kind<>'batch' or b.source_product_id<>s.source_product_id
    or (s.manual_batch_id is not null and s.manual_batch_id<>b.id))) then raise exception 'Conflicting or unresolved source lineage'; end if;
 insert into take_off_events(subject_id,action,details)
 select id,'source_missing',jsonb_build_object('snapshot_at',observed_at) from take_off_subjects where snapshot_at<>observed_at and not missing;
 update take_off_subjects set missing=true,revision=revision+1 where snapshot_at<>observed_at and not missing;
 update take_off_sync set snapshot_at=observed_at,last_error=null,updated_at=now() where singleton;
 count_rows=jsonb_array_length(payload);
 return count_rows;
end $$;

create function public.save_take_off_request(
 p_subject uuid,p_package uuid,p_quantity integer,p_date date,p_notes text,
 p_id uuid default null,p_revision integer default null,p_withdraw boolean default false,p_account uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare s take_off_subjects; r take_off_requests; new_id uuid;
begin
 perform pg_advisory_xact_lock(3090801);
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into s from take_off_subjects where id=take_off_root(p_subject);
 if s.id is null then raise exception 'Brew not found'; end if;
 if not p_withdraw and exists(select 1 from take_off_subjects where id=p_subject and (missing or phase='cancelled')) then raise exception 'Source plan requires review'; end if;
 if not p_withdraw and (s.missing or s.phase not in ('planned','staging','in_tank') or s.product_id is null) then raise exception 'Brew is not available for new requirements'; end if;
 if not p_withdraw and not exists(select 1 from product_variants v where v.product_id=s.product_id and v.package_id=p_package and v.allow_sale) then raise exception 'Package unavailable for this beer'; end if;
 if p_id is null then
  if p_withdraw then raise exception 'Request not found'; end if;
  insert into take_off_requests(subject_id,package_id,quantity,required_by,notes,owner_id,owner_label,account_id)
   values(p_subject,p_package,p_quantity,p_date,coalesce(p_notes,''),auth.uid(),coalesce((select email from auth.users where id=auth.uid()),'Staff'),p_account) returning id into new_id;
 else
  select * into r from take_off_requests where id=p_id for update;
  if r.id is null or r.subject_id<>p_subject or r.revision is distinct from p_revision then raise exception 'Request changed; reload before saving'; end if;
  if r.owner_id<>auth.uid() and not take_off_is_approver() then raise exception 'Only the requester or Head Brewer can edit'; end if;
  update take_off_requests set package_id=case when p_withdraw then package_id else p_package end,
   quantity=case when p_withdraw then quantity else p_quantity end,
   required_by=case when p_withdraw then required_by else p_date end,
   notes=coalesce(p_notes,''),account_id=p_account,withdrawn=p_withdraw,
   approved_quantity=null,approved_date=null,extra_input_percent=null,approval_context=null,approved_by=null,response='',
   revision=revision+1,updated_at=now() where id=p_id returning id into new_id;
 end if;
 insert into take_off_events(subject_id,request_id,actor_id,action,details)
 select subject_id,id,auth.uid(),case when p_withdraw then 'withdrawn' else 'requested' end,to_jsonb(t) from take_off_requests t where id=new_id;
 return new_id;
end $$;

create function public.approve_take_off_request(p_id uuid,p_revision integer,p_context text,p_quantity integer,p_date date,p_extra numeric,p_response text)
returns void language plpgsql security definer set search_path=public as $$
declare r take_off_requests; s take_off_subjects;
begin
 perform pg_advisory_xact_lock(3090801);
 if not take_off_is_approver() then raise exception 'Head Brewer approval required'; end if;
 select * into r from take_off_requests where id=p_id for update;
 if r.id is null or r.withdrawn or r.revision is distinct from p_revision then raise exception 'Request changed; reload before approving'; end if;
 select * into s from take_off_subjects where id=take_off_root(r.subject_id);
 if exists(select 1 from take_off_subjects where id=r.subject_id and (missing or phase='cancelled')) then raise exception 'Source plan requires review'; end if;
 if s.missing or s.phase not in ('planned','staging','in_tank') then raise exception 'Brew requires source review'; end if;
 if p_context is distinct from take_off_context(r.subject_id) then raise exception 'Brew changed; reload before approving'; end if;
 if (select snapshot_at is null or snapshot_at<now()-interval '24 hours' or last_error is not null from take_off_sync where singleton) then raise exception 'Refresh ViewPlan before approving'; end if;
 if p_quantity is null or p_quantity<0 or p_date is null or p_extra is null then raise exception 'Quantity, date and explicit loss allowance required'; end if;
 if not exists(select 1 from packages where id=r.package_id and capacity_litres>0) then raise exception 'Package volume unknown'; end if;
 update take_off_requests set approved_quantity=p_quantity,approved_date=p_date,extra_input_percent=p_extra,
  approval_context=p_context,approved_by=auth.uid(),response=coalesce(p_response,''),revision=revision+1,updated_at=now() where id=p_id;
 insert into take_off_events(subject_id,request_id,actor_id,action,details)
 select subject_id,id,auth.uid(),'reviewed',to_jsonb(t) from take_off_requests t where id=p_id;
end $$;

create function public.link_take_off_plan(p_plan uuid,p_batch uuid,p_revision integer,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare p take_off_subjects; b take_off_subjects;
begin
 perform pg_advisory_xact_lock(3090801);
 if not take_off_is_approver() then raise exception 'Head Brewer approval required'; end if;
 select * into p from take_off_subjects where id=p_plan;
 select * into b from take_off_subjects where id=p_batch;
 if p.kind is distinct from 'plan' or b.kind is distinct from 'batch' or p.source_product_id is distinct from b.source_product_id
  or p.revision is distinct from p_revision or p.source_link_key is not null or p.manual_batch_id is not null or length(trim(coalesce(p_reason,'')))<5 then raise exception 'Invalid association or changed plan'; end if;
 update take_off_subjects set manual_batch_id=b.id,revision=revision+1 where id=p.id;
 update take_off_subjects set revision=revision+1 where id=b.id;
 insert into take_off_events(subject_id,actor_id,action,details)
 values(p.id,auth.uid(),'linked',jsonb_build_object('batch_id',b.id,'reason',p_reason));
end $$;

revoke all on function public.sync_take_off(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_take_off(jsonb,timestamptz) to service_role;
revoke all on function public.take_off_is_approver(),public.take_off_root(uuid),public.take_off_context(uuid),
 public.save_take_off_request(uuid,uuid,integer,date,text,uuid,integer,boolean,uuid),
 public.approve_take_off_request(uuid,integer,text,integer,date,numeric,text),
 public.link_take_off_plan(uuid,uuid,integer,text) from public,anon;
grant execute on function public.take_off_is_approver(),public.take_off_root(uuid),public.take_off_context(uuid),
 public.save_take_off_request(uuid,uuid,integer,date,text,uuid,integer,boolean,uuid),
 public.approve_take_off_request(uuid,integer,text,integer,date,numeric,text),
 public.link_take_off_plan(uuid,uuid,integer,text) to authenticated;
