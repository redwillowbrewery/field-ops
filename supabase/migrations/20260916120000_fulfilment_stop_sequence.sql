-- Provisional sequence only. Does not finalise routes or change ViewPlan.
alter table public.fulfilment_plans add column stop_position integer check(stop_position>0);
create function public.save_fulfilment_sequence(p_rows jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare r jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid planning rows'; end if;
 if jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>1000 then raise exception 'Invalid planning scope'; end if;
 if (select count(*)<>count(distinct x->>'source') from jsonb_array_elements(p_rows) x) then raise exception 'Duplicate order'; end if;
 -- Same lock order as source ingestion, then ascending source IDs. The entire edit rolls back on conflict.
 perform pg_advisory_xact_lock(9162026);
 for r in select value from jsonb_array_elements(p_rows) order by (value->>'source')::bigint loop
  if r->>'source' is null or r->>'source_revision' is null or r->>'plan_revision' is null or r->>'position' is null or (r->>'position')::integer<1 then raise exception 'Invalid planning row'; end if;
  if r->>'vehicle' is not null and (r->>'vehicle')::bigint not in (1,2,4) then raise exception 'Choose a van or unassigned'; end if;
  if exists(select 1 from fulfilment_orders o where o.source_id=(r->>'source')::bigint and o.fulfilment_method in ('pallet','courier','collection_review')) then raise exception 'Non-van work must remain separate'; end if;
  perform plan_fulfilment_order((r->>'source')::bigint,(r->>'source_revision')::integer,(r->>'plan_revision')::integer,(r->>'date')::date,(r->>'vehicle')::bigint);
  update fulfilment_plans set stop_position=(r->>'position')::integer where source_id=(r->>'source')::bigint;
 end loop;
end $$;
revoke all on function public.save_fulfilment_sequence(jsonb) from public,anon;
grant execute on function public.save_fulfilment_sequence(jsonb) to authenticated;

-- Moving an order through the existing date/van form appends it to the new run.
create function public.reset_fulfilment_position() returns trigger language plpgsql set search_path=public as $$
begin
 if new.planned_date is distinct from old.planned_date or new.vehicle_id is distinct from old.vehicle_id then new.stop_position:=null; end if;
 return new;
end $$;
revoke all on function public.reset_fulfilment_position() from public,anon,authenticated;
create trigger fulfilment_position_reset before update on public.fulfilment_plans for each row execute function public.reset_fulfilment_position();
