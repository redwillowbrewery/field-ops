-- Atomic quantity editing; ViewPlan remains read only.
alter table public.take_off_subjects add column packaging_days integer check(packaging_days>=0);
alter function public.sync_take_off(jsonb,timestamptz) rename to sync_take_off_base;
create function public.sync_take_off(payload jsonb,observed_at timestamptz)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 n:=sync_take_off_base(payload,observed_at);
 update take_off_subjects s set packaging_days=(x->>'packaging_days')::integer
 from jsonb_array_elements(payload) x where s.source_key=x->>'source_key';
 return n;
end $$;
revoke all on function public.sync_take_off(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_take_off(jsonb,timestamptz) to service_role;

create function public.take_off_my_request_context(p_subject uuid)
returns text language sql stable security definer set search_path=public as $$
 select md5(coalesce(string_agg(id::text||':'||revision::text,',' order by id),''))
 from take_off_requests where owner_id=auth.uid() and not withdrawn
 and take_off_root(subject_id)=take_off_root(p_subject)
$$;

create function public.save_take_off_grid(p_subject uuid,p_context text,p_requests_context text,p_items jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare item jsonb; r take_off_requests; q integer; rid uuid; pkg uuid; needed date; note text;
begin
 perform pg_advisory_xact_lock(3090801);
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_context is distinct from take_off_context(p_subject)
 or p_requests_context is distinct from take_off_my_request_context(p_subject)
 then raise exception 'Brew or requests changed; reload before saving'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Invalid quantities'; end if;
 if jsonb_array_length(p_items)>100 then raise exception 'Too many packages'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x group by x->>'package_id' having count(*)>1)
 then raise exception 'Duplicate package'; end if;
 for item in select * from jsonb_array_elements(p_items) loop
  if coalesce(item->>'quantity','') !~ '^[0-9]+$' then raise exception 'Use whole package quantities'; end if;
  q:=(item->>'quantity')::integer; pkg:=(item->>'package_id')::uuid;
  rid:=nullif(item->>'id','')::uuid; needed:=nullif(item->>'required_by','')::date; note:=coalesce(item->>'notes','');
  if rid is not null then
   select * into r from take_off_requests where id=rid for update;
   if r.id is null or r.owner_id<>auth.uid() or r.withdrawn or r.package_id is distinct from pkg
   or take_off_root(r.subject_id) is distinct from take_off_root(p_subject)
   or r.revision is distinct from (item->>'revision')::integer
   then raise exception 'Request changed; reload before saving'; end if;
   -- Preserve approvals for untouched cells.
   if q=r.quantity and needed=r.required_by and note=r.notes then continue; end if;
   perform save_take_off_request(r.subject_id,pkg,q,needed,note,rid,r.revision,q=0,r.account_id);
  elsif q>0 then
   perform save_take_off_request(p_subject,pkg,q,needed,note);
  end if;
 end loop;
end $$;
revoke all on function public.take_off_my_request_context(uuid),public.save_take_off_grid(uuid,text,text,jsonb) from public,anon;
grant execute on function public.take_off_my_request_context(uuid),public.save_take_off_grid(uuid,text,text,jsonb) to authenticated;
