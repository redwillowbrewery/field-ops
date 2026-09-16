# Weekly fulfilment — repository review and implementation entry point

Reviewed 15 September 2026 against main `dfc9862`. Scope: the [weekly fulfilment brief](./weekly-fulfilment-plan.md). This is implementation scoping, not a deployed operational workflow.

## Starting state

Main was fast-forwarded from a clean checkout. Product foundation and its architecture fixes are merged; the subsequent connector User-Agent and Sellar negative-availability fixes are also present. Existing Product work is retained. No production migrations, order imports or execution records were changed for this review.

## Repository-backed gap analysis

| Area | Reusable evidence | Gap / implementation decision |
| --- | --- | --- |
| Account and commercial controls | `src/app/accounts`, `account_commercial_snapshots`, exact account mappings | Reuse identity and explicit ordering/dispatch flags. Snapshot freshness and unknown flags must affect readiness; no balance-versus-limit rule. |
| Order history | `supabase/migrations/20260822120500_sales_history.sql`, `src/app/accounts/[id]/sales/page.tsx` | History has order number, delivery/dispatch dates and flags, quantities, textual package/product, line weight and vehicle text. These columns do not establish source meaning or current open-order coverage. No immutable source revisions, delivery-address snapshot, stable source line ID or canonical variant FK in this schema. |
| Sales import | `scripts/import-viewplan-sales.mjs`, particularly `importOrders` | Deletes orders by order number then inserts replacement UUIDs and lines. Lines use export row position. Do not attach planning or picks to this mutable history identity. Design stable source order/line identities and atomic revision ingestion after audit; preserve existing Account history. |
| Scheduled source access | `scripts/viewplan-connector.ps1` | Modules are customers, products, pricing, containers and take-off; no scheduled orders module. Add an audited read-only order adapter with explicit completeness and failure semantics, not another spreadsheet replacement importer. |
| Packages and variants | `20260826140000_canonical_packages.sql`, `product_variants.package_id` | Reuse physical package identity, capacity and lifecycle. No verified gross/tare weights, footprint, stacking or fleet cargo model. Litres are not gross transport weight. Existing history line-weight values are evidence to audit, not verified load profiles. |
| Maps | `src/app/map/map-view.tsx`, `src/app/returns/returns-map.tsx` | Reuse map presentation and Account coordinates. Existing proximity uses Haversine distance; no road-time matrix or constrained assignment/sequence service. Account postcode coordinates are not verified delivery entrances. |
| Returnables | `src/app/returns/page.tsx`, container sync and `account_returnables_summary` | Reuse opportunities and type/age context. Outstanding assets do not prove empties are ready. Need explicit collection jobs, estimates, confirmations, partial actuals and remaining work. |
| Runs and capacity | No dated-run/vehicle/stop-revision model found in migrations | New canonical local planning records, pins, commitments, driver/vehicle availability, per-leg weight and space checks; unknown data blocks validated readiness. |
| Warehouse and driver | No versioned pick/load/driver execution workflow found | Issued source/run revision, reconciliation deltas, actuals, shortages and VP hand-back queue required. A pick is not a stock reservation. |
| Inbox | No mailbox ingestion/matching adapter found | Discover platform, shared folders, sent replies and access. Read-only ingestion with evidence and internal exceptions; no automatic replies or VP order creation. |
| Permissions | Existing capability pattern from Product/Take Off | Reuse server-side capability checks but define planner, warehouse and driver scopes explicitly. Workspace selection grants no access. Do not expose general staff/formulation data to drivers by default. |

## Ownership and records

Reuse canonical Accounts, Products, Packages, Variants and external mappings. Add fulfilment records rather than departmental copies of those entities. The persistence design must distinguish immutable imported order revisions from local planning state and issued execution revisions. Decide whether to extend the history model or introduce a linked canonical operational projection only after auditing stable VP identities; do not put foreign keys against history UUIDs while the replacement importer can delete them.

An order starts on one run in the pilot. Enforce assignment uniqueness atomically. If split orders become necessary, introduce explicit allocated/residual quantities before permitting them. Collections are independent jobs and can share a stop with a delivery. An address is a versioned job fact, not a live lookup that silently changes an issued run.

