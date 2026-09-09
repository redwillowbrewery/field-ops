# ViewPlan Connector

The ViewPlan connector is the read-only bridge from the legacy ViewPlan BMS into Brewery Ops.

## Ownership

ViewPlan remains authoritative for source-owned operational/master data. Brewery Ops owns CRM activity and application state.

### ViewPlan-owned customer fields

The customer connector updates:

- ViewPlan customer ID/reference
- customer name and classification
- postal address
- account telephone/email/website
- contact preferences and do-not-call/email flags
- sales channel
- ViewPlan call schedule fields
- ViewPlan availability flag
- numbered ViewPlan contact slots 1-5

### Brewery Ops-owned fields

The connector deliberately does **not** overwrite existing:

- relationship status
- CRM-created contacts (contacts without a ViewPlan contact slot)
- notes
- visits
- appointments
- tasks/follow-ups
- geocoding
- CRM priority/workflow state

For a brand-new account only, an initial relationship status is seeded from ViewPlan availability/prospect flags. Later syncs do not replace it.

## Sprint 2C requirement — overnight Account commercial snapshot

Sprint 2C is CURRENT. The commercial module is implemented locally; apply migration `20260907100000_account_commercial_snapshot.sql` and deploy the new scripts before operational use. The customer connector now invokes `viewplan-account-commercial-sync.ps1` after every successful identity pass, including zero-change incremental runs. It performs a full commercial read and records separate `account_commercial` state.

The [7 September implementation review](./sprint-2c-implementation-review.md) records source evidence, confirmed meanings, current delivery status and rollout checks. Balance uses `qryCustomerOutstandingTotalsAll.outstanding_total`; limit uses `tblCustomer.customer_max_credit`; currency is confirmed GBP. Status-list `allow_order` and `allow_order_dispatch` are distinct explicit source permissions. Sales may take an order while payment is required before dispatch; present this clearly rather than labelling every dispatch restriction as an ordering stop. `credit_amount` is credit on account, not the balance owed.

Audit the exact source fields/query, currency/sign and hold meanings before implementation. Refresh commercial facts even when customer-master `lud` is unchanged; financial/hold changes must not be missed by the customer incremental filter. Map by exact external identity to the canonical Account, preserving CRM-owned data.

ViewPlan remains authoritative for products, production, inventory, orders and logistics; Sales consumes orders and commercial facts from Account. All commercial snapshot fields are read-only in Brewery Ops. Explicit hold/stop is the authoritative sell/stop signal: do not derive holds or clearance from balance versus credit limit. Unknown status is not clearance.

On failed refresh preserve previous successful values and their timestamp, and surface stale/unavailable state. Missing values are not zero or clear hold. Prospects without a ViewPlan mapping retain normal CRM workflow. Snapshot time describes the successful commercial read, not the latest attempted run or page render. See [2C.8 acceptance criteria](./sprint-2c-prospects-interactions-follow-up.md#2c8--viewplan-account-commercialcredit-snapshot).

## Requirements

- Run from 32-bit Windows PowerShell.
- ViewPlan must already be open and authenticated in the same Windows session.
- `NEXT_PUBLIC_SUPABASE_URL` must be set.
- `SUPABASE_SERVICE_ROLE_KEY` must be a protected Supabase server/service-role key, never a publishable browser key.
- Migration `20260824171500_viewplan_connector_customer_sync.sql` must be applied first.

## First run

Run a full reconciliation:

```powershell
.\viewplan-connector-customers.ps1 -Full
```

A full run reads all ViewPlan customers and batch-merges them into Brewery Ops.

## Normal run

```powershell
.\viewplan-connector-customers.ps1
```

After the first successful full run, normal runs use `tblCustomer.lud` as a high-water mark and re-read a five-minute overlap to avoid timestamp-boundary misses.

## Audit/state

The connector writes:

- `connector_sync_state` - last successful high-water mark per module
- `connector_sync_runs` - one audit row for each connector execution

Failures do not advance the high-water mark.

## Scheduling

Initially schedule the customer connector overnight only after the full and incremental runs have both been validated manually.

The current safe connection method attaches to the already-running authenticated ViewPlan Access application. Therefore a Windows scheduled task must run in the same interactive user session and ViewPlan must remain open. A later connector phase should replace this dependency with a safe unattended database-open method.

A sensible initial schedule is daily at 02:00, plus a periodic full reconciliation (for example weekly) as a safety check.

## Planned modules

The same connector framework will be extended to:

1. products and packaging
2. customer pricing
3. sales history
4. availability
5. returnable containers
6. delivery/route data

## Sprint 3 — Take Off Planning

The take-off module reads ViewPlan plans, tank contents and existing take-off quantities; it never writes ViewPlan. See [installation, cadence and validation](./sprint-3-implementation-review.md). Copy the updated runner and both take-off scripts together. Head Brewer approval is enforced in Brewery Ops; source sync does not overwrite Sales requests.

### Take Off fermentation duration

The updated source helper also selects tblBrew_Type.incubation_duration_days for planned and actual brews and projects it as packaging_days. The audited ViewPlan qryTakeOffPlanBasic uses this duration plus task_due_date for its packaging estimate; the connector still uses explicit read-only SELECTs. Blank duration remains null, never zero. The complete refresh updates this value even if customer/product master high-water marks do not change. Copy the updated viewplan-take-off-source.ps1 with the runner and sync script, then run .\viewplan-connector.ps1 -Module take-off. Migration 20260908160000_take_off_grid.sql is applied. Old connector payloads remain compatible and leave estimates unknown. Invalid durations fail the whole refresh and retain the last successful snapshot.

## Product ownership handover — planned, not yet applied

See [Product ownership review](./product-ownership-review.md). The current products runner invokes price/catalogue reconciliation, canonical Package reconciliation and exact Sellar mappings. During Product adoption, refactor editorial writes into external observations so routine reconciliation cannot overwrite local published names, specifications or content. Keep ViewPlan-owned prices, operational plan/batch/tank facts and exact IDs intact. No ViewPlan writes or automatic external creation are authorised by this review; new local beers need an explicit manual setup/mapping workflow until operational ownership transfers.

## Product Label Text discovery — Sprint 4

Run [audit-viewplan-product-labels.ps1](../scripts/audit-viewplan-product-labels.ps1) in 32-bit Windows PowerShell in the authenticated ViewPlan session. It discovers candidate product/label fields and takes bounded read-only snapshots including memo text, without saved query execution or writes. Share product-label-audit.json. Confirm the actual UI field, representative fined/unfined/vegan-friendly labels, gluten wording and change-marker behavior before implementing mappings. The sample is not a complete catalogue or an approved declaration. See [Sprint 4](./sprint-4-product-foundation.md) for adoption and family rules.

## Sprint 4 Product source and editorial boundary

See [rollout](./sprint-4-implementation-review.md). The updated products runner performs a full label observation refresh before catalogue reconciliation. Unmapped source products wait for an exact match in Products, and routine Sellar refresh is availability-only. Published editorial names/ABV are protected while ViewPlan prices and operational facts continue. Install the updated server Product scripts after application release; migrations are already applied. The Windows overnight scheduling/session fault remains a separate open issue.
