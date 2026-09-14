-- Once a Product is published, source refresh cannot replace its editorial name or ABV.
create function public.preserve_published_product_editorial() returns trigger language plpgsql security definer set search_path=public as $$
declare spec jsonb;
begin
 select p.specification into spec from product_workspaces w join product_publications p on p.product_id=w.product_id and p.revision=w.published_revision where w.product_id=new.id;
 if spec is not null then new.name=spec->>'name';new.abv=(spec->>'abv')::numeric;end if;
 return new;
end $$;
create trigger preserve_published_product_editorial before update on public.products for each row execute function public.preserve_published_product_editorial();

-- Keep canonical editorial names aligned when publication advances.
create function public.apply_product_publication() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.published_revision is distinct from old.published_revision then
  update products set name=new.draft->>'name',abv=(new.draft->>'abv')::numeric,
   active=case when not exists(select 1 from product_external_ids where product_id=new.product_id and system='viewplan') then true else active end
  where id=new.product_id;
 end if;
 return new;
end $$;
create trigger apply_product_publication after update of published_revision on public.product_workspaces for each row execute function public.apply_product_publication();

create function public.link_product_viewplan(p_product uuid,p_external text,p_revision integer) returns void
language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not take_off_is_approver() then raise exception 'Head Brewer approval required';end if;
 perform pg_advisory_xact_lock(309091700);
 perform pg_advisory_xact_lock(hashtextextended(p_product::text,4090901));
 if not exists(select 1 from product_workspaces where product_id=p_product and revision=p_revision) then raise exception 'Product changed; reload before mapping';end if;
 if not exists(select 1 from product_source_observations where source_system='viewplan' and external_id=p_external and present_in_latest and not source_is_system and not source_business_exchange) then raise exception 'Source Product is not in the latest snapshot';end if;
 if exists(select 1 from product_external_ids where system='viewplan' and (external_id=p_external or product_id=p_product)) then raise exception 'An exact mapping already exists; no merge was made';end if;
 insert into product_external_ids(product_id,system,external_id) values(p_product,'viewplan',p_external);
 update product_source_observations set product_id=p_product where source_system='viewplan' and external_id=p_external;
 update product_workspaces set revision=revision+1,legacy_reviewed=false,updated_at=now(),updated_by=auth.uid() where product_id=p_product;
 insert into product_workspace_events(product_id,action,details,actor) values(p_product,'viewplan_linked',jsonb_build_object('external_id',p_external),auth.uid());
end $$;
revoke all on function public.link_product_viewplan(uuid,text,integer) from public,anon;
grant execute on function public.link_product_viewplan(uuid,text,integer) to authenticated;

-- A changed formulation needs a fresh declaration review but cannot rewrite old publications.
create function public.flag_formulation_review() returns trigger language plpgsql security definer set search_path=public as $$
begin
 update product_workspaces set legacy_reviewed=false,revision=revision+1,updated_at=now(),updated_by=new.created_by where product_id=new.product_id;
 return new;
end $$;
create trigger flag_formulation_review after insert on public.product_formulations for each row execute function public.flag_formulation_review();

alter function public.save_product_information(uuid,uuid,integer,jsonb) rename to save_product_information_legacy;
revoke all on function public.save_product_information_legacy(uuid,uuid,integer,jsonb) from public,anon,authenticated;
create function public.save_product_information(p_product uuid,p_package uuid,p_revision integer,p_details jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_product::text,4090901));
 if exists(select 1 from product_workspaces where product_id=p_product) then raise exception 'This beer is managed in Products. Review and publish its draft there.';end if;
 perform save_product_information_legacy(p_product,p_package,p_revision,p_details);
end $$;
revoke all on function public.save_product_information(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_product_information(uuid,uuid,integer,jsonb) to authenticated;
revoke all on function public.preserve_published_product_editorial(),public.apply_product_publication(),public.flag_formulation_review() from public,anon,authenticated;