VP keeps order entry and its existing operational records. Brewery Ops adds planning/picking progress and exceptions. Before live execution, name who records allocation, batch/lot selection, dispatch, invoicing, duty and container movements in VP, when they do it and how discrepancies are closed. A local completed stop creates any required hand-back work; it never claims a successful VP write.

## Small implementation milestones

| Slice | Work | Exit evidence |
| --- | --- | --- |
| 0A — Source discovery | Bounded read-only VP audit of order headers, lines, statuses, addresses, dates, amendments/cancellations and source keys/change markers. Compare a representative week with current run/pick sheets. | Reviewed field map; stable IDs and completeness contract; ambiguous dates/statuses explicitly unresolved. No guessed cancellation semantics. |
| 0B — Operational inputs | Fleet cargo allowances/layouts, gross/tare and space profiles, depot, service times, regular areas/days, driver availability, delivery commitments and VP hand-back owners. Discover mailbox and road-routing access. | Verified inputs with basis/date, explicit unknowns and named hand-back responsibilities. |
| 1A — Order revision feed | Atomic, repeatable read-only ingestion with exact mappings, source completeness, freshness, immutable revisions and local assignment preservation. Protect existing history consumers/importer. | Unchanged replay, partial failure, amendment and explicit cancellation tests; no duplicate identities or false deletion. |
| 1B — Manual weekly plan | Rolling current-plus-two-week view, delivery and collection jobs, dated runs, pins, windows and provisional/committed revisions. | A representative week can be entered/reconciled with visible unassigned and uncertain work. This alone does not complete milestone 1. |
| 1C — Suggestions and feasibility | Road travel-time adapter, feasible day/vehicle assignment and sequencing, service/depot legs, independent weight/space checks and explainable change sets. | Real-week comparison; preserve commitments/pins, show unserved work and test all legs including return. Recommendations are required for the planning pilot. |
| 2A — Warehouse issue | Versioned picks/loads, customer breakdown, shortages, changed-source deltas and unpick/unload reconciliation. | Amendment/cancellation after issue blocks readiness until exact quantities are reconciled. |
| 2B — Driver and hand-back | Ordered run sheets, delivery/collection actuals, failed delivery, partial returns, acknowledged revisions and VP action queue. | One pilot run reconciled end to end; completed stops retained and failed deliveries remain onboard. |
| 3 — Inbox pilot | Evidence-based thread/order matching and deduplicated internal exceptions after mailbox discovery. | Reviewed false positives/misses; automatic acknowledgements do not count as substantive replies. Can run alongside milestone 1. |
| 4 — Calibration | Refine service/travel estimates and suggestion stability using observed weeks. | Compare planning effort, rework, distance/time, missed windows and unresolved work without claiming optimality. |

Use the twelve acceptance scenarios in the brief as the cross-slice contract. No sprint numbers, delivery estimates, routing provider purchase or production rollout are assigned by this review.

## Next concrete work

Prepare the narrow VP source audit before choosing order mappings. Run it on the ViewPlan server in the existing 32-bit authenticated Access session; ViewPlan is not on this dev box. Start with schema and relevant query definitions, then a bounded representative-week projection once candidate fields are known. Fail on truncation and retain the source observation timestamp. Do not modify VP data merely to demonstrate amendment markers.

In parallel collect current run/pick sheets, fleet/loading data and the existing VP completion process. The main mailbox is sales@redwillowbrewery.com; its platform and sent-folder access remain unconfirmed. Sales staff adjust delivery days based on weights and the normal delivery plan, fed by weekly Sales planning. Toby confirms that VP dispatch status is set once an order is fully allocated: treat it as source allocation/workflow evidence, not proof of departure or completed delivery. Verify the precise source field and transitions in the audit. Responsibility for physical delivery completion, stock/batch recording, invoicing and duty hand-back remains to be confirmed. No live operational imports or mailbox reads have been demonstrated yet; milestone 0 remains open.

### Warehouse barcode allocation

Warehouse assigns containers to orders using a barcode scanner (confirmed by Toby, 15 September). Preserve this existing allocation workflow during the planning pilot. Brewery Ops pick/load progress must remain distinct from the source container allocation and from physical departure/delivery completion.

