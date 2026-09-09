# Sprint 3 review and Product ownership proposal

Reviewed 9 September 2026 against main at c979129. This document separates implemented behavior, confirmed direction and the recommended next delivery scope. Sprint 4 numbering/scope below is a proposal, not a completed ownership transfer.

## Recommendation

Keep Sprint 3's outcome as a shared, trustworthy Take Off workflow. Close its remaining Sales/Head Brewer field acceptance and source exceptions; do not expand it into full Product authoring, recipes and production execution.

Start Product ownership design and migration preparation now. Make **Sprint 4 — Product foundation and publishing** the next implementation sprint. Its outcome is one Brewery Ops-owned Product record from which staff can prepare a beer for launch and publish consistent information to Sales. Sellar becomes availability-only when this cutover passes acceptance, not merely when an editor exists.

Follow with structured formulation/recipe work, then production execution and inventory ownership. Order Capture and Logistics remain downstream of those accepted boundaries.

## What Sprint 3 actually delivered

| Area | Repository evidence | Assessment |
| --- | --- | --- |
| Shared planning and source lineage | take_off_subjects, ViewPlan take-off adapter, /take-off | Implemented and deployed; ViewPlan remains operational source |
| Sales requests, Head Brewer decisions, quantities and remaining litres | take_off_requests, approval/context RPCs, quantity grid | Implemented; retain the end-to-end field acceptance below |
| Fermentation-based packaging estimates | packaging_days from ViewPlan product duration | Implemented estimates, not release readiness |
| Shared price-list Coming soon | price_list_coming_soon RPC and public renderer | Deployed; fresh physical in-tank beer and current approved formats only |
| Local product declarations | product_information, product_package_information, /products/information | Deployed; beer defaults and package overrides with Head Brewer confirmation, concurrency and audit |
| Shared package-process defaults | No default policy or explicit isinglass field in current model | Missing; user-confirmed direction belongs in Product foundation |
| Editorial Product ownership | products still patched by ViewPlan; product_presentations upserted by Sellar | Partial canonical structure, not editorial ownership |
| Versioned artwork, formulations, low-friction creation, launch readiness | No implemented end-to-end model/workflow | Missing; make earlier decisions durable below |

Evidence: scripts/viewplan-price-sync.ps1 updates Product name, ABV and lifecycle state on each reconciliation. src/lib/sellar-availability-sync.mjs also writes descriptions, image URLs, ABV and dietary observations into product_presentations on each availability refresh. src/lib/account-selling.ts reads those presentations. Local reviewed declarations are already separate and survive external refreshes.

The existing dietary editor is an initial part of Product; it should become a section of the Product workspace rather than a separate product database.

### Sprint 3 exit checklist

- Production and Sales compare representative planned, staging and physical FV rows, dates and current litres with ViewPlan.
- Sales submits real quantities; the Head Brewer reviews them; both confirm requested versus agreed volume and allowances.
- A real reschedule or tank transfer preserves requests and makes affected approval stale.
- Review the five conflicting historical plan/batch links and unresolved mappings without automatic name-based merging.
- Confirm the working-day refresh arrangement and stale/error behavior.
- Review generic/customer Coming soon, package restrictions and the new declarations with actual user-entered confirmed data.

Automated checks and deployments do not constitute this field acceptance. Sprint 2C prospect testing remains explicitly deferred; do not manufacture ViewPlan data to close it.

## Target Product model

Reuse canonical IDs and existing Product, Package and Product Variant records.

| Concept | Responsibility |
| --- | --- |
| Product | Stable beer identity, type (Beer is a Product type), working/display name and local draft/published/retired workflow |
| Published product specification | Reviewed customer-facing ABV, style, descriptions and dietary/allergen declaration references; distinct from measured batch facts |
| Marketing revision and asset | Versioned descriptions, pump clips, labels, packshots and other artwork; approval/current-publication pointers and owned file storage |
| Recipe / formulation revision | Ingredients, units, quantities, target brew volume, process specification and change history; independently versioned from marketing |
| Package | Physical format, capacity, lifecycle and procurement semantics; not a recipe or a beer |
| Packaging process defaults | Reviewed treatment assumptions associated with a format, including explicit isinglass use; separate from container lifecycle |
| Product + Package | Presentation/treatment/declaration exceptions for that beer in that package, including planning formats without existing saleable variants |
| Product Variant / channel listing | Sellable unit and exact external mapping; separate from Product identity and availability |
| Launch readiness | Required tasks, owners, evidence and completion state attached to the Product/release |
| Batch / Gyle | Actual production instance; later records the exact formulation/process revisions used, not whichever recipe happens to be current |

