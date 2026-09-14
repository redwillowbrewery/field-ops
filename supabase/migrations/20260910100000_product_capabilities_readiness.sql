-- Shared capabilities: seed the existing Head Brewer once, then administer independently.
create table public.user_capabilities (
 user_id uuid not null references auth.users(id) on delete cascade,
 capability text not null check(capability in ('product_edit','product_publish','packaging_approve')),
 granted_at timestamptz not null default now(),
 primary key(user_id,capability)
);
alter table public.user_capabilities enable row level security;
revoke all on public.user_capabilities from public,anon,authenticated;
grant select on public.user_capabilities to authenticated;
grant all on public.user_capabilities to service_role;
create policy own_capabilities on public.user_capabilities for select to authenticated using(user_id=auth.uid());
insert into public.user_capabilities(user_id,capability)
select a.user_id,c from public.take_off_approvers a cross join unnest(array['product_edit','product_publish','packaging_approve']) c;

create function public.has_capability(p_capability text) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from user_capabilities where user_id=auth.uid() and capability=p_capability)
$$;
revoke all on function public.has_capability(text) from public,anon;
grant execute on function public.has_capability(text) to authenticated;
create or replace function public.take_off_is_approver() returns boolean
language sql stable security definer set search_path=public as $$select has_capability('packaging_approve')$$;

-- Preserve the complete existing transactional implementations; replace only their role predicate.
do $$declare f record;definition text;cap text;begin
 for f in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in (
  'start_product_workspace','save_product_draft','publish_product_draft','save_product_formulation',
  'approve_product_formulation','save_product_launch_task','link_product_viewplan','duplicate_product_workspace',
  'restore_product_publication_draft','save_product_information_legacy') loop
  definition=pg_get_functiondef(f.oid);
  cap=case when f.proname in ('publish_product_draft','approve_product_formulation') then 'product_publish' else 'product_edit' end;
  if position('take_off_is_approver()' in definition)>0 then
   execute replace(definition,'take_off_is_approver()',format('has_capability(%L)',cap));
  end if;
 end loop;
end $$;
alter policy product_artwork_insert on storage.objects with check(bucket_id='product-artwork' and public.has_capability('product_edit') and exists(select 1 from public.product_workspaces w where w.product_id::text=(storage.foldername(name))[1]));
alter policy product_formulations_insert on storage.objects with check(bucket_id='product-formulations' and public.has_capability('product_edit') and exists(select 1 from public.product_workspaces w where w.product_id::text=(storage.foldername(name))[1]));

-- Keep legacy task evidence but distinguish automatic requirements from external checklists.
alter table public.product_launch_tasks add column kind text not null default 'external'
 check(kind in ('external','artwork','formulation','declarations'));
update public.product_launch_tasks set kind=case title
 when 'Artwork approved' then 'artwork'
 when 'Formulation approved' then 'formulation'
 when 'Product declarations reviewed' then 'declarations' else 'external' end;
do $$declare definition text;begin
 definition=pg_get_functiondef('public.start_product_workspace(uuid,text)'::regprocedure);
 definition=replace(definition,'''Artwork approved'',''Untappd record created'',''Sellar listing created'',''Initial pump-clip order completed'',''Formulation approved'',''Product declarations reviewed''','''Untappd record created'',''Sellar listing created'',''Initial pump-clip order completed''');
 execute definition;
 definition=pg_get_functiondef('public.save_product_launch_task(uuid,uuid,integer,text,boolean,boolean,text,text)'::regprocedure);
 definition=replace(definition,'if not found or t.revision is distinct from p_revision then','if t.kind is distinct from ''external'' then raise exception ''This requirement is derived from Product state'';end if;
 if not found or t.revision is distinct from p_revision then');
 execute definition;
end $$;

create function public.product_launch_readiness(p_product uuid)
returns table(kind text,title text,required boolean,complete boolean)
language sql stable security definer set search_path=public as $$
 with w as (select * from product_workspaces where product_id=p_product and auth.uid() is not null),
 p as (select specification from product_publications pp join w on pp.product_id=w.product_id and pp.revision=w.published_revision),
 f as (select approved from product_formulations where product_id=p_product order by revision desc limit 1)
 select 'artwork','Artwork approved',true,
  coalesce(nullif(w.draft->>'artwork_path','') is not null and w.draft->>'artwork_path'=(select specification->>'artwork_path' from p),false) from w
 union all select 'formulation','Latest formulation approved',true,coalesce((select approved from f),false) from w
 union all select 'declarations','Current specification and declarations published',true,
  coalesce(w.legacy_reviewed and w.published_revision=w.revision,false) from w
 union all select 'external',t.title,t.required,t.complete from product_launch_tasks t join w on t.product_id=w.product_id where t.kind='external'
$$;
revoke all on function public.product_launch_readiness(uuid) from public,anon;
grant execute on function public.product_launch_readiness(uuid) to authenticated;
