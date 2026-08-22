alter table public.accounts
  add column if not exists account_discount_percent numeric(8,4);

comment on column public.accounts.account_discount_percent is
  'Default ViewPlan account-level sales discount percentage used for field-sales indicative pricing.';
