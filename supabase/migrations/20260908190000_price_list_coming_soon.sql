-- Server-only public projection. Never return request notes, owners, quantities,
-- account identities, tank labels or raw connector diagnostics.
create function public.price_list_coming_soon()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare state take_off_sync; result jsonb;
begin
 select * into state from take_off_sync where singleton;
 if state.snapshot_at is null or state.snapshot_at<now()-interval '24 hours' or state.last_error is not null then
  return jsonb_build_object('status','unavailable','observedAt',state.snapshot_at,'items','[]'::jsonb);
 end if;
 select coalesce(jsonb_agg(item),'[]'::jsonb) into result from (
  select jsonb_build_object(
   'productId',p.id,'productName',p.name,'description',coalesce(pp.description,''),
   'imageUrl',pp.image_url,'abv',coalesce(pp.abv,p.abv),
   'package',case when k.id is null then null else jsonb_build_object(
     'id',k.id,'name',k.name,'broad_format',k.broad_format,'package_system',k.package_system,
     'capacity_litres',k.capacity_litres,'lifecycle',k.lifecycle,'procurement_mode',k.procurement_mode) end,
   'variantId',(select case when count(*)=1 then min(v.id::text) else null end
     from product_variants v where v.product_id=p.id and v.package_id=k.id and v.allow_sale),
   'estimatedDate',case when greatest(s.brew_date+s.packaging_days,a.approved_date)>=(now() at time zone 'Europe/London')::date
     then greatest(s.brew_date+s.packaging_days,a.approved_date) else null end
  ) item
  from take_off_subjects s
  join products p on p.id=s.product_id and p.active and not p.business_exchange
  left join product_presentations pp on pp.product_id=p.id
  left join lateral (
   select r.package_id,min(r.approved_date) approved_date
   from take_off_requests r join take_off_subjects origin on origin.id=r.subject_id
   join packages pkg on pkg.id=r.package_id and pkg.active
   where take_off_root(r.subject_id)=s.id and not r.withdrawn and r.approved_quantity>0
   and r.approval_context=take_off_context(s.id) and r.approved_by is not null
   and not origin.missing and origin.phase<>'cancelled'
   group by r.package_id
  ) a on true
  left join packages k on k.id=a.package_id
  where s.kind='batch' and s.phase='in_tank' and not s.missing
   and not s.source_link_conflict and s.volume_litres>0 and take_off_root(s.id)=s.id
 ) projected;
 return jsonb_build_object('status','fresh','observedAt',state.snapshot_at,'items',result);
end $$;
revoke all on function public.price_list_coming_soon() from public,anon,authenticated;
grant execute on function public.price_list_coming_soon() to service_role;
