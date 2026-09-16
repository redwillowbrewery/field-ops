# Brewery Ops — Weekly fulfilment planning

Working brief · 15 September 2026 · Draft for implementation scoping

Repository follow-up: [gap analysis and small implementation milestones](./weekly-fulfilment-implementation-review.md). Main reviewed at `dfc9862`; discovery remains open.

## Codex entry point — revised priority

Toby agreed this priority change on 15 September 2026: retain successful CRM/client/price-list workflows and VP order capture; bring forward weekly fulfilment planning, empties collections, route suggestions and picking using read-only VP orders.

The existing AGENTS.md, architecture.md, backlog.md and sprints.md still specify Product → Production → Inventory before Logistics. This brief records the user's revised sequencing decision; it does not claim those documents have already been reconciled or operational authority has migrated. Preserve canonical adapters, exact mappings, source freshness and read-only VP boundaries. Respect existing account ordering/dispatch blocks; planning must not imply permission to dispatch.

Start by reading repository instructions and current sprint/branch status, including work on feature/product-foundation. Inspect reusable order/history, package, account, map and returnables code before proposing new models. Produce a repository-backed gap analysis and small implementation milestones, then reconcile the affected roadmap/ownership documentation with this revised direction. Do not discard existing branch work or equate this brief with production rollout approval. Verify operational input data and hand-back responsibilities before live execution.

## Outcome and direction

Give the team one rolling view of orders, deliveries and empties collections, with suggested runs that remain workable as the week changes. Generate warehouse work and driver instructions from the agreed plan.

CRM, client view and decorative price lists already deliver value. Retain VP order capture and import its orders. Prioritise fulfilment over further expansion of product/production modelling. This brief proposes the next delivery sequence; it does not assert that existing sprint documents or code have been changed.

## Agreed boundaries

- VP remains the order source; integration is read-only. Brewery Ops owns route/load planning and planning exceptions. ViewPlan owns allocation, printed orders and the pre-dispatch allocation check.
- Weekly planning must suggest useful routes, not merely display orders on a map. Manual changes remain possible and trigger the same checks as generated suggestions.
- Plan deliveries and empties together, including collection-only stops.
- Track capacity throughout a run, including return to depot.
- Monitor incoming order correspondence for unresolved work. The initial scope reads messages and produces internal tasks; it does not send replies or create VP orders automatically.
- Keep product work to the identities, packaging, weights and relevant availability/traceability data needed for this workflow. Broader formulation and recipe work is deferred.

## Main working views

| View | Contents and actions |
| --- | --- |
| Week board | Runs by day and vehicle; unassigned work; suggested placement; weight, space and time headroom; unscheduled or overdue collections. Navigate future weeks; proposed initial horizon is current week plus next two. |
| Map and recommendations | Selected runs, stops and collection opportunities; proposed changes with reasons and before/after distance, time and capacity. |
| Run detail | Vehicle, driver, stop order, arrival estimates/windows, delivery and collection tasks, load after each stop, commitments and exceptions. |
| Warehouse | Consolidated picks per run/product/package, customer breakdown, shortages, picked/loaded quantities and revision changes. |
| Driver handover | Ordered stops, contact/access notes, delivery quantities, expected collections and completion/exception recording. |
| Inbox exceptions | Possible orders awaiting reply, acknowledged orders absent from VP, amendments/cancellations and uncertain matches; owner, age and source thread. |

## Weekly suggestions and dynamic changes

Start from dated delivery runs and existing service patterns. A regular area/day is a planning preference unless explicitly recorded as a customer commitment. Distinguish requested dates, allowed date ranges and agreed delivery windows.

The planner should propose both assignment to a day/vehicle and stop sequence. Use road travel times, service time for deliveries and collections, depot departure/return, driver availability, vehicle availability and access restrictions. Include reload/depot-return legs explicitly when proposed. Do not call a straight-line geographic grouping an optimised road route.

