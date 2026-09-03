-- Sprint 2A prerequisite: retain Product lifecycle and commercial state independently
-- from Product Variant availability and package saleability.

alter table public.products
  add column if not exists active boolean not null default true,
  add column if not exists sellable boolean not null default true,
  add column if not exists business_exchange boolean not null default false;

comment on column public.products.active is
  'Whether this Product belongs to the current brewery catalogue. ViewPlan currently supplies this from Product.isAvailable.';
comment on column public.products.sellable is
  'Canonical Product-level commercial eligibility. ViewPlan currently supplies this from Product.isAvailableForSale; it is retained but is not the Sprint 2A catalogue filter.';
comment on column public.products.business_exchange is
  'Whether the Product is a legacy bought-in/business-exchange Product. Retained for history but excluded from the current RedWillow sales catalogue.';

-- Preserve the meaning of the existing status column for rows created before this
-- migration. The connector will replace these defaults with source truth on its next run.
update public.products
set active = (lower(status) = 'active')
where active is distinct from (lower(status) = 'active');

create index if not exists products_current_sales_catalogue_idx
  on public.products(name)
  where active = true and business_exchange = false;

-- New weekly selections must use the canonical current catalogue. Existing
-- associations are intentionally not deleted if Product state later changes.
drop policy if exists "Authenticated users can edit weekly plan products"
  on public.weekly_sales_plan_products;

create policy "Authenticated users can add current weekly plan products"
on public.weekly_sales_plan_products for insert to authenticated
with check (
  exists (
    select 1
    from public.products p
    where p.id = product_id
      and p.active = true
      and p.business_exchange = false
  )
);

create policy "Authenticated users can remove weekly plan products"
on public.weekly_sales_plan_products for delete to authenticated
using (true);
