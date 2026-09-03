-- Retire legacy Product shells created before explicit external identities were
-- established. These rows have neither a source identity nor a sellable Variant,
-- so they cannot participate in canonical commercial workflows. Keep the rows
-- for auditability; do not name-match, merge, or delete them.

update public.products p
set
  active = false,
  status = 'inactive',
  updated_at = now()
where p.active = true
  and not exists (
    select 1
    from public.product_external_ids external_id
    where external_id.product_id = p.id
  )
  and not exists (
    select 1
    from public.product_variants variant
    where variant.product_id = p.id
  );

