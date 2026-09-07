-- Bearer links are private staff data, never an anonymous database API.
create table public.account_price_list_links (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id)
);
alter table public.account_price_list_links enable row level security;
revoke all on public.account_price_list_links from public, anon, authenticated;
grant select on public.account_price_list_links to authenticated, service_role;
create policy staff_read_price_list_links on public.account_price_list_links
for select to authenticated using (
  exists(select 1 from public.accounts a where a.id = account_id)
);

-- The current CRM access model permits authenticated staff to manage Accounts.
-- Tokens are generated here, not supplied by callers; only one active link per Account.
create function public.manage_account_price_list_link(p_account_id uuid, p_action text)
returns text language plpgsql security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
  link_token text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_action is null or p_action not in ('create','replace','revoke') then raise exception 'Invalid link action'; end if;
  if not exists(select 1 from public.accounts where id=p_account_id) then raise exception 'Account not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text, 2026090712));
  if p_action='revoke' then
    update public.account_price_list_links set revoked_at=now(),revoked_by=actor
    where account_id=p_account_id and revoked_at is null;
    return null;
  end if;
  if not exists(select 1 from public.accounts where id=p_account_id and active and relationship_status <> 'closed') then
    raise exception 'Price lists can only be shared for active Accounts';
  end if;
  if p_action='create' then
    select token into link_token from public.account_price_list_links where account_id=p_account_id and revoked_at is null;
    if link_token is not null then return link_token; end if;
  end if;
  link_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.account_price_list_links(account_id,token,created_by)
  values(p_account_id,link_token,actor)
  on conflict(account_id) do update set token=excluded.token,created_by=actor,
    created_at=now(),revoked_at=null,revoked_by=null;
  return link_token;
end;
$$;
revoke all on function public.manage_account_price_list_link(uuid,text) from public,anon;
grant execute on function public.manage_account_price_list_link(uuid,text) to authenticated;
