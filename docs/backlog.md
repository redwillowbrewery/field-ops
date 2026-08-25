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

Goal: one definition of current availability.

Consumers:
- Account Availability.
- Quick Email.
- Decorated Price List/Brochure.
- Undecorated Price List.
- Future Order Capture.

## Priority 2 — sales/orders connector and effectiveness reporting

### P2.1 Incremental ViewPlan orders/sales connector

- Bring orders/order items into canonical order/sales history automatically.
- Maintain external IDs and incremental high-water mark.
- Exclude invalid/unavailable customer records according to connector rules.
- Display connector freshness.

### P2.2 Sales Activity Effectiveness dashboard

Measure:
- contacts followed by order within 7/14/30 days;
- median time to next order;
- first order value and revenue within window;
- visit/call/email comparison;
- salesperson comparison;
- customer relationship status;
- dormant/lapsed reactivation and revenue.

Use association language, not unsupported causal attribution.

### P2.3 Interaction logging completeness

- Ensure call/email/visit interactions are captured consistently.
- Move from notes-as-proxy toward canonical `Interaction` where appropriate.
- Preserve timeline compatibility.

## Priority 3 — order capture

### P3.1 Lightweight sales order capture

- Start from canonical availability and effective customer price.
- Respect account package/container preference.
- Capture Product Variant + quantity.
- Recheck availability before commit.
- Initially hand off to the existing order-processing authority safely.

### P3.2 Allocation model

- Introduce canonical allocation once Brewery Ops order state can reserve stock.
- Availability becomes `physical - allocated - held` when authoritative inputs exist.

## Priority 4 — returnable container operations

### P4.1 Returns Near Me field trial

- Trial with drays.
- Validate location accuracy and useful package counts.
- Capture operational feedback: detour threshold, ageing, collection priority.

### P4.2 Canonical returnable movement/history

- Represent dispatched / off-site / returned / lost / blocked movements.
- Keep individual `Container` distinct from Package and Product Variant.

### P4.3 Collection planning

- Suggested returns near current route/location.
- Weight by container count, age and detour cost.

## Priority 5 — CRM refinement

### P5.1 Quick Email hardening

- Keep Cask/Keg/Can top-level selection simple.
- Show actual canonical package in preview/email.
- Account package preference filters automatically.
- Eventually use actual outbound Microsoft 365 send rather than `mailto:`.
- Log actual send only when delivery action is known, not when prepared.

### P5.2 Customer communications

- One-click current availability/price email.
- Decorated brochure/price list.
- Undecorated lightweight table.
- Sellar/channel link remains secondary product-detail link until replaced.

### P5.3 Account search and activity UX

- Incremental account-name narrowing/autocomplete.
- Calls/emails update canonical interaction timeline.
- Maintain consistent Home/Accounts navigation.

## Priority 6 — production and stock module replacement of ViewPlan

This is the strategic migration path, not a near-term clone of ViewPlan.

### P6.1 Product/batch production model

- Product.
- Batch/Gyle.
- Vessel/tank process state.
- Packaging event.
- Packaged stock by Product Variant/location/batch.

### P6.2 Stock ledger

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

### P6.3 Brewery Ops becomes availability authority

- Physical stock + allocation + hold -> canonical available quantity.
- Sellar becomes outbound availability/commerce adapter.
- Reconciliation detects channel drift.

### P6.4 Retire ViewPlan adapters incrementally

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

Do not prioritise a shortcut that makes ViewPlan/Sellar harder to replace unless it is explicitly documented as temporary technical debt.