A recipe adjustment need not create a new beer; neither does new artwork or a packaging format. A materially new beer identity is an explicit decision. Conversely, matching names are not proof that two existing records are the same beer.

Keep nominal/published ABV separate from observed or measured batch ABV. Ingredient-derived allergen suggestions require reviewed source specifications and approval before becoming a customer declaration. A recipe change must flag relevant declarations for review rather than silently retaining or rewriting claims.

### Fining rules confirmed by the user

Cask/pin formats use isinglass; keg and can do not. Implement as reviewed package-process defaults with explicit Product + Package exceptions, not hard-coded page logic or repeated edits to every beer.

Store isinglass use separately from fined/unfined status. No isinglass does not prove no other fining treatment, vegan suitability or an allergen declaration. Unknown and explicit overrides must survive inheritance.

Resolve treatment defaults from the package process and then the beer/package exception. Resolve the beer's base composition declarations separately, applying approved package-specific effects/exceptions. Preserve the existing reviewed local records; migrate them without silently replacing explicit decisions with new defaults.

## Source ownership and initial merge

| Information | Initial candidate source | Owner after Product cutover |
| --- | --- | --- |
| Existing identity, external references, nominal ABV, process duration | ViewPlan observations and existing canonical mappings | Brewery Ops approved Product/specification; source observations retained separately |
| Description, tasting notes, current display artwork | Existing Sellar presentation snapshot; review alternatives | Brewery Ops published marketing revision and assets |
| Allergens, vegan/free-from claims and fining | Existing local reviewed records; external flags are evidence only | Brewery Ops reviewed declarations and package-process exceptions |
| Recipe/formulation | Audited ViewPlan recipe structures or supplied recipe records | Brewery Ops revision authoring; ViewPlan execution remains authoritative until a separate cutover |
| Active/sellable/business-exchange observations | ViewPlan | Preserve source observations and adopt explicit canonical governance; do not confuse local draft/published state with source saleability |
| Product/Package/Variant mappings | Existing exact ViewPlan and Sellar IDs | Brewery Ops mappings; no external name becomes an identity rule |
| Prices and Account commercial facts | Current ViewPlan-based pricing/commercial adapters | Unchanged in this sprint |
| Brew plans, tanks, batches, actual packaged stock, orders and logistics | ViewPlan | Unchanged operational authority |
| Availability by mapped sellable variant | Sellar | Sellar observation via Brewery Ops availability service, until Inventory ownership replaces it |

Field authority is explicit. Never use a universal “ViewPlan wins”, “Sellar wins”, newest timestamp or last writer rule.

### Migration sequence

1. **Inventory and reconcile.** Export a bounded comparison of canonical Product IDs, external IDs, ViewPlan technical/lifecycle observations and Sellar presentations. Flag missing, conflicting and many-to-one mappings. Existing mappings stay intact. The current external-ID uniqueness constraints need review before any consolidation of legacy beer records.
2. **Stage candidates.** Keep source, external ID, observation time and import-run identity with each proposed value. Existing reviewed local declarations take precedence. Imported candidates are not automatically approved product claims.
3. **Adopt existing content.** Seed drafts from the current presentation so Sales does not need to retype everything. Review conflicting ABV/names, package treatments and declarations. Copy approved company-owned artwork into Brewery Ops-managed storage with original source URL and file checksum; leaving only a Sellar-hosted image URL is not independence.
4. **Publish locally.** Provide draft/review/publish, immutable previous revisions and an explicit current publication. All Sales, price-list, Coming soon and other product presentation consumers read the same published model. Editing a draft must not alter a customer link.
5. **Change adapters together.** Availability sync writes only availability/mapping diagnostics. Stop Sellar presentation writes. Refactor ViewPlan Product reconciliation to refresh external observations without overwriting adopted local editorial fields. Keep ViewPlan source pricing, operational observations and exact mappings intact.
6. **Prove the boundary.** Run repeated source refreshes and show that local artwork, names, descriptions, published ABV and declarations do not change, while availability and source-owned facts do. A missing asset or failed source read must not blank a published Product.
7. **Retain recovery.** Keep source snapshots and old publication versions. Roll back through an explicit known-good publication/application release; do not re-enable unrestricted source writes over reviewed records.