Extend the read-only VP audit to identify scanned container identities, their order/line assignments, package and batch/gyle lineage where available, partial allocation, and removal/reassignment behavior after amendments or cancellations. Verify how these assignments produce the fully allocated/dispatch status. Do not infer the source schema, assume every package is individually scanned, or treat a scan as proof of loading or departure. Replanning must retain the assignments and flag changes that require Warehouse reconciliation; do not introduce a second allocation authority.


### Variable daily van requirement — confirmed 15 September 2026

Toby confirms that some days use one van and others two, depending on order/sales volume. Two-van days are usually Tuesday, Wednesday or Thursday; these are typical patterns, not mandatory two-van days or a restriction against using two vans on other days.

The planner must suggest whether due work can be served by one van or needs a second, using verified vehicle/driver availability, weight, space, road travel and service time, and delivery commitments. Order count alone is not a capacity measure. Prefer avoiding an unnecessary second run where one van is feasible, without moving fixed commitments or concealing unserved work. Show why a second van is recommended and the effect on finish time and capacity; Sales can accept or adjust the proposal through the same validation.

Keep daily vehicle availability separate from the number of vans actually assigned. One/two-van operation does not establish total fleet size, driver availability or a hard maximum fleet capacity. Verify those inputs during discovery. A volume change or vehicle substitution should recalculate proposals while preserving accepted-plan protections and manual pins.


### Driver limits and pallet-network fulfilment — confirmed 15 September 2026

Driver maximum driving time and van weight loading must constrain run suggestions and readiness. Record each applicable driving-time limit explicitly; the initial operating standard is recorded below; applicable legal limits are not established by this brief. Keep driving time distinct from service/loading time and total shift duration. Include depot return and any reload travel in driving totals, account for relevant breaks/availability, and flag unknown limits as unvalidated. Verify applicable limits and their basis before live use. Recheck vehicle load on every leg, including collections and failed deliveries, using the verified cargo allowance described above.

Customers whose territory is Pallet are prepared as pallet shipments in the brewery and dispatched through a pallet network. They must appear in fulfilment and warehouse planning as pallet-network work, not be assigned automatically to local delivery vans. Audit the exact canonical territory/source mapping before implementing this classification; do not guess from address or product names. Preserve territory as an Account attribute and model fulfilment method separately so the planning model can support explicit exceptions without redefining territory as a transport mode.

Initial scope identifies pallet-network work separately and supports the existing manual preparation/dispatch handover. Verify how pallet shipments are currently grouped, documented and marked complete. Network booking, carrier integration and delivery tracking are future requirements; no automatic booking or claim of carrier confirmation is introduced in the initial pilot. Future booking/tracking should use a shipment/carrier adapter with references and status history, while retaining order and batch/container lineage.


### Initial driving and payload inputs — confirmed 15 September 2026

Toby supplies a standard maximum driving time of four hours and an approximate van payload of 1,200 kg. Use 240 minutes as the initial daily driving budget per driver, including outbound, between-stop and depot-return/reload travel across assigned runs; service/loading time remains separate from driving and still contributes to the working day. This is the supplied operating standard, not a statement of a statutory limit.

Use 1,200 kg only as a visibly estimated planning payload until the operational cargo allowance for each van and operating setup is verified. Preserve the approximate/verified distinction; the estimate must not allow a run to be marked fully capacity-validated. Do not infer space capacity, tare/full package weights or driver shift length from these inputs. Allow explicitly recorded vehicle/driver-specific constraints and apply the relevant limits when assigning or substituting resources.


### Google Maps driver handover — agreed 15 September 2026

Provide an Open in Google Maps action from the issued driver run, preserving the agreed stop sequence and including depot return. Provide Navigate to next stop as a dependable per-stop option. This is navigation handover through links, not a promise to upload or synchronise a saved route into a driver's Google account.

Google Maps URLs have platform-dependent waypoint limits (currently up to three intermediate waypoints on mobile browsers and nine otherwise). Split longer runs into clearly numbered consecutive sections without dropping or reordering stops; validate link length and behavior on the drivers' actual phones. Keep the full ordered run sheet available in Brewery Ops. Source: https://developers.google.com/maps/documentation/urls/get-started (checked 15 September 2026).

