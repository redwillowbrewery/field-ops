# Brewery Ops — Weekly fulfilment planning

Working brief · 15 September 2026 · Draft for implementation scoping

## Codex entry point — revised priority

Toby agreed this priority change on 15 September 2026: retain successful CRM/client/price-list workflows and VP order capture; bring forward weekly fulfilment planning, empties collections, route suggestions and picking using read-only VP orders.

The existing AGENTS.md, architecture.md, backlog.md and sprints.md still specify Product → Production → Inventory before Logistics. This brief records the user's revised sequencing decision; it does not claim those documents have already been reconciled or operational authority has migrated. Preserve canonical adapters, exact mappings, source freshness and read-only VP boundaries. Respect existing account ordering/dispatch blocks; planning must not imply permission to dispatch.

Start by reading repository instructions and current sprint/branch status, including work on feature/product-foundation. Inspect reusable order/history, package, account, map and returnables code before proposing new models. Produce a repository-backed gap analysis and small implementation milestones, then reconcile the affected roadmap/ownership documentation with this revised direction. Do not discard existing branch work or equate this brief with production rollout approval. Verify operational input data and hand-back responsibilities before live execution.

## Outcome and direction

Give the team one rolling view of orders, deliveries and empties collections, with suggested runs that remain workable as the week changes. Generate warehouse work and driver instructions from the agreed plan.

CRM, client view and decorative price lists already deliver value. Retain VP order capture and import its orders. Prioritise fulfilment over further expansion of product/production modelling. This brief proposes the next delivery sequence; it does not assert that existing sprint documents or code have been changed.

## Agreed boundaries

- VP remains the order source; integration is read-only. Brewery Ops owns planning, picking progress and operational exceptions.
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
