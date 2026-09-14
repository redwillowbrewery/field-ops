# Sprint 4 — Product foundation and publishing

Status: **CURRENT — implementation complete; application deployment and field acceptance pending.** Database migrations are applied and source observations staged. Sprint 3 field acceptance remains open. See [implementation review](./sprint-4-implementation-review.md).

## Outcome and boundaries

Create or adopt a beer in one Product workspace, prepare its customer information, track launch readiness and publish once for every Sales surface. Reuse canonical Product, Package and Product Variant identities. Beer is a Product type, not a second catalogue.

ViewPlan remains read-only and authoritative for operational production, tanks, inventory, orders, logistics and current pricing. Sellar becomes availability-only after reviewed content adoption and connector cutover. Preserve Sprint 2C prospect/Interaction/follow-up work and Sprint 3 Take Off requests, approvals, mappings, price links and restrictions. Prospect field testing stays deferred. The nightly scheduler fault is a separate outstanding operational fix.

## Canonical model and confirmed declarations

| Level | Responsibility |
| --- | --- |
| Beer Product | Stable identity, description/specification, nominal ABV, base allergens and one gluten-free status across every format |
| Marketing revision | Independently versioned descriptions and owned artwork, draft/review/publication state |
| Formulation revision | Independently versioned recipe/process record; later batches bind the actual revision used |
| Packaging family | Cask or Keg & Can; a treatment grouping separate from Package capacity, lifecycle, procurement and physical Container tracking |
| Beer + packaging family | Fining and vegan declaration; approved process effects on the final allergen statement |
| Product Variant | Beer + canonical Package sellable unit and exact external mappings |

Map E-Cask, Firkin, Pin and Flat Bottom Pin to **Cask**; keg and can packages to **Keg & Can** through canonical package metadata. Unknown/other formats remain unclassified pending an explicit decision; never guess from display names.

- **Keg & Can:** always unfined under the current brewery policy. Containers inherit this centrally, not through repeated per-package edits. Keep the underlying model capable of a deliberate future policy change.
- **Imported Cask beers:** seed fined by default unless audited ViewPlan Label Text indicates unfined or vegan friendly. These phrases describe the cask version. Preserve source wording, import provenance and interpretation; flag ambiguous, negated or contradictory wording for review. No blind substring matching.
- **New local beers:** explicitly choose Cask fined/unfined during product setup. A minimal working-name/type draft may be saved first; publication requires this decision.
- **Vegan:** family-level, independent of fining. Unfined does not imply vegan; recipe ingredients such as lactose still matter. Label claims provide review evidence for Cask, not an automatic Keg & Can claim.
- **Gluten-free:** beer-level Gluten-free / Not gluten-free / Not confirmed, inherited unchanged across all packages. Existing contradictory package overrides require review, not an arbitrary winner.
- **Allergens:** preserve base composition separately from approved process additions/effects. Full source label text is evidence, not automatically a clean allergen statement. Do not publish cask-specific isinglass wording on keg/can by blindly copying a label.
- Preserve unknowns and existing confirmed local decisions. Subsequent imports update observations/candidates without overwriting reviewed declarations. Source absence or refresh failure never clears an approved value.

## Delivery sequence

1. **Audit and stage:** run the [read-only label audit](../scripts/audit-viewplan-product-labels.ps1). Confirm the actual field behind Label Text, its format, exact product identity, representative exceptions and change detection. Audit labels before choosing mappings; if change-marker coverage is unproven, use a full bounded label refresh rather than assuming product incremental sync catches edits.
2. **Foundation and migration:** preserve canonical IDs and history; migrate current beer defaults/per-package overrides into Beer and Beer-family fields with a conflict report. Do not silently discard explicit unknowns or contradictory values. Use permissions and audit history at least as strong as the existing Head Brewer editor.
3. **Quick creation and publishing:** draft from working name/type, optional duplication without source IDs or approvals, one contextual editor for specifications, family declarations and marketing. Publication is an explicit reviewed revision; draft edits never alter live links.
4. **Source adoption and handover:** seed existing Sellar artwork/descriptions for review; copy approved company-owned assets into managed storage. Retain source IDs, observation times and original values. Cut off Sellar editorial writes and ViewPlan writes to adopted editorial fields together with consumer migration. Keep operational observations and pricing fresh.
5. **Sales consumers:** generic/customer price lists, Account selling and Coming soon use the same published specification and effective family declarations. Preserve account-specific prices/restrictions and source freshness behavior.
6. **Recipe record and launch readiness:** versioned formulation records/attachments and configurable launch tasks with owner/evidence. Artwork approval, Untappd, Sellar setup, pump-clip order and specification/declaration review can gate launch readiness, never initial draft creation. External tasks do not execute themselves.

While ViewPlan runs production, local beers require manual ViewPlan creation and exact mapping before its brew planning can use them. Local publication, channel listing, availability and ready-to-launch are separate states.

## Acceptance

- Create a minimal beer draft without a ViewPlan ID, artwork, recipe or stock.
- Explicitly set new-beer Cask fining before publication; all four cask formats inherit it.
- Import normal fined, unfined/vegan-friendly, blank and ambiguous labels with provenance and reviewable outcomes; confirmed local decisions survive repeat imports.
- Keg/can consistently show unfined without gaining an unsupported vegan claim.
- Gluten-free status is identical for every format; migration exposes contradictory legacy overrides.
- Review base allergens and process differences; publish the correct declaration for each family without leaking raw mixed-purpose label text.
- Old Product IDs, requests, approvals, prices and links still resolve after migration.
- A reviewed publication appears consistently on every Sales surface; drafts and source refreshes cannot replace it.
- Failed/empty source refresh retains publications; missing source mappings enter reconciliation without fuzzy merging.
- Recipe/marketing revisions are independent and previous versions remain available. Required launch tasks show what remains without blocking draft work.

## Deferred

Structured recipe calculations, water report/salt additions, ingredient lot execution, packaging-material demand/BOMs and inventory ownership follow in bounded increments. Establish Product → Production → Inventory operational ownership before Order Capture or Logistics. See [ownership review](./product-ownership-review.md) for migration detail and Sprint 3 field acceptance.