Brewery Ops retains the accepted run revision, capacity/time checks, delivery/collection tasks and completion state. Opening navigation does not mark a stop complete. Changed runs require the established driver acknowledgement and newly generated links; an old link cannot be treated as automatically updated. Google Maps navigation may recalculate road paths and does not replace our vehicle/driver/access constraint validation. Include only navigation locations in the link; keep order details, commercial information and access notes in the authenticated run sheet.

Acceptance: on a representative long run, every delivery/collection stop and the depot return remains reachable in the correct order, including section boundaries. Verify next-stop navigation and revised-run handover on the actual driver devices. No route is sent to a driver or published by this requirements update.

## Milestone 0A audit handover

Prepared `scripts/audit-viewplan-fulfilment-schema.ps1`. Run from the server Scripts directory in 32-bit Windows PowerShell with ViewPlan open and authenticated:

```powershell
.\audit-viewplan-fulfilment-schema.ps1
```

Return `fulfilment-schema-audit.json`. It contains candidate table fields/indexes/relationships and saved-query names/types, without operational rows, SQL, connection strings or source mutations. Limits abort instead of silently truncating; metadata failures are explicit and make `complete` false. PowerShell parser validation and `git diff --check` passed locally. Actual Access/DAO execution remains to be verified on the ViewPlan server. This audit is separate from the nightly connector; do not add it to scheduled tasks.

Next, use the returned metadata to prepare a bounded representative-week projection with confirmed table/field names. Do not choose order/line keys, cancellation semantics or allocation mappings solely from schema names.


## Confirmed allocation and dispatch boundary — 15 September 2026

Toby confirms that ViewPlan owns order allocation, prints the orders and remains responsible for ensuring orders are allocated before dispatch. Warehouse continues barcode allocation in ViewPlan. Brewery Ops owns route planning, vehicle assignment, driving-time and load/capacity calculations, including deliveries and collections.

This decision supersedes the proposed initial Brewery Ops picking/loading execution scope above. Do not build a second allocation workflow, pick-completion ledger or replacement order-printing process for this pilot. Brewery Ops may present a route/load summary and read available allocation status as source context, but its plan readiness means planning constraints are satisfied, not that allocation or dispatch release has been approved. ViewPlan retains the pre-dispatch allocation check. Preserve explicit customer dispatch restrictions separately from the order's source dispatched/fully-allocated status.

Order amendments still require revised route weights, timing and visible plan changes. Once warehouse work has begun, flag the change for reconciliation in the existing ViewPlan/Warehouse workflow; Brewery Ops must not automatically unpick, reallocate or mark an order ready for dispatch. Read-only barcode assignment evidence may help identify source lineage, but importing every container assignment is not a prerequisite for route planning when audited order quantities and verified package weights suffice. Unknown quantities/weights remain unvalidated.

Revised milestone 2 is route/driver handover (including Google Maps) and change communication to the existing ViewPlan/Warehouse process. Local delivery/collection actuals and any VP hand-back queue need their own agreed responsibilities; they do not replace VP allocation or its order documents. Booking/tracking pallet-network shipments remains future scope. Earlier references to Brewery Ops-issued picks/load actuals are deferred, not current implementation requirements.

## Schema evidence received — 15 September 2026

Reviewed the supplied `fulfilment-schema-audit.json`: 40 candidate tables, 127 query names, three index-metadata issues. The issues concern `tblVP_Custom1_Order_Data`, `tblVP_Shopify_Order_Data` and `tblVP_SquareSpace_Order_Data`; they do not prevent focused inspection of the core `tblOrder` / `tblOrder_Items` tables. The discovery report remains incomplete overall; do not relabel it fully successful.

Verified schema candidates:

- `tblOrder.order_id` is the primary key; `order_no_val` has a unique index. Use the source primary key as the identity candidate, not a formatted display number.
- `tblOrder_Items.order_item_id` is the line primary key; sub-items have their own primary key. Quantity versus pkg_quantity and mixed-package semantics still require source evidence.
- Order and line cancellation/deletion flags exist. `updated_date` and `lud` exist on the order; the audited line schema has no equivalent change marker. Do not assume an order timestamp advances on every line edit. A full/reconciliation strategy remains necessary unless change behavior is demonstrated.
- Orders expose delivery_date, planned_dispatch_date, dispatched_date, delivery_vehicle_id and order_gross_weight_kg. Field presence does not prove the scheduling date or whether stored weights remain current after amendments.
- Packages expose packaging_weight_full_kg; vehicles expose vehicle_max_load_kg. No empty-tare or space profile is established by this audit.
- Configuration exposes set_delivered_on_dispatch and allow_dispatch_with_incomplete_allocation. Inspect these explicitly before interpreting delivered/dispatched as physical events; user-confirmed VP allocation ownership remains unchanged.
- Customer delivery_address is separate from its ordinary address fields. The delivery-schedule query definition should establish current address/date/territory behavior, including Pallet routing, rather than guessing precedence.

