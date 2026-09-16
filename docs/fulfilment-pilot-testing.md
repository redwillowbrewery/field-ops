# Fulfilment order feed and weekly board — pilot test

This slice supports provisional date/vehicle planning and source changes only. No route optimisation, driving-time/space/return-load validation, route finalisation, Google Maps export, VP writes, allocation, picking or dispatch clearance is implemented here. Those remain subsequent milestones. A successful build is not field acceptance.

## Server installation and first run

Keep the working ViewPlan task and credentials unchanged. Copy these files to its Scripts directory:

- viewplan-connector.ps1
- viewplan-orders-sync.ps1
- viewplan-orders-source.ps1

With ViewPlan open/authenticated in the same Windows session, use 32-bit Windows PowerShell:

```powershell
.\viewplan-connector.ps1 -Module orders
```

The orders module is separate from `all`; the existing overnight full sync is unchanged. It refreshes recent/future and source-open orders plus all IDs already tracked by the pilot, including moved/cancelled orders. Reads are bounded; empty/oversized/failed reads preserve previous snapshots. A missing source row ages visibly and is never inferred cancelled. No historical sales tables are replaced. This initial pilot retains all tracked IDs; establish reviewed archival scope before the 10,000-row guard is approached.

For a source-only diagnostic export without application writes:

```powershell
.\viewplan-orders-sync.ps1 -ExportPath .\orders-projection.json
```

The export does not fetch application-tracked IDs. It is a diagnostic scope, not a replacement for a successful live poll. Never send credential/environment files with an export.

## 30-minute task

After the manual run succeeds, create a separate Windows Scheduled Task using the same authenticated user/session and environment as the working ViewPlan task. Run only when that user is logged on, and do not start another instance when already running. Repeat every 30 minutes indefinitely. Do not run the entire catalogue/pricing connector every 30 minutes.

Program: `C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe`

Arguments: `-NoProfile -ExecutionPolicy Bypass -File "C:\ViewPlan\BMS\Scripts\viewplan-connector.ps1" -Module orders -Scheduled`

Start in: `C:\ViewPlan\BMS\Scripts`

Observe one actual timed invocation and the board's last source-read time before calling scheduling accepted. No task is registered automatically by this release.

## Board checks

Open `/fulfilment` from Sales. The default covers the current week plus two weeks; navigate future weeks as needed.

1. Compare actual orders, date, source vehicle and package quantities with ViewPlan. Verify that source-dispatched/delivered orders remain visible: VP auto-sets both during allocation.
2. Compare calculated known outbound weights with VP package weights. Unknown and miscellaneous lines must stay unresolved, including Collect Empties, which has no container counts in the source instruction line.
3. Confirm Pallet work is separated, and that 1,400/1,450 kg source payloads appear on van groups. Courier and COLLECT are not extra vans; COLLECT remains a classification review. Verify actual daily resource availability manually.
4. Save a provisional date/vehicle assignment. Re-poll unchanged: it survives with no new source revision. Compare two simultaneous edits: the stale one is rejected.
5. During normal business, amend an existing VP order and poll: the full new line set/weight appears, the provisional assignment survives and shows source-changed review. No artificial production order is required.
6. Review a naturally cancelled/deleted order with Include cancelled/deleted selected. It must not be editable or disappear from retained history. Failed polls leave prior data with a warning. Missing source rows become stale.
7. Check the two delivery-address overrides against actual delivery destinations; geocoding/routing of those addresses is not implemented yet.

Provisional planning does not update VP dates or vehicles; coordinate proposed changes through the existing Sales/VP process. There is deliberately no finalise/dispatch control. Later final routing must perform the mandatory fresh source read and full route feasibility validation, and require acceptance of committed-plan changes.

## Verification performed

- Production build and TypeScript checks passed.
- 47 unit tests and all seven database suites passed.
- New database coverage includes replay, source amendments preserving plans, stale/concurrent writes, atomic rejection, source timestamp checks and role boundaries.
- The PowerShell adapter passed a fake-DAO replay of the supplied 96-order/268-line audit, including tracked-scope overlap and row-limit rejection. Actual ViewPlan execution remains a user field test.
- No source audit data was inserted into production by the implementation tests.

## Daily map field test

Choose a day in the three-week view, then all vans or one van. Check the depot address, van colours, grouped customer locations and delivery/collection details. Select a marker or list entry and open the linked order. Orders at shared coordinates remain listed individually within customer/van groups. Unknown/overridden locations remain visible as exceptions; non-van and undated work remains listed separately. Test at phone and desktop widths and with map assets unavailable (the work list remains usable).

The map depicts postcode-based locations, not road routes. Pin numbers identify list entries, not delivery sequence. The depot pin is an approximate postcode centre. The next routing stage still needs a provider/account decision and verified depot entrance; no driving-time validation or final route is implied.
