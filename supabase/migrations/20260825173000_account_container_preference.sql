alter table public.accounts
  add column if not exists container_preference text not null default 'any';

alter table public.accounts
  drop constraint if exists accounts_container_preference_check;

alter table public.accounts
  add constraint accounts_container_preference_check
  check (container_preference in ('any','one_way_only'));

comment on column public.accounts.container_preference is
  'Commercial packaging constraint used by availability and sales tools. any = no restriction; one_way_only = suppress returnable draught containers.';