Prepared `scripts/audit-viewplan-fulfilment-detail.ps1` with every selected field checked against the supplied schema. It reads a bounded three-week date/change window, source statuses (including cancelled/deleted), lines/sub-lines, relevant customer delivery addresses, package weights, vehicles and narrowly selected configuration flags. It reads five SELECT query definitions without executing them. It does not export mailbox, payment or credential configuration fields.

```powershell
.\audit-viewplan-fulfilment-detail.ps1
```

Return `fulfilment-detail-audit.json`. Optional `-WeekStart 2026-09-14 -Weeks 1` selects a narrower representative week. Row-limit breaches abort before report writing; required read failures abort. Query-definition failures remain explicit. The export is sequential read-only discovery, not a consistent production snapshot or complete overdue/undated-order feed. PowerShell parser and diff checks passed locally; Access execution and actual date/quantity/weight semantics remain to be verified on the server.

## Detail audit review — 15 September 2026

The supplied detail audit completed all reads and definition reads without issues: 96 orders, 268 lines, no sub-lines, 65 customers, 64 package definitions and 10 vehicle entries. Window is 14 September to 5 October exclusive, selected by any relevant date/change field; some delivery dates therefore fall outside it. This is a sample, not complete open-order coverage.

Confirmed source behavior and mapping decisions:

- Default configuration has `set_delivered_on_dispatch=true` and `allow_dispatch_with_incomplete_allocation=false`. All 20 source-dispatched orders are also source-delivered. Preserve both observations; neither proves physical departure/delivery. Do not remove orders from the route board merely because these flags are set. VP remains allocation and dispatch assurance authority.
- All 96 `order_gross_weight_kg` values are null. The VP weight report calculates `quantity * packaging_weight_full_kg`, using ingredient `item_weight_kg` for miscellaneous items. Its report filters are historical/source-specific and are not the planning feed filter. Use source package weight candidates for ordinary lines; missing/miscellaneous weights remain explicit exceptions. `quantity` equals `pkg_quantity` in this sample, which does not prove equivalence for other/mixed packaging.
- Source vehicle IDs: 1 VAN 1 (1,400 kg), 2 VAN 2 (1,450 kg), 4 VAN 3 (1,450 kg). Toby accepted using ViewPlan data in the clarification; these replace the earlier approximate 1,200 kg planning input. Record provenance and allow operational review; active fleet flags do not establish daily van/driver availability.
- Vehicle IDs 3 Pallet, 5 Courier and 6 COLLECT are transport/service categories, not zero-capacity vans. Preserve exact IDs in the adapter and reconcile fulfilment method with Account territory. No VAN 3 orders occur in this sample. Confirm COLLECT operational meaning before treating it as a delivery or collection job.
- `qryDeliverySchedule` uses customer `delivery_address` when nonblank (two sample customers), otherwise its ordinary address; postcode is obtained by a VP function for the override. Snapshot the effective delivery address. Account postcode coordinates must not silently route an overridden address.
- 94 order headers have type 1; the remaining two have types 4 and 5. Import observations without assuming these are ordinary deliveries. Explicit classification is required.
- 27 orders are pre-orders. The existing VP delivery query excludes these, delivered flags and schedule-excluded rows. Do not copy it as the complete planning source; keep relevant future/pre-orders visible with source status and explicit eligibility rather than claiming commitment or cancelling absent rows.
- Miscellaneous ID 349 appears twice as Collect Empties. Quantity 1 is an instruction line, not evidence of one empty container. IDs 350 (Bright Cask Surcharge), 397 (Cask Deposit) and manual ID -999 also occur. Keep these as classification exceptions until exact service/financial semantics are confirmed; do not turn charges into cargo or silently omit unknown physical loads.

