# Nightly Account order history

Account order history and its expandable product lines already exist. This change
refreshes their existing `sales_orders` / `sales_order_lines` records from ViewPlan,
and derives the Account-list/visit-planning summary from that same history.
ViewPlan remains read-only; no order creation, allocation, dispatch or finance
authority moves. The separate 30-minute fulfilment poll is retained.

## Audited source mapping

The supplied `fulfilment-schema-audit.json` establishes `tblOrder.order_id`, unique
`order_no_val`, `customer_id` and `tblOrder_Items.order_item_id`. The supplied
`viewplan-sales-definitions.json` is complete, without issues, and establishes the
calculations in `qryReportA%Sales (A)_Order Data (Spreadsheet)`.

The adapter reads explicit bounded SELECT snapshots of base tables, not saved
queries or VBA functions. It reads all source order headers and their lines,
including inactive headers for explicit cancellation/type-change reconciliation.
Source types 1/2 and non-cancelled/non-deleted headers/lines supply sales history,
matching the report. Older amended orders are included: no rolling date window or
unproven header change watermark is used.

Net and VAT are rounded by Access before the positive-value order discount is
applied and rounded again, exactly as the report does. Non-positive `(discount)`
line amounts are null in the discounted totals; other signed amounts are retained.
Gross retains the report's pre-order-discount definition. Do not independently
subtract credit-note records on top of the report's line values. Manufacturing
cost/duty/VBA report functions are unnecessary for displaying Account order products
and are not invoked. Source product names, including manual-entry text, packaging,
quantities and available line values feed the existing order expansion.

## Persistence and safety

- Exact `accounts.brewery_customer_id` resolution; no customer-name matching.
- Existing workbook order numbers are adopted without replacing their UUIDs.
  Subsequent order/line source IDs preserve their canonical IDs on repeat reads.
- A single service-role-only transaction updates all accepted orders, reconciles
  full line sets and explicit cancellations, then updates summaries and successful
  refresh/run state. Invalid mappings, duplicates or failed writes roll it all back.
- Full-source absence removes only previously adopted source order IDs. Unadopted
  workbook history is preserved; it is not guessed to be deleted.
- Empty/oversized reads, stale snapshots and unexpected reductions fail closed.
  A greater-than-20% order reduction requires deliberate `-AllowLargeReduction`
  on the standalone sync after checking the source. The default nightly run does
  not bypass this guard. Source rows default to a 250,000 joined-row limit; hitting
  it fails without partial ingestion. Review 32-bit process memory/source size
  before increasing `-MaxRows`.
- A local exclusive lock prevents overlapping sales invocations. Database locking
  and source-time checks reject concurrent/out-of-order ingestion.
- Failed attempts record a safe stage and keep the last successful source time.
  The existing connector health projection automatically includes the `sales` state.
- CRM notes, contacts, relationship status and fulfilment assignments are not
  rewritten. The old spreadsheet sales importer is not added to scheduling.

The sales history reader also paginates orders and product lines beyond REST row
limits. Its all-history metric is labelled `Total sales`; the Account detail's
separate current-year summary remains a current-year summary.

## Installation order

1. Apply `20261028150000_nightly_account_sales.sql` after the existing sales,
   customer connector, runner-health and fulfilment orders-module migrations.
   It extends the existing tables and permits `sales` as a runner module.
2. Deploy the application changes for complete order/product pagination.
3. Copy these three files together into the Windows connector Scripts directory:
   `viewplan-connector.ps1`, `viewplan-sales-source.ps1`, `viewplan-sales-sync.ps1`.
4. Keep the established `NEXT_PUBLIC_SUPABASE_URL` and protected
   `SUPABASE_SERVICE_ROLE_KEY` process/user environment. PowerShell does not load
   `.env.local`. Use 32-bit Windows PowerShell in the same authenticated ViewPlan
   user session. No new credential or duplicate nightly task is needed.

First produce a source-only diagnostic projection (contains business data, not keys):

```powershell
.\viewplan-sales-sync.ps1 -ExportPath .\sales-projection.json
```

Compare recent and older representative orders, beer names, packaging, quantities,
discounted values and a credit with ViewPlan. An export alone does not update the
application. Then perform the first refresh:

```powershell
.\viewplan-connector.ps1 -Module sales
```

If it reports an unmapped customer, run the existing full customer reconciliation
and investigate exact identity mapping; do not substitute name matching.

The existing nightly entry point now includes sales after pricing and before
containers:

```powershell
.\viewplan-connector.ps1 -Module all -Scheduled
```

Verify the existing task actually uses `all` (or leaves Module at its default),
then observe one real overnight trigger. Leave the fulfilment task's
`-Module orders -Scheduled` and 30-minute cadence intact.

## Acceptance and validation

Open Account sales history, expand a known order and compare products, packaging
and quantities. Check an order newer than the previous manual import, an older
amended order, a removed line and a genuine cancellation. Run twice: orders and
line identities must remain stable without duplicates. Compare latest-order dates
and totals with the audited ViewPlan report, and ensure `sales` health shows the
successful source-read time. Do not fabricate production orders for testing.

Automated coverage includes legacy adoption, stable identities, product/quantity
updates, removed lines, cancellations, signed values, summaries/latest dates,
transaction rollback, stale snapshots, size/reduction guards and denied staff/anon
ingestion. Unit coverage checks order/product pagination. Offline PowerShell source
fixtures verify projection shapes and fail-closed reads. Windows CI checks x86
compatibility and all-module sequencing/failure behavior. Actual Access execution,
source/report comparisons and overnight scheduling remain rollout acceptance.

No production migration, Windows installation or task change is performed merely
by committing this implementation.