Cutover is idempotent and reviewable. After adoption, later external editorial changes may enter an explicit comparison/import workflow; they never become an ongoing hidden authority. Routine Sellar sync becomes availability-only. Existing cached presentation is migration material, not a second permanent editor.

## Proposed Sprint 4 — Product foundation and publishing

One outcome: create or adopt a beer, prepare its customer information, track launch readiness and publish it once for every Sales surface.

### Deliver

- One Product workspace with quick creation: working name and Product type are sufficient for a draft. Offer optional duplication of an existing beer/template without inheriting approvals or external IDs. Do not require a recipe, artwork, Sellar listing, stock or ViewPlan ID to save the initial beer.
- Adopt existing Products through the reviewed import above; preserve history, requests, prices and mappings.
- Edit and publish versioned descriptions, approved artwork and product specification. Integrate the current declarations editor and package-process defaults into this workspace.
- Establish a versioned formulation record with draft/approved/superseded states and attachment/evidence support. A recipe can be recorded without claiming operational execution authority; the full ingredient/calculation builder follows.
- Track a configurable launch checklist: artwork approved, Untappd record created, Sellar listing created, initial pump-clip order completed, recipe/specification approved and product declarations reviewed. Tasks carry owner/evidence; required items gate “ready to launch”, not initial draft creation. Marking a task complete does not automatically create a third-party record or place an order.
- Publish a Product independently of whether there is current stock. Availability and current in-tank status continue to come from their existing sources.
- Complete the Sellar availability-only and ViewPlan editorial-write cutover. New unmatched source identities go to reconciliation rather than overwriting or duplicating a locally authored beer.

While ViewPlan runs production, a new local beer needs an explicit manual ViewPlan setup/mapping step before it can appear in its brew plan. Sellar listing setup is likewise a deliberate channel task. Avoid implying that local draft creation automatically creates either external record. No source writes are introduced.

### Acceptance

- Create a useful draft beer in one short form; finish information in the same Product context without mandatory setup across several modules.
- Adopt an existing beer without rekeying its presentation; confirm origin and resolve conflicts.
- Publish updated artwork/description once and see it consistently on generic/customer lists and Coming soon.
- Re-run both connectors: the publication remains unchanged while availability/source facts refresh.
- Cask/pin and keg/can display the reviewed treatment and declaration differences; explicit exceptions/unknown values are preserved.
- A draft edit or recipe revision does not silently change a public claim or a historical batch specification.
- Launch readiness clearly shows missing required tasks; local publication, external listing and readiness are distinct.
- A retired beer remains available for historical orders/batches, with no fuzzy ID remapping.

### Follow-on sequence

1. Structured formulation design: malt/hops/adjuncts, units and scaling, process stages, version comparisons; audited recipe import. Water-report/salt calculations require their own validated inputs, assumptions and brewer acceptance.
2. Production planning/execution: bind the recipe and process revisions actually used to each batch; treatment exceptions and actual packaging.
3. Packaging materials demand from approved splits/BOMs and artwork revisions; purchasing and Inventory authority progress through their own acceptance gates.
4. Stock ledger/provenance and Brewery Ops-owned availability.
5. Order Capture and Logistics after the underlying ownership gates.

Do not compress this entire sequence into Product foundation.

## Decision boundary for this review

Confirmed: local declarations with package variation; the stated isinglass defaults; desired versioned Product/marketing/formulation model and easy creation/launch progress; Sellar's intended ongoing role is availability only.

Recommended: close Sprint 3 field acceptance and deliver the bounded Product foundation as Sprint 4. No recipe schema, publication migration, package-process defaults or connector authority change has been implemented by this documentation review.
