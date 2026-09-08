-- A source plan can reference a batch for a different product. Retain evidence,
-- flag the plan, and never transfer its demand to that batch.
alter table public.take_off_subjects add column source_link_conflict boolean not null default false;
create or replace function public.take_off_root(p_id uuid) returns uuid language sql stable security definer set search_path=public as $$
 select coalesce((select b.id from take_off_subjects b where b.source_key=s.source_link_key and b.kind='batch' and b.source_product_id=s.source_product_id),s.manual_batch_id,s.id)
 from take_off_subjects s where s.id=p_id
$$;
create or replace function public.sync_take_off(payload jsonb, observed_at timestamptz) returns integer
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
   and (s.kind<>'plan' or b.id is null or b.kind<>'batch'
    or (s.manual_batch_id is not null and s.manual_batch_id<>b.id))) then raise exception 'Conflicting or unresolved source lineage'; end if;
 -- Preserve source lineage as evidence, but quarantine product conflicts.
 insert into take_off_events(subject_id,action,details)
 select s.id,'source_link_conflict',jsonb_build_object('linked_batch',s.source_link_key)
 from take_off_subjects s join take_off_subjects b on b.source_key=s.source_link_key
 where s.source_product_id<>b.source_product_id and not s.source_link_conflict;
 update take_off_subjects s set source_link_conflict=(s.source_product_id<>b.source_product_id),
 revision=s.revision+case when s.source_link_conflict is distinct from (s.source_product_id<>b.source_product_id) then 1 else 0 end,
 phase=case when s.source_product_id<>b.source_product_id and s.phase<>'cancelled' then 'unresolved' else s.phase end
 from take_off_subjects b where b.source_key=s.source_link_key;
 update take_off_subjects set source_link_conflict=false,revision=revision+1 where source_link_key is null and source_link_conflict;
 insert into take_off_events(subject_id,action,details)
 select id,'source_missing',jsonb_build_object('snapshot_at',observed_at) from take_off_subjects where snapshot_at<>observed_at and not missing;
 update take_off_subjects set missing=true,revision=revision+1 where snapshot_at<>observed_at and not missing;
 update take_off_sync set snapshot_at=observed_at,last_error=null,updated_at=now() where singleton;
 count_rows=jsonb_array_length(payload);
 return count_rows;
end $$;