First satisfy hard constraints: committed windows, available vehicles, verified capacity and pinned work. Then reduce travel and unnecessary runs while serving due work and minimising disruption to the agreed plan. Collection urgency and recoverable containers can influence preferences. Weighting and priorities require calibration with actual weeks; no promise of a mathematically optimal result.

Each recommendation must explain its effect: for example, moving a flexible delivery to an existing nearby run, adding a collection with a small detour, or splitting an infeasible run. Show estimated changes in travel, finish time, peak weight, peak space and affected commitments. Explicitly list work that cannot be assigned and the reason.

| Plan state | Response to new information |
| --- | --- |
| Provisional | Recalculate suggestions automatically. Preserve manual pins. Keep the displayed accepted plan distinct from proposed changes. |
| Committed | Present a change set for an operator to accept; do not silently move promised days or stops. |
| Picking/loading | Freeze the issued revision. Changed orders create a delta and an exception requiring warehouse reconciliation. |
| In progress | Keep completed stops fixed. Suggest changes only to remaining work; driver must receive and acknowledge a revised run. |
| Completed | Retain actuals and history. Corrections are recorded rather than rewriting the original execution record. |

Recalculate affected runs and nearby alternatives after order amendments/cancellations, collection updates, vehicle substitution, shortages or actual collection quantities. Avoid unnecessary reshuffling of the whole week. Show source freshness; a failed sync must not be interpreted as cancellation or a zero-order day.

## Empties collections

Model a collection as its own job, optionally paired with a delivery at the same stop. Record account, address, container type/owner, estimated quantity, confirmed quantity where known, ready-from date, due/priority, handling time and access notes. Preserve who supplied the estimate and when.

Do not infer that all containers historically delivered are ready to collect. Show estimated, confirmed, collected and outstanding quantities separately. Allow unknown counts with a visible planning allowance; unresolved uncertainty prevents a run being represented as fully validated.

Support collection-only runs, partial collections, no empties ready and full/part-full returns. Full or part-full returns need their own weight assumptions and reason, not empty-container weights. Record remaining collection work without duplicating the completed quantity. Container scans can be added where identifiers are available; aggregate counts by type are sufficient for the first slice. This does not establish a financial container balance or deposit ledger.

## Vehicle capacity and load along the route

Store each vehicle's verified operational cargo allowance, the basis/date of that allowance, cargo-space limits, compatible container/pallet arrangements, equipment and availability. The cargo allowance must already account for the chosen operating setup, occupants, fuel and equipment; avoid subtracting them twice. Actual fleet values remain to be supplied and checked.

Product/package reference data needs full gross unit weight, empty tare weight, space/footprint or loading slots and stacking rules. Pallets and additional handling equipment must be included once. Use verified values where possible; label estimates and configurable uncertainty allowances. Unknown weights must not silently become zero.

For each leg:

`next cargo weight = current cargo weight − weight actually delivered + empties/returns collected`

Run checks at departure, before and after stop actions, on every subsequent leg and at depot return. Check the actual unload/collect order if it changes temporary capacity. A failed delivery leaves goods on the vehicle. An unexpectedly large collection can breach a later limit even where the departure load was acceptable.

Weight and space are independent constraints. Empty containers can consume substantial space even when they add little weight. Track both, using conservative loading assumptions initially. A simple space total is an estimate, not proof that the physical arrangement fits. Axle/load-distribution checks require a suitable vehicle/loading model; until supported, flag them as a separate loading validation requirement rather than implying gross-weight checks cover them.

Illustrative software test only: cargo allowance 1,000 kg; departure cargo 900 kg; deliver 300 kg and collect 80 kg gives 680 kg; a later collection of 350 kg gives 1,030 kg and must be rejected or replanned. These are invented test values, not RedWillow fleet specifications.

