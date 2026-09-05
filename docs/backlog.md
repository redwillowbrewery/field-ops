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

### P0.4 Product data maintenance and durable Brewery Ops overrides

Goal: let Brewery Ops users efficiently govern imported legacy Product data without editing every Product in ViewPlan or having local decisions undone by a later import.

Canonical model:
- preserve the latest observed ViewPlan lifecycle state separately from Brewery Ops governance decisions;
- support nullable Brewery Ops overrides for Product `active`, `sellable` and `business_exchange` state;
- calculate canonical Product state from the Brewery Ops override when present, otherwise from the current imported observation;
- retain inactive Products and Product Variants for historical order resolution and auditability;
- record who made each override, when, and an optional reason;
- allow an override to be cleared deliberately so the Product resumes following ViewPlan;
- ensure reconciliation/imports update source observations but never silently overwrite an active Brewery Ops override.

Data-maintenance workflow:
- provide a searchable, filterable Product/Variant table with multi-select and bulk actions;
- distinguish imported ViewPlan state, effective canonical state and Brewery Ops override state clearly;
- support bulk actions to exclude from the current catalogue, mark not sellable, mark/unmark business exchange, and restore imported state;
- provide candidate filters such as inactive source Product, no current availability, no recent sales, missing external identity and legacy shell;
- preview the impact of a bulk action before applying it;
- warn when selected Products have current stock, availability, recent orders or other evidence that merits review;
- do not automatically mark a Product inactive merely because it has no current stock, since future Products may intentionally be pre-sold.

Acceptance:
- an authorised user can clean up a large legacy Product set quickly without working through individual ViewPlan Product pages;
- subsequent ViewPlan imports preserve explicit Brewery Ops overrides while continuing to refresh observed source state;
- current catalogue, Account selling, Availability, Quick Email and Price List consume the same effective canonical Product state;
- historical orders continue to resolve to retained inactive Products and Product Variants;
- every override and restoration is auditable and reversible.

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

## Priority 2 — field sales workflow

### P2.1 Weekly Sales Focus

Implementation status: **COMPLETE — 4 September 2026.**

Goal: make the app follow RedWillow's normal weekly selling rhythm instead of opening on the full account database.

Business rhythm:
- Thursday: Sales Manager/delegate sets next week's commercial focus based on availability, specials and priorities.
- Friday: broad customer communication currently goes via Mailchimp.
- Sunday: broad follow-up/reminder.
- Monday onward: geographically targeted call/email/WhatsApp contact once customers understand post-weekend requirements.
- Later in the week: tactical sales/collection opportunities around routes/areas already being worked.

Delivered capability:
- Sales Manager/delegate creates/edits a weekly plan.
- Store week/date range, concise sales focus, selected current products/themes/specials and areas/territories.
- Canonical product lifecycle imports ViewPlan active/sellable/BeX semantics so historical and BeX products do not pollute current selection.
- Build a bounded working contact list from explainable existing account signals.
- Track progress through the initial push.
- Filter/focus working lists by territory and open work.
- Surface useful account context including primary contact and latest order date.
- Keep prominent account search for known targets/exceptions.
- Do not integrate Mailchimp yet; the weekly focus is canonical workflow input, not Mailchimp-owned data.

Acceptance achieved:
- landing page does not show every account simply because it exists;
- current weekly focus and selected areas are immediately understandable;
- working list is bounded and each included account has an explainable reason;
- progress through the initial sales push is visible;
- Accounts remains the separate comprehensive directory.

### P2.2 Sales rhythm / managed account lens

Implementation status: **foundation delivered in Sprint 2A; continue refining through Account Selling Flow.**

Goal: support both territory/day-to-day selling and managed/key-account selling without duplicating Account data.

Rules:
- `Account` remains canonical;
- territory/day-to-day accounts primarily participate in the weekly geographic selling rhythm;
- managed/key accounts have an account-focused rhythm based on relationship context, ongoing requirements, opportunities/issues and due actions;
- do not overload relationship status to represent sales rhythm;
- introduce only the smallest useful sales/service-model property if implementation needs one;
- avoid elaborate permissions/taxonomy in Sprint 2.

Acceptance:
- managed/key accounts are not forced through the weekly territory list;
- both rhythms share the same canonical Account, Contact, pricing, availability, Interaction/Task and later Order concepts.

### P2.3 Account Selling Flow

Implementation status: **NEXT — Sprint 2B.**

Goal: make Account the fast customer-selling workspace.

Account should answer:
1. who are they?
2. what matters now?
3. what can I sell them and at what price?
4. what should I do next?

- Review Account action hierarchy and remove the expanding button-bank feel.
- Show useful relationship/territory/contact context first.
- Surface due follow-up/appointment and recent useful activity.
- Reuse canonical availability, effective pricing and package/container rules.
- Make call/email/WhatsApp/visit/follow-up actions obvious where useful.
- Connect product selection into Quick Email without forcing the salesperson to restart the selection task.
- Use progressive disclosure for lower-frequency operations.
- Keep phone layout primary for field sales.

Acceptance:
- common sales actions require minimal navigation/taps;
- account package restriction and current availability/price remain coherent;
- Availability and Quick Email reuse the same canonical selling data rather than independently reconstructing business rules;
- no page-specific pricing/package/availability business logic is added.

### P2.4 Interaction + follow-up workflow