Added `scripts/review-fulfilment-audit.mjs` for offline deterministic review and `scripts/fulfilment-audit.test.mjs`. Four tests pass: no inferred physical completion, unknown/misc weights, cancelled lines, and incomplete/duplicate/orphan input rejection. The sample reports 43 orders requiring weight/classification review (including orders with no active lines); that count does not mean 43 physical shipments lack beer weights. The output is a diagnostic projection only, not a canonical operational import or validated route.

Next implementation boundary: build an independent stable-ID, revisioned read-only order feed, with full line reconciliation and explicit source coverage. Preserve local plans when source date/quantity changes. Include tracked IDs outside the rolling window so moved or cancelled work is reconciled; absence alone cannot cancel it. Do not modify the replacement sales-history importer or attach local plans to its transient UUIDs. Remaining discovery concerns collection quantities/tare/space, miscellaneous classification, effective address geocoding, road-time access and daily driver/vehicle availability; these can remain visible exceptions while the feed and board are built.


### Configurable order polling and growing orders — confirmed 15 September 2026

The ViewPlan order connector must poll at a defined, configurable frequency rather than relying on the overnight catalogue refresh. Customers may start an order early and add lines or quantities later. Re-read both new and existing relevant orders and their complete lines; a new-order-only feed is insufficient. Poll every 30 minutes by default (confirmed by Toby, 15 September 2026), with the interval configurable. This scheduled cadence does not replace the mandatory on-demand source refresh immediately before route finalisation. Keep this polling separate from expensive full catalogue/price refreshes and prevent overlapping runs.

Use stable source order/line IDs and content revisions. An unchanged poll is a no-op. A changed order produces a new source revision while preserving local run assignments, pins and history. Recalculate cargo weight from the entire effective line set and current source weight inputs, not just the added line or a cached header total. Explicit cancellation/deletion and line removals require reconciliation; absence in a partial/windowed feed is never cancellation. Header change markers have not been proven to advance on every line edit, so use full relevant-order line reconciliation until an incremental strategy is validated. Include previously tracked orders outside the date horizon so date moves cannot strand stale work.

An increased or reduced order recalculates the affected run's leg loads, driving/service estimates and feasibility, and may suggest moving flexible work, changing sequence or using a second van. Keep the accepted plan separate from proposals. Provisional suggestions can refresh automatically while preserving pins; committed runs require operator acceptance. Changes after Warehouse starts allocation are flagged for reconciliation in ViewPlan, which retains allocation, order printing and pre-dispatch assurance. In-progress runs preserve completed stops and require driver acknowledgement of accepted changes to remaining work.

Show last successful poll, source revision, changed orders and a concise before/after quantity and weight delta. Failed refreshes retain the last good snapshot with a visible freshness warning; do not imply a zero-order day. A successfully polled incomplete weight remains unknown rather than falsely validated. A polled growing order is not automatically a final customer commitment; preserve explicit commitment information separately.

Acceptance: create an early order, assign it provisionally, add another package or increase quantity in VP, then poll. The same local order/assignment survives, the new full weight appears once, any capacity breach is explicit and a reviewable routing proposal is generated. Repeat unchanged with no duplicate events. Also verify reductions, removed lines, cancellation, date changes beyond the horizon, concurrent/failed polls and amendments to committed/in-progress runs.


### Final order and weight check before routing — confirmed 15 September 2026

Before finalising a route, require a successful on-demand ViewPlan refresh of every assigned order and its complete current line set, plus the package weight inputs used by the plan. Do not rely solely on the most recent scheduled poll. Reconcile additions, reductions, cancellations, deleted lines, delivery-date changes and source weights; recalculate every affected leg and the return to depot, including collection allowances, vehicle payload and driving-time constraints.

If the refresh changes the inputs, show the quantity/weight delta and updated routing proposal for review before finalisation. If the refresh fails, an assigned order cannot be reconciled, weights are unresolved or constraints fail, the route remains unfinalised with an explicit reason. Record the successful check time and the exact source/order, weight-profile and plan revisions checked. Finalisation must verify those revisions still match; a concurrent update invalidates the check and requires recalculation rather than committing a stale plan.