Over-capacity plans may be saved as unresolved drafts but cannot be marked ready. Missing capacity data similarly produces an explicit unvalidated status. Suggestions include a different sequence, later collection, another vehicle or an explicit depot return; none should conceal unserved work.

## Order import and warehouse integrity

Import stable VP order/line identifiers, customer/address, requested/agreed dates where available, quantities, units/packages, notes and source status. Verify actual VP fields and status semantics before implementation. Preserve source IDs and imported snapshots; never guess cancellation from absence in a partial feed.

Re-import must be repeatable without duplicate orders or overwriting local planning fields. Record source change time where available, import time and a content revision. Separate source order status from planning, picking and delivery status.

Compare each source revision with the revision used to issue warehouse work. Cancellations after picking require unpick/unload actions. Quantity increases require additional picks and fresh capacity checks. Shortages remain unresolved until someone decides the next action. Prevent the same quantity being assigned or picked twice. Initial scope can keep orders on one run; if splits are required, explicit quantity allocations and residual balances are mandatory.

Where stock/batch data is unavailable or stale, show the limitation. A pick list alone is not a stock reservation. Agree where stock allocation, batch traceability, dispatch confirmation, invoicing and duty-related records remain in the existing workflow before live use. Operational completion here must not imply a VP update. Provide a clear hand-back queue for VP actions still required.

## Inbox monitoring

Discover the actual mail platform, shared mailbox/folders, sent-reply visibility and existing VP order references. No mailbox has been inspected for this brief.

Ingest message/thread IDs, receipt time, sender, subject, relevant content/attachments and sent replies. Match against customer/contact records and imported orders using evidence such as explicit order references, account, dates and order lines. Preserve confidence and the evidence for a proposed match. An uncertain match stays reviewable.

Create separate exception types for no visible response, acknowledged but no matching VP order, and possible amendment/cancellation awaiting handling. Internal forwards and automatic acknowledgements must not count as a substantive customer response. An order entered after a phone call may legitimately have no email reply; provide “handled elsewhere” with a note. Reopen resolved work for a new relevant customer message.

Show elapsed time using configurable business hours and response targets. Deduplicate tasks per underlying issue; allow assignment, snooze and resolution history. Inbox detections do not directly change delivery quantities or commitments: only a confirmed source update or explicit operator decision can do so. Use mailbox permissions and avoid unnecessarily retaining unrelated correspondence.

## Minimal underlying records

| Record | Purpose |
| --- | --- |
| Imported order and revisions | VP identity, order lines, source state and changes. |
| Delivery/collection job | Address, windows, quantities, handling needs and fulfilment progress. |
| Service pattern | Preferred areas/days and cut-offs; distinct from customer commitments. |
| Vehicle and capacity profile | Verified allowance, space/handling constraints and availability. |
| Package logistics profile | Full/empty weights, dimensions or slots, stacking and confidence. |
| Dated run and versioned stops | Vehicle/driver, accepted plan, proposed changes and leg loads. |
| Pick/load task and actuals | Issued order revision, quantities, shortages and reconciliation. |
| Correspondence exception | Thread, proposed order link, reason, owner and resolution. |

## Proposed delivery sequence

| Milestone | Deliverable | Exit evidence |
| --- | --- | --- |
| 0 — Verify inputs | Inspect VP order/change access, mailbox access, fleet/package data and a representative operating week. Establish manual VP hand-back steps. | Field mappings and missing-data decisions documented; representative imports demonstrated. |
| 1 — Weekly planning pilot | Read-only order import, collection jobs, dated runs, manual planning plus feasible assignment/sequence suggestions, per-leg capacity and revision exceptions. | Team can plan a real week and compare suggestions against their existing plan. Recommendations are part of this milestone. |
| 2 — Warehouse and driver handover | Versioned picks, shortages, load checks, run sheets, delivery/collection actuals and VP hand-back queue. | A pilot run completes and a changed/failed delivery is reconciled end to end. |
| 3 — Inbox exception pilot | Read-only monitoring, order matching and follow-up ownership. Can proceed alongside milestone 1 after mailbox discovery. | Team checks flagged and missed cases against a reviewed sample; duplicate and resolved threads behave correctly. |
| 4 — Improve suggestions | Refine travel/service estimates, preferences, collection priorities and replanning stability using observed weeks. | Measured operational improvement without excessive changes or missed commitments. |