Goal: make recording useful sales activity quick enough to happen consistently.

- Capture call/email/WhatsApp/visit outcomes with minimal fields.
- Support simple outcomes such as spoke/no answer/left message where useful.
- Optional short note rather than mandatory CRM form filling.
- Creating a follow-up/task is a natural continuation of the interaction.
- Allow weekly working-list progress to reflect completed contact.
- Preserve direction toward canonical `Interaction`; do not invent conflicting per-screen activity models.

Acceptance:
- salesperson can record contact outcome and optional follow-up in a few seconds on a phone;
- timeline/activity remains coherent;
- data is usable later by contact -> order intelligence.

#### Follow-up: conflicting ViewPlan customer identity reconciliation

Decision required: define the safe operator workflow for the case where a ViewPlan customer has already been imported as one canonical Account before a Brewery Ops-created prospect is linked to that same ViewPlan identity.

- Canonical concept: `Account` identity and its related Contacts, Interactions, Tasks, Appointments, Notes and history.
- Current source authority: Brewery Ops owns the canonical Account and prospect relationship; ViewPlan remains the read-only source of its external customer identity and imported commercial fields.
- Target authority: Brewery Ops retains one explicitly selected canonical Account and an auditable external-identity mapping.
- Provide an authorised reconciliation workflow that shows both Accounts and all affected child data before any change.
- Require an explicit survivor selection; never choose or merge Accounts through fuzzy name matching.
- Define safe re-parenting, conflict handling, audit history and a reversible/recoverable approach before implementation.
- Keep ViewPlan read-only and contain ViewPlan-specific semantics within the reconciliation adapter boundary.
- Until this workflow exists, continue rejecting an external identity that is already attached to another Account rather than guessing or silently merging.

Acceptance:
- an authorised user can resolve a confirmed duplicate without losing Account history or leaving child records split across two Accounts;
- the selected canonical Account retains the exact ViewPlan identity and subsequent imports update that Account;
- every identity change and record movement is auditable;
- ambiguous matches remain unresolved and visible for human review.

#### Follow-up: spreadsheet prospect intake

Goal: support home-based prospecting by allowing Sales to prepare multiple prospects in a documented spreadsheet format and upload them to Brewery Ops without turning the spreadsheet into a second source of truth.

- Canonical concept: each accepted row creates a normal Brewery Ops `Account` with `relationship_status = prospect`; do not introduce a separate Prospect model.
- Current source authority: a salesperson-provided CSV/XLSX is an intake source only; Brewery Ops becomes authoritative after explicit import.
- Publish a downloadable template with a small required field set and clearly named optional Account/contact/location fields.
- Validate the complete file before writing, show row-level errors and provide a preview of records that would be created.
- Reuse the same explainable duplicate-awareness rules as single Prospect creation; never fuzzy-merge or silently attach ViewPlan identities.
- Let the operator exclude suspected duplicates or explicitly confirm that a row represents a different business.
- Record import batch, source filename, operator, time and per-row result for audit and safe retry.
- Do not include ViewPlan writes or require a ViewPlan customer number.

Product decision required before implementation: agree the template columns, which fields are mandatory, maximum batch size, and whether the first release accepts CSV only or CSV and XLSX.

Acceptance:
- a salesperson can download the current template, prepare prospects away from the map workflow and preview a valid import;
- invalid rows do not cause a partial or opaque import;
- confirmed rows create canonical Accounts and optional Contacts using the same rules as the phone form;
- retries cannot silently create the same batch twice.

### P2.5 Tactical sales + field workflow

Goal: once the initial push is complete, help sales exploit areas/routes already being worked.

Initial questions:
- who useful is near me / in the area?
- which current/cooling/prospect accounts in the area have not been contacted or ordered recently?
- which nearby accounts have meaningful returnable containers outstanding?

Rules:
- use existing Account/location/container data first;
- keep recommendations explainable;
- do not introduce route optimisation, canonical Delivery Run or vehicle weight/capacity as Sprint 2 dependencies;
- Map remains the broader location exploration tool.

Architectural principle:

> **A delivery run remains a commercial and container-recovery opportunity until it closes.**

Later Order Capture + Delivery Run + vehicle/load data can enrich tactical suggestions with actual route geometry and spare capacity.

Acceptance:
- salesperson can identify plausible extra sales or collection opportunities in an area already being worked;
- no opaque next-best-account scoring is required;
- core field workflow works cleanly at normal phone widths.

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

## Priority 5 — returnable container and driver operations

### P5.1 Returns Near Me field trial

- Trial with drays.
- Validate location accuracy and useful package counts.
- Capture operational feedback: detour threshold, ageing, collection priority.
- Feed useful tactical sales/container signals into Sprint 2 without turning Sprint 2 into the driver workflow.

### P5.2 Driver account/stop view

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

### P5.3 Canonical observations

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

### P5.4 Canonical returnable movement/history

- Represent dispatched / off-site / returned / lost / blocked movements.
- Keep individual `Container` distinct from Package and Product Variant.

### P5.5 Collection planning

- Suggested returns near current route/location.
- Weight by container count, age and detour cost.
- Include delivery/collection windows and operational constraints when known.

## Priority 6 — CRM refinement / customer communications

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
- Later allow canonical weekly commercial focus to feed outbound channels such as Mailchimp without making those channels the source of truth.

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