This check validates planning inputs and routing, not VP allocation or dispatch release. ViewPlan retains barcode allocation, printed orders and the pre-dispatch allocation assurance. Changes detected after finalisation reopen the affected planning validation and create an operator-reviewed change set; do not silently rewrite the issued driver route. No snapshot can guarantee the source will never change afterward, so retain ongoing polling and the change/acknowledgement workflow.

Acceptance: an order grows after the normal poll but before final routing. The final refresh detects it, recalculates weight and blocks the old route if infeasible. Also test failed final refresh, concurrent source/plan edits during review, cancellation and unchanged successful validation. Persist the checked revisions and timestamp for the issued route.

## Order feed and board implementation — 16 September 2026

Implemented on the working branch: independent source IDs and immutable content revisions, service-only atomic ingestion, preserved provisional assignments with optimistic concurrency and audit history, exact Account lookup, Pallet separation, customer dispatch warnings, visible unknown weights, source freshness and a three-week board. Added a separate orders runner with local overlap protection and tracked-order reconciliation. See [pilot installation and acceptance](./fulfilment-pilot-testing.md).

Automated build/tests pass; actual server polling, timed-task operation and authenticated board field acceptance remain open. This is milestone 1A/1B pilot work. Suggestions/road routing, collection jobs and capacity profiles, finalisation, driver navigation and mailbox integration are not implemented by this slice. The full weekly planning milestone remains incomplete until recommendations are delivered.


### Shared van-route map — confirmed 16 September 2026

Provide a map alongside the weekly/day board showing each van's route and drops. Use a distinct colour plus a labelled legend for each van/run, numbered stops in the agreed sequence, and the brewery departure/return. Filter by date and show/hide individual vans or compare the day's runs together. Distinguish delivery, collection-only and combined stops without relying on colour alone.

Selecting a stop opens its customer, delivery quantities, expected collections, timing/window, known weight and outstanding exceptions in the same planning context. Show unassigned orders as separate markers and a list; retain ungeocoded/ambiguous-address work in a visible exceptions list rather than dropping it from the plan. Pallet-network and other non-van work stays separately visible and is not drawn as a van route.

Route lines must use the accepted stop order and road-routing geometry once available. Before that integration, a map can show delivery locations but must not present straight connecting lines as validated road routes or derive driving time from them. Use the effective delivery address, including source overrides; existing Account postcode coordinates require an explicit match before reuse. Display provisional versus accepted revisions and distinguish suggested changes from the current plan.

Keep map selections and board assignments consistent. Moving a drop between vans/days or changing stop order uses the same revision, weight/time and commitment checks as the board. Expose per-run driving time, outbound/peak load and unresolved space/collection assumptions when those calculations are available. Google Maps driver handover uses the same issued stop sequence.

Acceptance: show a real two-van day, identify every drop and collection, compare each coloured/numbered run with the ordered stop list, inspect an order, and verify an accepted reassignment updates both views. Missing coordinates, unassigned work and stale source data remain visible. This is part of the routing milestone; the existing provisional board does not yet calculate or display routes.


### Manual stop planning and Google Maps previews — 16 September 2026

Ops can drag individual orders within or between the selected day's vans, with up/down buttons and a van selector for touch/keyboard use. Save the provisional sequence to share it across users; saves validate source and plan revisions atomically, preserve audit history, and never update ViewPlan. Changing date/van through the older board clears the old sequence position so the order appends to its new run. The map remains a location map with reference numbers; the separate ordered list defines the Google Maps preview sequence.

Known outbound payload totals update immediately. Unknown weight/returns, changed or stale observations, failed refresh, unavailable vehicles, explicit dispatch blocks and excess payload remain visible; unresolved weight, changed/stale data, failed refresh, unavailable vehicles, explicit blocks, excess payload or unsaved edits prevent Maps previews. Links contain addresses only and split into continuous sections with at most three intermediate waypoints and 2,048 characters, preserving brewery departure/return. These are provisional planning previews, not issued driver runs or finalisation. No external routing account is needed for these links.

Next: suggested routing using verified locations, receiving/delivery windows (distinct from opening hours), road times, service allowances, daily resources, collections and the four-hour driving constraint. Missing receiving hours remain unknown. Final route approval still requires the agreed on-demand ViewPlan revalidation and revision checks; this slice does not implement finalisation or dispatch clearance.
