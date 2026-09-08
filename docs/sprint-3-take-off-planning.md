# Sprint 3 proposal — Shared Take Off Planning

Scoped 8 September 2026. CURRENT implementation sprint; local workflow implemented, migration applied, server sync and app rollout pending. Sprint 2C is deployed and user-accepted apart from deferred prospect testing. This is a useful workflow across Product and Planning while ViewPlan retains operational authority, rather than a prerequisite full Product module build.

## Business outcome and reference

Sales and Production share a clear view of beer in tank and upcoming brews, enter packaging requirements, agree the take-off split and understand estimated remaining volume without maintaining the spreadsheet in parallel.

Reference: Take Off & Schedule.xlsx, **Take Off Planning** tab only. The user confirmed that Brew & Packaging Schedule is superseded and must not drive requirements. The workbook is a workflow reference, not authoritative live production data or an import seed.

ViewPlan supplies current tank contents and its existing brew plan. Brewery Ops owns packaging requests and their review workflow. No re-entry of the brew plan, ViewPlan writes, or transfer of operational production/stock authority.

## First-release scope

1. Shared Take Off view: in-tank and upcoming rows, selectable forward horizon, beer, gyle where assigned, vessel, planned/actual brew date, source volume and status where available. Distinguish planned values from actual observations; do not infer tank occupancy from a date. Desktop matrix for package quantities with a usable compact phone detail/edit view.
2. Read-only ViewPlan adapter: exact source mappings into stable canonical identities, source timestamps and sync health. Source updates must not overwrite local requests or decisions.
3. Sales packaging requirements: add/edit/withdraw a quantity against a planned brew or actual batch, canonical Package, explicit unit, required-by date and optional Account/notes. No Order is required. Show aggregate demand with individual requests and authors available for review.
4. Production review: confirm or adjust a proposed packaging split, record response/constraints and make unmet demand visible. Requested, agreed and actually packaged quantities are distinct. The agreed split is a coordination record, not a second authoritative execution schedule or stock reservation.
5. Volume summary: display package-output litres and estimated beer required including an explicit loss allowance, with estimated remaining volume or over-request warning. Calculate requested and agreed scenarios separately; never add them together. Unknown source volumes or package conversions stay unknown.
6. Changes and collaboration: preserve authorship and history, prevent silent concurrent overwrite, and show affected requests when source dates/volumes/status change. Pending or invalidated requests remain visible for review.

## Canonical boundaries

Reuse Product (Beer identity), Package and Product Variant mappings. A planned brew is distinct from an actual Batch/Gyle; future plans may have no gyle yet. Preserve their relationship through explicit source lineage, not beer-name/date matching. A vessel association may change and must not be an identity key.

ViewPlan owns plan dates, tank contents, actual batch state and production/stock facts. Sales owns requirements; Production owns their review and agreed take-off proposal in Brewery Ops. Permissions govern editing and approval; Sales and Production workspaces are views over the same records. Do not depend on a full workspace-settings redesign.

Actual packaged output, if available, is a separate imported fact. Clarify whether source tank volume is original brew length or current remaining volume before subtracting packaging demand; avoid deducting completed packaging twice. Future operational authority still follows Product → Production → Inventory before Order Capture or Logistics.

## 3.0 — Source and calculation audit (first implementation task)

Prepare a read-only audit script to run on the ViewPlan server, using the established connector/session pattern. ViewPlan is not installed on the dev box. Return bounded schema/query metadata and representative planning/tank records; no source writes or test production records.

Establish before choosing mappings:

- Tables/queries behind ViewPlan brew planning and current tank contents; primary keys, joins and filters. Do not assume the workbook's gyle numbers are unique source keys.
- Identity of a planned brew before gyle assignment, and explicit lineage when brewed. Check rescheduling, cancellation, deletion, split/combined brews and vessel transfers. If lineage is unavailable, specify an auditable manual association rather than fuzzy auto-linking.
- Beer/product mappings, dates/status meaning, volume units and original versus current volume; availability of actual packaging/take-off records. Confirm how completed batches leave the active view.
- Refresh behaviour: source change markers, deletions, full versus incremental reads and feasible cadence. Choose cadence and stale threshold with users after audit; do not blindly reuse overnight customer timing for a working planning screen.
- Exact package units, especially can cases versus individual cans and legacy names such as FB PIN; map to canonical packages explicitly.
- The workbook's 1.06 factor is provisionally a loss allowance (user recollection, especially cans), not an approved universal rule. Confirm applicable formats and whether the intended rule is output × 1.06 or output ÷ (1 − loss rate). Confirm any other conversion differences before coding.
- Which packaging figures already exist in ViewPlan and which are only local planning decisions, to avoid duplicate ownership or double-counting.

Produce a field mapping, representative source-to-screen examples, proposed sync contract, unresolved exceptions and confirmed calculation examples. These are prerequisites to schema/connector implementation, not reasons to postpone the scope document.

## Delivery sequence

- **3.0 Audit:** source identity, transitions, units, losses and refresh contract.
- **3.1 Shared read view:** canonical projection, connector, freshness and in-tank/upcoming Take Off screen.
- **3.2 Requests and review:** Sales quantities/dates, Production decisions, permissions, history and concurrency handling.
- **3.3 Calculations and field pass:** volume summaries, exceptions and side-by-side reconciliation with Production and Sales.

Deliver one end-to-end workflow; intermediate milestones do not constitute sprint acceptance.

## Acceptance

- Production verifies representative in-tank and future rows against ViewPlan. A future brew without a gyle is still usable.
- Sales requests specific packaging for each; Production sees totals and responds in the same context. Repeated beer names do not mix different brews.
- A ViewPlan reschedule and planned-to-actual transition preserve the correct requests and history. Cancelled/removed entries are flagged, not silently reassigned or deleted.
- Quantity/date changes update demand and volume summaries without double-counting, with verified package units and agreed loss assumptions. Missing data never appears as zero or a promise of stock.
- Failed/partial refresh retains last-known information with stale/error indication; local requests survive sync retries. Empty source results require validated semantics before retiring prior rows.
- Simultaneous edits do not silently lose another user's work; unauthorised users cannot alter plans/reviews through direct API calls.
- Both teams can use the desktop view and phone workflow for real planning, without duplicate spreadsheet entry. Existing Sales/price-list workflows continue to work.

## Outside this sprint

Recipe design/water treatment; full beer authoring and launch checklist; materials stock/BOM/purchasing automation (P7.1b); operational packaging execution; stock ledger; automatic allocation; customer orders; Logistics; ViewPlan writes. Retain these as follow-on work, not prerequisites to this slice. The accepted take-off quantities will provide the foundation for later packaging-material demand.

## Decisions still needed after audit

Agree planning horizon, refresh cadence, package/loss rules, who can approve the split, and how changes after Production agreement are reviewed. Use evidence from the source and a short Sales/Production walkthrough rather than inventing these rules.

See [implementation and rollout](./sprint-3-implementation-review.md). Confirmed: tank 1 is staging; Head Brewer approval belongs to toby@redwillowbrewery.com. Source lineage is available for some tasks; exact manual association covers missing lineage.