Do not assign these to existing sprint numbers or estimate delivery dates until the current implementation and input access have been inspected.

## Acceptance scenarios

1. Repeat an unchanged import: no duplicates; local run assignment survives.
2. Add a flexible order: suggest a feasible existing run with a clear reason; preserve fixed commitments.
3. Amend/cancel an order after picks are issued: show exact deltas; block ready status until reconciled.
4. Insert a collection-only stop: reserve handling time, weight and space through depot return.
5. Take more empties than expected: re-evaluate remaining legs and show unresolved work if infeasible.
6. Fail a delivery: goods remain onboard; downstream collection capacity is recalculated.
7. Substitute a lower-capacity vehicle: invalidate readiness when constraints no longer hold.
8. Omit product weight or collection count: display uncertainty, never a misleading green capacity result.
9. Receive an order, an automatic acknowledgement, then a genuine reply: response classification changes correctly; VP matching remains a separate check.
10. Receive a cancellation by email: create an exception without silently deleting planned work.
11. Lose source access: retain the last known plan with a freshness warning; do not infer cancellations.
12. Complete part of a run: replanning preserves completed stops and actual quantities.

## Discovery inputs and pilot measures

Next implementation work should collect one representative week of VP orders and changes, current run sheets/pick lists, regular delivery areas/days, vehicle operational allowances and cargo layouts, package full/empty weights, empties-request practice, mailbox/sent-folder access and the present dispatch completion process. These are discovery tasks, not reasons to defer the working design.

Baseline and compare weekly planning time, warehouse rework, distance/time per run, missed windows, overdue collections, unassigned work and order-response exceptions. Review recommendation acceptance and causes of rejection. Sample inbox false positives and missed orders against human review. No saving or optimisation percentage is assumed in advance.

## Discovery clarification — 15 September 2026

Toby confirms sales@redwillowbrewery.com is the main mailbox; platform and sent-reply access are still to be established. Sales staff move delivery days according to weights and the normal weekly delivery plan, which is fed by weekly Sales planning activity. Reuse that planning context; it is not itself a dated run or a customer commitment.

ViewPlan dispatch status is set once the order is fully allocated. Do not interpret that status as physical departure or delivery completion. Audit its exact field and transition semantics before mapping it. The owners and steps for actual delivery completion, stock/batch records, invoicing and duty hand-back still need verification.

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


## Confirmed allocation and dispatch boundary — 15 September 2026

Toby confirms that ViewPlan owns order allocation, prints the orders and remains responsible for ensuring orders are allocated before dispatch. Warehouse continues barcode allocation in ViewPlan. Brewery Ops owns route planning, vehicle assignment, driving-time and load/capacity calculations, including deliveries and collections.

This decision supersedes the proposed initial Brewery Ops picking/loading execution scope above. Do not build a second allocation workflow, pick-completion ledger or replacement order-printing process for this pilot. Brewery Ops may present a route/load summary and read available allocation status as source context, but its plan readiness means planning constraints are satisfied, not that allocation or dispatch release has been approved. ViewPlan retains the pre-dispatch allocation check. Preserve explicit customer dispatch restrictions separately from the order's source dispatched/fully-allocated status.

Order amendments still require revised route weights, timing and visible plan changes. Once warehouse work has begun, flag the change for reconciliation in the existing ViewPlan/Warehouse workflow; Brewery Ops must not automatically unpick, reallocate or mark an order ready for dispatch. Read-only barcode assignment evidence may help identify source lineage, but importing every container assignment is not a prerequisite for route planning when audited order quantities and verified package weights suffice. Unknown quantities/weights remain unvalidated.

