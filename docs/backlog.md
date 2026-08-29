# Brewery Ops Backlog

This backlog is ordered around the architecture in [`docs/architecture.md`](./architecture.md). Prioritise work that strengthens the canonical Brewery Ops model and reduces direct coupling to ViewPlan/Sellar.

## Priority 0 — architectural correctness

### P0.1 Audit ViewPlan package semantics

Goal: establish the authoritative ViewPlan source for package/container behaviour.

- Audit `tblPackaging_Type_List` for Firkin, Pin, E-Cask, E-Keg, 30L Steel, 50L Keg, cans, Key Keg and other active package types.
- Identify the field(s) that mean returnable / tracked / one-way.
- Document evidence; do not infer from Sellar names.
- Remove the temporary Sellar-container-type check from Quick Email once canonical package semantics exist.

Acceptance:
- We can explain from ViewPlan data why a package is returnable/one-way.
- CaskBranded/Firkin is treated as returnable; E-Cask/E-Keg as one-way; cans unaffected by returnable restriction.

### P0.2 Introduce canonical Package

Goal: replace package-name interpretation with first-class package metadata.

- Create `packages` canonical table.
- Define `broad_format`, capacity, `container_model`, draught, active.
- Link `product_variants` to `package_id` while retaining legacy `package_type` during migration.
- Extend product connector to reconcile package definitions from ViewPlan.
- Add package external identities if required.

Acceptance:
- Sales UI filters package behaviour by canonical fields, never string matching.
- Existing pricing/mapping still resolves the same Product Variants.

### P0.3 Correct account container preference

Goal: make `one_way_only` a canonical package rule.

- Filter Quick Email via `variant.package.container_model`.
- Apply same rule to Availability, Price List and later Order Capture.
- Display preference visibly on account.
- Keep `Any packaging` as default.

## Priority 1 — canonical availability service

### P1.1 Availability snapshot/cache

Implementation status: **implemented on `sprint-0/canonical-availability`; deployment and operational verification pending.**

Goal: stop screens calling Sellar directly.

- Create canonical availability snapshot table.
- Implement Sellar availability adapter -> exact Product Variant mapping -> snapshot upsert.
- Store source and last-checked timestamps.
- Preserve previous good snapshot on failed/empty reconciliation.
- Surface `Availability updated X ago`.

Acceptance:
- Availability and Quick Email read only from Brewery Ops availability service/data.
- Sellar outage does not make the feature structurally fail if a valid recent snapshot exists.

### P1.2 Adaptive availability refresh

Goal: reduce latency/API calls without hiding low-stock changes.

Initial policy to test:
- 20+ available: refresh after 30-60m.
- 6-19: 10-15m.
- 1-5: 2-5m.
- 0: 5-10m.
- force sufficiently fresh check on final order commitment.

Make thresholds configuration/service policy, not page code.

### P1.3 Shared availability API/service

Implementation status: **implemented for Account Availability, Quick Email and Price List on `sprint-0/canonical-availability`.**

Goal: one definition of current availability.

Consumers:
- Account Availability.
- Quick Email.
- Decorated Price List/Brochure.
- Undecorated Price List.
- Future Order Capture.

## Priority 2 — role-centric UX foundation

### P2.1 Role-centric navigation and information architecture

Goal: each operational role sees the minimum information needed to make the next decision/action, while all roles use the same canonical data.

Initial role lenses:
- Driver / dray.
- Salesperson.
- Bar manager.
- Production / warehouse.
- Management/admin where needed.

Rules:
- do not create duplicate role-specific Account/Product/Stock records;
- role-specific screens are views/workflows over canonical concepts;
- mobile-first for driver/sales/bar operational workflows;
- hide advanced detail until requested;
- one obvious primary action per screen where practical.

### P2.2 Driver account/stop view

Goal: give the driver only what they need at a stop.

Primary information:
- address/navigation;
- number and type of expected empties/returns;
- collection/delivery priority;
- delivery/collection window;
- call-ahead requirement and best contact;
- access/parking/location notes;
- relevant delivery/collection instructions.

Primary actions:
- Navigate.
- Call.
- Mark collected/delivered as appropriate.
- Capture observation.

Avoid exposing sales pricing/history/CRM detail unless explicitly useful.

### P2.3 Canonical observations

Goal: allow operational users to enrich shared account knowledge with very low friction.

- Introduce/clarify `Observation` concept linked to Account and source workflow.
- Support short free-text observation first; optional structured type later.
- Capture user, role, timestamp and source context.
- Show relevant observations in account timeline/knowledge.
- Allow durable observations to be promoted into structured account attributes.

Candidate durable attributes:
- call ahead required + lead time;
- delivery/collection window;
- access/parking instructions;
- preferred delivery point;
- regular closed days;
- other operational handling notes.

Acceptance:
- a driver can record a useful observation in a few seconds;
- sales/ops can see that knowledge later without needing a separate driver database.

