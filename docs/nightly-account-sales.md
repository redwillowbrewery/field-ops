# Nightly dispatched Account order history

Account orders and expandable product lines already exist. This connector keeps
those same records up to date. ViewPlan remains read-only; open/changing orders
continue through the separate 30-minute fulfilment feed.

## Current rule and checkpoint behavior

Confirmed by Toby on 28 October: **Account history includes dispatched orders only;
once dispatched, the order and its product lines are immutable.**

- First load: read dispatched history in batches of **500 whole orders**, with all
  products in each selected order. Each successful batch commits its data and a
  resume cursor together. A stopped/failed run resumes after the last committed
  batch rather than starting over. In-flight batches roll back on database failure.
- Later nightly runs: read only dispatched orders since the last completed source
  checkpoint, with a five-minute overlap. Check `lud`, `updated_date` and
  `dispatched_date`, plus newly assigned source IDs. An older-created order newly
  dispatched is included by its timestamp, not excluded by its old creation date.
- Checkpoints use the ViewPlan machine's wall clock captured at scan start, not
  completion time. Changes arriving during a long scan remain eligible next time.
- No new dispatches is a successful zero-order run, never an instruction to delete
  history. Partial windows and batches never delete orders absent from the payload.
- A successful full import from the earlier connector can bootstrap the checkpoint
  using its original UTC read start, converted on the ViewPlan Windows host. Failed
  earlier imports cannot bootstrap; they start the bounded dispatched backfill.
- `-Full` deliberately restarts a dispatched backfill; ordinary nightly runs do not.
- Existing order IDs are adopted by exact order number then kept by stable ViewPlan
  ID. Blank ViewPlan order numbers identify unconfirmed pre-orders and are
  excluded in the source query before batching; history requires a numbered,
  dispatched order. No synthetic order numbers are created.

The source uses DAO `GetRows` buffers instead of individual COM calls per field.
Logs report source rows/orders/lines, request sizes, committed cursors and progress.
A source read is capped at 250,000 joined rows **per batch**; excessive or malformed
batches fail without advancing their checkpoint. `-BatchOrders` may be reduced for
large orders or a memory-constrained host. Credentials and order contents are not
printed in diagnostics.

## Audited source and persistence

The supplied schema and sales-definition reports establish stable order/customer/
line IDs and ViewPlan's spreadsheet calculations. Read explicit SELECTs against
base tables, never saved queries or VBA functions. Restrict to source types 1/2,
dispatched, non-cancelled/non-deleted orders; exclude cancelled/deleted lines.

Discounted Net/VAT use Access's own report rounding and discount expressions.
Signed line values are preserved; do not subtract credit-note records a second
time. Gross retains the report's pre-order-discount definition. Manufacturing/
duty report functions are not needed for displaying order products and are not run.

Each database batch atomically updates its orders, complete product lines, affected
Account summaries and checkpoint revision. Exact customer IDs replace name matching.
Conflicting identities, missing customers, invalid data or stale checkpoint leases
reject the batch. Prior committed batches remain available to resume from.

Existing undispatched rows are retained but excluded by the authenticated history
read policies, latest-order/summary functions and new readers. This applies to the
already-deployed Account screen. Notes, contacts, relationship status and fulfilment
assignments are unchanged. A failed scan never claims a successful completed refresh.

## Upgrade/install order

1. Keep the already-applied `20261028150000_nightly_account_sales.sql` migration.
   **Do not rerun it.**
2. Apply **`20261028160000_dispatched_sales_checkpoints.sql`**. It adds resumable
   checkpoints, dispatched-only reads and the new service-only ingestion function.
   It disables the old full-history RPC so outdated scripts cannot restore open
   orders to history or clear valid data.
3. On branch `feature/account-sales-nightly-20261028`, `git pull --ff-only`. Install
   these files together in the Windows Scripts directory: `viewplan-connector.ps1`,
   `viewplan-sales-source.ps1`, `viewplan-sales-sync.ps1`.
4. Keep the established `NEXT_PUBLIC_SUPABASE_URL` and protected
   `SUPABASE_SERVICE_ROLE_KEY` environment. PowerShell does not load `.env.local`.
   Use 32-bit Windows PowerShell in the same authenticated ViewPlan user session.
5. Run the standalone module, then verify Account orders and product quantities:

```powershell
.\viewplan-connector.ps1 -Module sales
```

If interrupted, rerun **the same command** to resume. Do not use `-Full` merely to
retry. A missing customer needs exact mapping/customer reconciliation, not fuzzy
matching. The completed scan prints `Account sales refreshed`.

The existing nightly task uses `-Module all -Scheduled`, which includes sales after
pricing and before containers. Keep `-Module orders -Scheduled` for the separate
fulfilment poll. No duplicate nightly task is needed. Observe a real overnight run.

Optional diagnostic export of the **first batch only**, without application writes:

```powershell
.\viewplan-sales-sync.ps1 -ExportPath .\sales-projection.json
```

## Validation

Compare dispatched orders, products, packaging, quantities and latest dates with
ViewPlan; pending orders must not appear. Test a subsequent run with no dispatches,
a newly dispatched older-created order and a restart after a committed batch.
Ensure failures preserve earlier batches/cursors and a completed scan advances
successful freshness. A source cancellation after dispatch contradicts the stated
immutability rule and needs an explicit correction workflow, not absence inference.

Automated tests cover source query predicates, overlap/keyset boundaries, bulk-read
projection, pre-order exclusion, checkpoint resumes and leases, empty increments,
bootstrap, dispatched-only policies/summaries, stable IDs, rollback and permissions.
Windows CI checks x86 source fixtures and nightly runner sequencing. Actual Access
execution and one scheduled overnight trigger remain field acceptance.