Revised milestone 2 is route/driver handover (including Google Maps) and change communication to the existing ViewPlan/Warehouse process. Local delivery/collection actuals and any VP hand-back queue need their own agreed responsibilities; they do not replace VP allocation or its order documents. Booking/tracking pallet-network shipments remains future scope. Earlier references to Brewery Ops-issued picks/load actuals are deferred, not current implementation requirements.

### Detail-audit planning inputs — 15 September 2026

The detail audit confirms VP auto-sets delivered on dispatch, so neither flag is physical-delivery proof. Stored order weights are blank; derive ordinary cargo estimates from audited line quantities and package gross weights, and expose miscellaneous/unknown-weight exceptions. Retain future pre-orders rather than copying VP delivery-screen exclusions.

Use the accepted ViewPlan payload data: VAN 1 1,400 kg; VAN 2 and VAN 3 1,450 kg. This supersedes the earlier approximate 1,200 kg input. Daily vehicle/driver availability remains separate. Pallet/Courier/COLLECT source vehicle entries are service classifications requiring explicit mapping, not additional vans. See the implementation review for exact source IDs and unresolved classification questions.


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


### Shared van-route map — confirmed 16 September 2026

Provide a map alongside the weekly/day board showing each van's route and drops. Use a distinct colour plus a labelled legend for each van/run, numbered stops in the agreed sequence, and the brewery departure/return. Filter by date and show/hide individual vans or compare the day's runs together. Distinguish delivery, collection-only and combined stops without relying on colour alone.

Selecting a stop opens its customer, delivery quantities, expected collections, timing/window, known weight and outstanding exceptions in the same planning context. Show unassigned orders as separate markers and a list; retain ungeocoded/ambiguous-address work in a visible exceptions list rather than dropping it from the plan. Pallet-network and other non-van work stays separately visible and is not drawn as a van route.

Route lines must use the accepted stop order and road-routing geometry once available. Before that integration, a map can show delivery locations but must not present straight connecting lines as validated road routes or derive driving time from them. Use the effective delivery address, including source overrides; existing Account postcode coordinates require an explicit match before reuse. Display provisional versus accepted revisions and distinguish suggested changes from the current plan.

Keep map selections and board assignments consistent. Moving a drop between vans/days or changing stop order uses the same revision, weight/time and commitment checks as the board. Expose per-run driving time, outbound/peak load and unresolved space/collection assumptions when those calculations are available. Google Maps driver handover uses the same issued stop sequence.

Acceptance: show a real two-van day, identify every drop and collection, compare each coloured/numbered run with the ordered stop list, inspect an order, and verify an accepted reassignment updates both views. Missing coordinates, unassigned work and stale source data remain visible. This is part of the routing milestone; the existing provisional board does not yet calculate or display routes.

### Brewery depot — confirmed 16 September 2026

Departure and return: The Lodge, Sutton Mill, Byrons Lane, Macclesfield, SK11 7JW. The initial daily location map uses the existing postcode geocoding approach: SK11 7JW resolves via Postcodes.io to 53.249509, -2.118894 (checked 16 September). This is labelled as a postcode-centre estimate, not a verified brewery entrance. Confirm the actual entrance before road routing. Routing-service account/provider remains unconfirmed.

### Daily location map pilot — 16 September 2026

The pilot now has a selected-day map with van colours/filtering, grouped customer locations, delivery/collection labels and links to order details. It reuses Account coordinates only where source address fields match; delivery overrides, additional address lines or missing coordinates remain explicit exceptions. Pallet/Courier/COLLECT and undated work remain listed outside van pins. Numbers are map references, not an agreed stop sequence. Road geometry, optimisation and driving estimates remain outstanding; this does not complete the requested route-map milestone.
