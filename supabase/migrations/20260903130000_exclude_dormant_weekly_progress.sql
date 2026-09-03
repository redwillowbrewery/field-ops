-- Keep weekly progress aligned with the explainable initial-push membership rule.
-- Dormant Accounts require an explicit reactivation workflow and are not included
-- automatically merely because their Territory is selected.

drop policy if exists "Authenticated users can add valid weekly progress"
  on public.weekly_sales_account_progress;

create policy "Authenticated users can add valid weekly progress"
on public.weekly_sales_account_progress for insert to authenticated
with check (
  updated_by = auth.uid() and exists (
    select 1
    from public.accounts account
    join public.weekly_sales_plan_territories plan_territory
      on plan_territory.territory_id = account.territory_id
    where plan_territory.plan_id = plan_id
      and account.id = account_id
      and account.sales_service_model = 'territory'
      and account.active
      and coalesce(account.brewery_available, true)
      and account.relationship_status not in ('closed', 'dormant')
  )
);

