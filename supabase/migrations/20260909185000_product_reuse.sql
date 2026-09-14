create function public.duplicate_product_workspace(p_source uuid,p_name text) returns uuid
language plpgsql security definer set search_path=public as $$
declare source_spec jsonb;pid uuid;
begin
 if auth.uid() is null or not take_off_is_approver() then raise exception 'Head Brewer approval required';end if;
 select draft into source_spec from product_workspaces where product_id=p_source;
 if not found then raise exception 'Source Product workspace not found';end if;
 pid=start_product_workspace(null,p_name);
 source_spec=jsonb_set(jsonb_set(jsonb_set(source_spec,'{name}',to_jsonb(trim(p_name))),'{artwork_path}','null'::jsonb),'{cask,fining}','null'::jsonb);
 update product_workspaces set draft=source_spec,legacy_information=jsonb_build_object('copied_from_product',p_source),legacy_reviewed=false where product_id=pid;
 insert into product_workspace_events(product_id,action,details,actor) values(pid,'duplicated',jsonb_build_object('source_product_id',p_source),auth.uid());
 return pid;
end $$;
create function public.restore_product_publication_draft(p_product uuid,p_publication integer,p_expected integer)
returns void language plpgsql security definer set search_path=public as $$
declare spec jsonb;
begin
 if auth.uid() is null or not take_off_is_approver() then raise exception 'Head Brewer approval required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_product::text,4090901));
 if not exists(select 1 from product_workspaces where product_id=p_product and revision=p_expected) then raise exception 'Product changed; reload before restoring';end if;
 select specification into spec from product_publications where product_id=p_product and revision=p_publication;
 if not found then raise exception 'Publication not found';end if;
 perform save_product_draft(p_product,p_expected,spec,false);
 insert into product_workspace_events(product_id,action,details,actor) values(p_product,'publication_restored_to_draft',jsonb_build_object('publication_revision',p_publication),auth.uid());
end $$;
revoke all on function public.duplicate_product_workspace(uuid,text),public.restore_product_publication_draft(uuid,integer,integer) from public,anon;
grant execute on function public.duplicate_product_workspace(uuid,text),public.restore_product_publication_draft(uuid,integer,integer) to authenticated;
