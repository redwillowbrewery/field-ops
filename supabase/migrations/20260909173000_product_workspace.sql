-- Product drafts are separate from immutable publications and external observations.
create table public.product_workspaces (
 product_id uuid primary key references products(id),
 draft jsonb not null,
 revision integer not null default 1,
 published_revision integer,
 legacy_information jsonb not null default '{}',
 legacy_reviewed boolean not null default false,
 updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
create table public.product_publications (
 product_id uuid references products(id),revision integer not null,
 specification jsonb not null,published_at timestamptz not null default now(),published_by uuid references auth.users(id),
 primary key(product_id,revision)
);
alter table product_workspaces add constraint product_publication_pointer foreign key(product_id,published_revision) references product_publications(product_id,revision);
create table public.product_formulations (
 product_id uuid references products(id),revision integer not null,
 title text not null,content text not null,attachment_path text,approved boolean not null default false,
 created_at timestamptz not null default now(),created_by uuid references auth.users(id),approved_by uuid references auth.users(id),approved_at timestamptz,
 primary key(product_id,revision)
);
create table public.product_launch_tasks (
 id uuid primary key default gen_random_uuid(),product_id uuid not null references products(id),
 title text not null,required boolean not null default true,complete boolean not null default false,
 owner_name text not null default '',evidence text not null default '',revision integer not null default 1,
 updated_at timestamptz not null default now(),updated_by uuid references auth.users(id)
);
create table public.product_workspace_events (
 id bigint generated always as identity primary key,product_id uuid references products(id),
 action text not null,details jsonb not null,actor uuid references auth.users(id),created_at timestamptz not null default now()
);
do $$declare t text;begin
 foreach t in array array['product_workspaces','product_publications','product_formulations','product_launch_tasks','product_workspace_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy staff_read on public.%I for select to authenticated using(true)',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence product_workspace_events_id_seq to service_role;

create function public.validate_product_draft(d jsonb) returns void language plpgsql set search_path=public as $$
declare k text;v jsonb;f jsonb;family text;
begin
 if d is null or jsonb_typeof(d)<>'object' then raise exception 'Invalid Product draft'; end if;
 for k,v in select * from jsonb_each(d) loop
  if k not in ('name','type','description','abv','artwork_path','allergens','gluten_free','lactose_free','cask','keg_can') then raise exception 'Unknown Product field';end if;
 end loop;
 if jsonb_typeof(d->'name') is distinct from 'string' or length(trim(d->>'name')) not between 1 and 200 or d->>'type' is distinct from 'beer' then raise exception 'Enter a Beer name';end if;
 foreach k in array array['description','artwork_path','allergens'] loop
  v=d->k;
  if v is not null and v<>'null'::jsonb and (jsonb_typeof(v)<>'string' or length(v#>>'{}')>10000) then raise exception 'Invalid Product text';end if;
 end loop;
 if d->>'artwork_path' is not null and d->>'artwork_path'<>'' and d->>'artwork_path'!~'^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$' then raise exception 'Use an uploaded artwork asset';end if;
 v=d->'abv';
 if v is not null and v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric<0 or (v#>>'{}')::numeric>30) then raise exception 'ABV must be between 0 and 30';end if;
 foreach k in array array['gluten_free','lactose_free'] loop
  v=d->k;if v is not null and v<>'null'::jsonb and jsonb_typeof(v)<>'boolean' then raise exception 'Use yes, no or not confirmed';end if;
 end loop;
 foreach family in array array['cask','keg_can'] loop
  f=d->family;if f is null or jsonb_typeof(f)<>'object' then raise exception 'Both packaging families are required';end if;
  for k,v in select * from jsonb_each(f) loop
   if k not in ('fining','vegan','allergens','allergens_override') then raise exception 'Unknown packaging family field';end if;
   if k='vegan' and v<>'null'::jsonb and jsonb_typeof(v)<>'boolean' then raise exception 'Invalid vegan declaration';end if;
   if k='allergens_override' and jsonb_typeof(v)<>'boolean' then raise exception 'Invalid family allergen mode';end if;
   if k='allergens' and v<>'null'::jsonb and (jsonb_typeof(v)<>'string' or length(v#>>'{}')>10000) then raise exception 'Invalid family allergens';end if;
   if k='fining' and v<>'null'::jsonb and (jsonb_typeof(v)<>'string' or v#>>'{}' not in ('fined','unfined')) then raise exception 'Invalid fining declaration';end if;
  end loop;
 end loop;
 if d->'keg_can'->>'fining' is distinct from 'unfined' then raise exception 'Keg & Can are unfined under current policy';end if;
end $$;

create function public.start_product_workspace(p_product uuid default null,p_name text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare pid uuid:=p_product; pname text; spec jsonb; legacy jsonb;info jsonb;pres jsonb;nominal numeric;task text;
begin
 if auth.uid() is null or not take_off_is_approver() then raise exception 'Head Brewer approval required';end if;
 if pid is null then
  if p_name is null or length(trim(p_name)) not between 1 and 200 then raise exception 'Enter a working Beer name';end if;
  insert into products(name,active,sellable,business_exchange) values(trim(p_name),false,false,false) returning id into pid;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(pid::text,4090901));
 if exists(select 1 from product_workspaces where product_id=pid) then return pid;end if;
 select name,abv into pname,nominal from products where id=pid;
 if not found then raise exception 'Product not found';end if;
 select to_jsonb(p) into pres from product_presentations p where product_id=pid;
 select details into info from product_information where product_id=pid;
 select jsonb_build_object('beer',coalesce(info,'{}'::jsonb),'packages',coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb),'presentation',pres)
 into legacy from product_package_information p where product_id=pid;
 spec=jsonb_build_object('name',pname,'type','beer','description',coalesce(pres->>'description',''),'abv',coalesce(nominal,(pres->>'abv')::numeric),
  'artwork_path',null,'allergens',info->'allergens','gluten_free',info->'gluten_free','lactose_free',info->'lactose_free',
  'cask',jsonb_build_object('fining',info->'fining_status','vegan',info->'vegan','allergens_override',false,'allergens',null),
  'keg_can',jsonb_build_object('fining','unfined','vegan',null,'allergens_override',false,'allergens',null));
 insert into product_workspaces(product_id,draft,legacy_information,updated_by) values(pid,spec,legacy,auth.uid());
 foreach task in array array['Artwork approved','Untappd record created','Sellar listing created','Initial pump-clip order completed','Formulation approved','Product declarations reviewed'] loop
  insert into product_launch_tasks(product_id,title,updated_by) values(pid,task,auth.uid());
 end loop;
 insert into product_workspace_events(product_id,action,details,actor) values(pid,'created',jsonb_build_object('draft',spec),auth.uid());
 return pid;
end $$;

create function public.save_product_draft(p_product uuid,p_revision integer,p_draft jsonb,p_legacy_reviewed boolean)
returns void language plpgsql security definer set search_path=public as $$
declare w product_workspaces;
begin
 if auth.uid() is null or not take_off_is_approver() then raise exception 'Head Brewer approval required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_product::text,4090901));
 select * into w from product_workspaces where product_id=p_product for update;
 if not found or w.revision is distinct from p_revision then raise exception 'Product changed; reload before saving';end if;
 perform validate_product_draft(p_draft);
 if nullif(p_draft->>'artwork_path','') is not null and split_part(p_draft->>'artwork_path','/',1)<>p_product::text then raise exception 'Artwork belongs to another Product';end if;
 update product_workspaces set draft=p_draft,legacy_reviewed=coalesce(p_legacy_reviewed,false),revision=revision+1,updated_at=now(),updated_by=auth.uid() where product_id=p_product;
 insert into product_workspace_events(product_id,action,details,actor) values(p_product,'draft_saved',jsonb_build_object('before',w.draft,'after',p_draft,'legacy_reviewed',p_legacy_reviewed),auth.uid());
end $$;

create function public.publish_product_draft(p_product uuid,p_revision integer)
returns void language plpgsql security definer set search_path=public as $$
declare w product_workspaces;
begin
 if auth.uid() is null or not take_off_is_approver() then raise exception 'Head Brewer approval required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_product::text,4090901));
 select * into w from product_workspaces where product_id=p_product for update;
 if not found or w.revision is distinct from p_revision then raise exception 'Product changed; reload before publishing';end if;
 perform validate_product_draft(w.draft);
 if not w.legacy_reviewed then raise exception 'Review existing and imported information before publication';end if;
 if w.draft->'cask'->>'fining' is null then raise exception 'Explicitly select Cask fining before publication';end if;
 if nullif(w.draft->>'artwork_path','') is not null and not exists(select 1 from storage.objects where bucket_id='product-artwork' and name=w.draft->>'artwork_path') then raise exception 'Draft artwork is missing; upload it before publishing';end if;
 if w.published_revision=w.revision then return;end if;
 insert into product_publications(product_id,revision,specification,published_by) values(p_product,w.revision,w.draft,auth.uid());
 update product_workspaces set published_revision=w.revision where product_id=p_product;
 insert into product_workspace_events(product_id,action,details,actor) values(p_product,'published',jsonb_build_object('revision',w.revision),auth.uid());
end $$;

create function public.save_product_formulation(p_product uuid,p_expected integer,p_title text,p_content text,p_attachment text default null)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if auth.uid() is null or not take_off_is_approver() then raise exception 'Head Brewer approval required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_product::text,4090901));
 if not exists(select 1 from product_workspaces where product_id=p_product) then raise exception 'Open the Product workspace first';end if;
 select coalesce(max(revision),0) into n from product_formulations where product_id=p_product;
 if n is distinct from p_expected then raise exception 'Formulation changed; reload before saving';end if;
 if p_title is null or length(trim(p_title)) not between 1 and 200 or p_content is null or length(trim(p_content)) not between 1 and 50000 then raise exception 'Enter formulation title and content';end if;
 if p_attachment is not null and (split_part(p_attachment,'/',1)<>p_product::text or not exists(select 1 from storage.objects where bucket_id='product-formulations' and name=p_attachment)) then raise exception 'Formulation attachment unavailable';end if;
 insert into product_formulations(product_id,revision,title,content,attachment_path,created_by) values(p_product,n+1,trim(p_title),p_content,p_attachment,auth.uid());
 insert into product_workspace_events(product_id,action,details,actor) values(p_product,'formulation_created',jsonb_build_object('revision',n+1),auth.uid());
 return n+1;
end $$;
create function public.approve_product_formulation(p_product uuid,p_revision integer) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not take_off_is_approver() then raise exception 'Head Brewer approval required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_product::text,4090901));
 if p_revision is distinct from (select max(revision) from product_formulations where product_id=p_product) then raise exception 'A newer formulation exists; reload';end if;
 update product_formulations set approved=true,approved_by=auth.uid(),approved_at=now() where product_id=p_product and revision=p_revision and not approved;
 if found then insert into product_workspace_events(product_id,action,details,actor) values(p_product,'formulation_approved',jsonb_build_object('revision',p_revision),auth.uid());end if;
end $$;

create function public.save_product_launch_task(p_product uuid,p_id uuid,p_revision integer,p_title text,p_required boolean,p_complete boolean,p_owner text,p_evidence text)
returns void language plpgsql security definer set search_path=public as $$
declare tid uuid:=p_id;t product_launch_tasks;
begin
 if auth.uid() is null or not take_off_is_approver() then raise exception 'Head Brewer approval required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_product::text,4090901));
 if not exists(select 1 from product_workspaces where product_id=p_product) then raise exception 'Product workspace not found';end if;
 if p_title is null or length(trim(p_title)) not between 1 and 200 or p_owner is null or length(p_owner)>200 or p_evidence is null or length(p_evidence)>4000 or p_required is null or p_complete is null then raise exception 'Invalid launch task';end if;
 if tid is null then
  if p_revision is distinct from 0 then raise exception 'Invalid new task revision';end if;
  insert into product_launch_tasks(product_id,title,required,complete,owner_name,evidence,updated_by) values(p_product,p_title,p_required,p_complete,p_owner,p_evidence,auth.uid()) returning id into tid;
 else
  select * into t from product_launch_tasks where id=tid and product_id=p_product for update;
  if not found or t.revision is distinct from p_revision then raise exception 'Launch task changed; reload';end if;
  update product_launch_tasks set title=p_title,required=p_required,complete=p_complete,owner_name=p_owner,evidence=p_evidence,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=tid;
 end if;
 insert into product_workspace_events(product_id,action,details,actor) values(p_product,'launch_task_saved',jsonb_build_object('id',tid,'complete',p_complete,'required',p_required,'evidence',p_evidence),auth.uid());
end $$;

do $$declare f record;begin
 for f in select oid::regprocedure as sig from pg_proc where pronamespace='public'::regnamespace and proname in ('validate_product_draft','start_product_workspace','save_product_draft','publish_product_draft','save_product_formulation','approve_product_formulation','save_product_launch_task') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.sig::text not like 'validate_product_draft%' then execute format('grant execute on function %s to authenticated',f.sig);end if;
 end loop;
end $$;
