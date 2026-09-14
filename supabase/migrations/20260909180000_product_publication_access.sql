-- Published projections expose no drafts, source evidence, actors or launch tasks.
create function public.published_product_specs(p_ids uuid[])
returns table(product_id uuid,specification jsonb) language sql stable security definer set search_path=public as $$
 select p.product_id,p.specification from product_publications p
 join product_workspaces w on w.product_id=p.product_id and w.published_revision=p.revision
 where p.product_id=any(p_ids)
$$;
revoke all on function public.published_product_specs(uuid[]) from public,anon;
grant execute on function public.published_product_specs(uuid[]) to authenticated,service_role;

-- Assets are private. Application delivery checks that the asset is in a publication.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-artwork','product-artwork',false,800000,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
create policy product_artwork_insert on storage.objects for insert to authenticated
with check(bucket_id='product-artwork' and public.take_off_is_approver() and exists(
 select 1 from public.product_workspaces w where w.product_id::text=(storage.foldername(name))[1]
));
create policy product_artwork_staff_read on storage.objects for select to authenticated using(bucket_id='product-artwork');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-formulations','product-formulations',false,800000,array['application/pdf']) on conflict(id) do nothing;
create policy product_formulations_insert on storage.objects for insert to authenticated with check(bucket_id='product-formulations' and public.take_off_is_approver() and exists(select 1 from public.product_workspaces w where w.product_id::text=(storage.foldername(name))[1]));
create policy product_formulations_staff_read on storage.objects for select to authenticated using(bucket_id='product-formulations');
