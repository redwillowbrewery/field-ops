-- Planning eligibility is independent of existing sales listings.
alter table public.packages add column take_off_enabled boolean not null default false;
update public.packages set take_off_enabled=true
where source_system='viewplan' and source_reference in ('E-Cask','Firkin','Pin','Pin (Flat Bottom)') and broad_format='cask';
comment on column public.packages.take_off_enabled is 'Available for Take Off planning without an existing saleable Product Variant; does not create sales availability.';
create function public.take_off_package_allowed(p_product uuid,p_package uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select p_product is not null and exists(select 1 from packages p where p.id=p_package and p.active and
 (p.take_off_enabled or exists(select 1 from product_variants v where v.product_id=p_product and v.package_id=p.id and v.allow_sale)))
$$;
create function public.take_off_package_options(p_product uuid)
returns setof public.packages language sql stable security definer set search_path=public as $$
 select p.* from packages p where take_off_package_allowed(p_product,p.id) order by p.name
$$;
revoke all on function public.take_off_package_allowed(uuid,uuid),public.take_off_package_options(uuid) from public,anon;
grant execute on function public.take_off_package_allowed(uuid,uuid),public.take_off_package_options(uuid) to authenticated,service_role;
create or replace function public.save_take_off_request(
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
 if not p_withdraw and not take_off_package_allowed(s.product_id,p_package) then raise exception 'Package unavailable for planning this beer'; end if;
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