### P2.4 UI refactor pass

Goal: prevent feature growth from turning key screens into button collections.

- Review Account detail action hierarchy.
- Review bottom/top navigation by role/context.
- Remove duplicates and rarely used top-level actions.
- Use progressive disclosure/settings menus for lower-frequency operations.
- Establish reusable patterns for primary/secondary actions, badges, freshness indicators and compact account knowledge.
- Test on phone first for field roles.

## Priority 3 — sales/orders connector and effectiveness reporting

### P3.1 Incremental ViewPlan orders/sales connector

- Bring orders/order items into canonical order/sales history automatically.
- Maintain external IDs and incremental high-water mark.
- Exclude invalid/unavailable customer records according to connector rules.
- Display connector freshness.

### P3.2 Sales Activity Effectiveness dashboard

Measure:
- contacts followed by order within 7/14/30 days;
- median time to next order;
- first order value and revenue within window;
- visit/call/email comparison;
- salesperson comparison;
- customer relationship status;
- dormant/lapsed reactivation and revenue.

Use association language, not unsupported causal attribution.

### P3.3 Interaction logging completeness

- Ensure call/email/visit interactions are captured consistently.
- Move from notes-as-proxy toward canonical `Interaction` where appropriate.
- Preserve timeline compatibility.

## Priority 4 — order capture

### P4.1 Lightweight sales order capture

- Start from canonical availability and effective customer price.
- Respect account package/container preference.
- Capture Product Variant + quantity.
- Recheck availability before commit.
- Initially hand off to the existing order-processing authority safely.

### P4.2 Allocation model

- Introduce canonical allocation once Brewery Ops order state can reserve stock.
- Availability becomes `physical - allocated - held` when authoritative inputs exist.

## Priority 5 — returnable container operations

### P5.1 Returns Near Me field trial

- Trial with drays.
- Validate location accuracy and useful package counts.
- Capture operational feedback: detour threshold, ageing, collection priority.
- Use trial observations to shape the Driver stop view rather than adding generic account-page controls.

### P5.2 Canonical returnable movement/history

- Represent dispatched / off-site / returned / lost / blocked movements.
- Keep individual `Container` distinct from Package and Product Variant.

### P5.3 Collection planning

- Suggested returns near current route/location.
- Weight by container count, age and detour cost.
- Include delivery/collection windows and operational constraints when known.

## Priority 6 — CRM refinement

### P6.1 Quick Email hardening

- Keep Cask/Keg/Can top-level selection simple.
- Show actual canonical package in preview/email.
- Account package preference filters automatically.
- Eventually use actual outbound Microsoft 365 send rather than `mailto:`.
- Log actual send only when delivery action is known, not when prepared.

### P6.2 Customer communications

- One-click current availability/price email.
- Decorated brochure/price list.
- Undecorated lightweight table.
- Sellar/channel link remains secondary product-detail link until replaced.

### P6.3 Account search and activity UX

- Incremental account-name narrowing/autocomplete.
- Calls/emails update canonical interaction timeline.
- Maintain consistent Home/Accounts navigation.

## Priority 7 — production and stock module replacement of ViewPlan

This is the strategic migration path, not a near-term clone of ViewPlan.

### P7.1 Product/batch production model

- Product.
- Batch/Gyle.
- Vessel/tank process state.
- Packaging event.
- Packaged stock by Product Variant/location/batch.

### P7.2 Stock ledger

Prefer stock movements/events over mutable magic totals where practical.

Potential events:
- packaged;
- transferred;
- allocated;
- dispatched;
- returned;
- adjusted;
- quarantined/released;
- consumed/destroyed.

### P7.3 Brewery Ops becomes availability authority

- Physical stock + allocation + hold -> canonical available quantity.
- Sellar becomes outbound availability/commerce adapter.
- Reconciliation detects channel drift.

### P7.4 Retire ViewPlan adapters incrementally

Replace one bounded authority at a time without changing consuming features.

## Integration/operational work

### Connector hardening

- Scheduled wrapper `viewplan-connector.ps1` remains the single scheduled entry point.
- Preserve module order dependencies: customers -> products/mappings -> pricing -> sales/orders -> containers.
- Ensure each module records connector state/freshness.
- Reduce noisy warnings caused by stale source rows while retaining actionable exceptions.

### Data freshness UI

- Global/footer last successful connector sync.
- Availability-specific last checked time.
- Module-level health/admin view later.

## Backlog rules

When adding a new backlog item, identify:

1. Canonical Brewery Ops concept affected.
2. Current source authority.
3. Target future authority.
4. Whether this creates or reduces external coupling.
5. What exact mapping/adapter is required.
6. Which user role needs the information/action.
7. What information can be removed/hidden to make that workflow faster.
8. Whether observations from the workflow should enrich shared account knowledge.

Do not prioritise a shortcut that makes ViewPlan/Sellar harder to replace unless it is explicitly documented as temporary technical debt.
