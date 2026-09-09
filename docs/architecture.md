# Brewery Ops Architecture

Status: **Canonical design reference**

This document defines the architectural principles and core business concepts for Brewery Ops. When implementation convenience conflicts with this document, prefer the architecture and update this document deliberately if the business model has genuinely changed.

## 1. North star

> **Brewery Ops owns the business truth. External systems are adapters.**

Brewery Ops must model brewery business concepts in its own canonical data model. ViewPlan, Sellar and future systems translate data into or out of that model; application features must not depend directly on the quirks, names or identifiers of an external system.

### Transitional ownership — agreed 5 September 2026

Sprint 2C is **CURRENT**. Sales Ops owns CRM relationship and workflow: canonical Accounts/prospects, CRM Contacts, Interactions, Notes, Tasks, Appointments and weekly sales activity. ViewPlan remains the operational authority for products, production, inventory, orders and logistics for now. Sales Ops consumes ViewPlan orders and account commercial facts from the Account perspective through canonical data/services; importing those facts does not transfer operational ownership.

The target canonical Brewery Ops model remains the architecture direction, not a claim that every operational authority has already migrated. Existing catalogue governance and Sellar availability observations do not constitute Product/Production/Inventory operational ownership.

After the Sales work, establish **Product → Production → Inventory** operational ownership before Brewery Ops-owned **Order Capture → Logistics**. Ownership must be explicitly accepted for the underlying product, batch/packaging and stock/provenance services before order commitment, allocation, dispatch or logistics authority moves. Read-only Account order history and tactical sales/container views can continue during transition. ViewPlan remains read-only from Brewery Ops.

## 2. Architectural principles

### 2.1 Canonical concepts first
Model the business concept before modelling an integration.

### 2.2 External IDs are mappings, never primary identity
Every Brewery Ops entity has its own stable ID. External identifiers attach through explicit mappings.

### 2.3 External systems have bounded authority
ViewPlan remains authoritative for products, production, inventory, orders, logistics and account commercial source facts during transition. Sellar supplies channel observations. Brewery Ops owns canonical application semantics and Sales Ops CRM relationship/workflow; operational authority migrates only through explicitly accepted bounded replacements.

### 2.4 Application features consume Brewery Ops services/data
Screens ask canonical questions rather than independently interpreting ViewPlan or Sellar.

### 2.5 Mappings must be explicit where correctness matters
Exact mappings beat fuzzy/name matching for commercial behaviour.

### 2.6 Stock and availability are different concepts
Ultimately distinguish physical, allocated, held and available quantities.

### 2.7 Source replacement must not change feature behaviour
Replacing Sellar/ViewPlan should change adapters, not sales/CRM/availability behaviour.

### 2.8 Prefer observable syncs over hidden magic
Expose sync time, source, counts, failures and useful diagnostics.

### 2.9 Safe reconciliation
Never destroy a known-good snapshot after an obviously failed source reconciliation.

### 2.10 One definition per business rule
Package lifecycle, saleability, effective pricing and availability are calculated canonically and reused.

### 2.11 Frictionless by default
Prioritise speed, clarity and confidence. Common operational actions should take one or two taps and advanced detail should stay out of the way until needed.

### 2.12 Role-centric views over one shared model
Driver, sales, bar, production and warehouse views are lenses over shared canonical data, not separate systems.

Sales, Production and Logistics workspaces are views over the same canonical data, not separate departmental records. Each user can configure a primary workspace/default view and switch workspaces as needed. Workspace preference controls navigation and presentation; it is separate from permissions and never grants access or bypasses authorisation. Establish this principle now; delivering all specialist workspaces or a new permission system is not Sprint 2C scope.

### 2.13 Operational observations feed shared account knowledge
Low-friction observations captured in context should enrich shared Account knowledge and, where durable, be promotable into structured attributes.

## 3. Canonical domain model v1

### Account
A business/customer/prospect we have a commercial relationship with.

### Account commercial snapshot

Confirmed 7 September: the Account balance is the all-unpaid-orders ViewPlan total in GBP. ViewPlan ordering and dispatch permissions remain separate: when ordering is allowed but dispatch is blocked, Sales sees "Can order - payment required before dispatch". An ordering block remains a stop. Neither flag is inferred from balance or credit limit; see [implementation review](./sprint-2c-implementation-review.md).
ViewPlan supplies balance, credit limit and explicit hold/stop, with source and successful snapshot timestamp, through the overnight Account sync. These facts are read-only in Brewery Ops. Explicit hold/stop is the authoritative sell/stop signal; balance versus limit does not create or clear a hold. Preserve unknown/stale states and previous successful snapshots on refresh failure. See [Sprint 2C requirement 2C.8](./sprint-2c-prospects-interactions-follow-up.md#2c8--viewplan-account-commercialcredit-snapshot) for the refresh and acceptance contract.

### Contact
A person associated with an Account.

### Product
The beer/product identity independent of packaging and batch/gyle.

Canonical Product state includes three independent facts:

```text
active                 belongs to the current brewery catalogue
sellable               Product-level commercial eligibility retained for later workflows
business_exchange      legacy bought-in/swapped brewery Product
```

ViewPlan currently supplies these from `tblBrew_Product_Names_List.is_available`, `tblBrew_Type.allow_sale` and `tblBrew_Type.is_bex` respectively. ViewPlan exposes no Product Names numeric key on `tblBrew_Type`, so its adapter resolves lifecycle state through the exact `product_name = brew_product_name` lookup used by that source model and aborts before writes on missing or contradictory matches. This source-specific lookup remains inside the adapter.

The canonical **Current Sales Catalogue** is `active = true AND business_exchange = false`. It deliberately does not require `sellable` or current stock availability: weekly focus can pre-sell future stock, while later order and customer-output workflows may apply stricter commercial rules. Inactive and business-exchange Products remain canonical so historical orders and sales continue to resolve.

Legacy Product shells with neither an external identity nor any Product Variant are not members of the current catalogue. They are retained for auditability but marked inactive; they must not be name-matched to an authoritative Product or physically deleted.

### Package
A first-class definition of the physical/commercial packaging format used to package and sell Product.

Sprint 0 freezes the following core semantics:

```text
id
name
broad_format          cask | keg | can | bottle | other
package_system        optional descriptive/system identity
capacity_litres       nullable where not meaningful
lifecycle             brewery_returnable | third_party_returnable | one_way | non_container
procurement_mode      consumable | reusable_asset | externally_supplied | none
draught
active
source_system
source_reference
material_id           nullable future link to canonical Material
```

The dimensions deliberately remain independent:

- **broad_format** answers what kind of package it fundamentally is.
- **package_system** distinguishes systems/types within that format, for example E-Keg, Kegstar, Key Keg, Poly Keg, Firkin or Pin.
- **lifecycle** answers what happens to the physical package after sale/use.
- **procurement_mode** answers how Brewery Ops must plan/replenish it.
- **capacity_litres** supports packaging, availability and production planning.

Examples:

| Package | Format | Package system | Lifecycle | Procurement |
| --- | --- | --- | --- | --- |
| Firkin | cask | Firkin | brewery_returnable | reusable_asset |
| Pin | cask | Pin | brewery_returnable | reusable_asset |
| E-Cask | cask | E-Cask | one_way | consumable |
| 30L Steel | keg | Steel | brewery_returnable | reusable_asset |
| 50L Steel | keg | Steel | brewery_returnable | reusable_asset |
| E-Keg | keg | E-Keg | one_way | consumable |
| Kegstar | keg | Kegstar | third_party_returnable or externally-managed according to audited business semantics | externally_supplied |
| Key Keg | keg | Key Keg | one_way | consumable |
| Poly Keg | keg | Poly Keg | one_way | consumable |
| 12 x 440ml cans | can | Can | non_container | consumable |

`package_system` is optional because not every package requires a branded/proprietary system identity.

A customer restriction can therefore express either a broad rule such as `one_way_only` or, later, a specific allowed package system without changing Product or Sellar mappings.

Package procurement semantics are included now even though purchasing/MRP is later work. A consumable package can eventually link through `material_id` to packaging-material stock so future order/production demand can create packaging purchase requirements.

ViewPlan's `has_inventory` must **not** be copied as Brewery Ops lifecycle semantics. The Sprint 0 audit shows ViewPlan can inventory-track packaging such as E-Cask even when the business treats it as one-way. The ViewPlan adapter therefore translates source data into canonical Package semantics rather than exposing ViewPlan flags directly to application features.

### Product Variant
A sellable Product + Package combination.

Every live Product Variant must resolve to exactly one canonical Package before Sprint 0 exits. Existing textual package fields may remain temporarily for compatibility during migration but are not the long-term business-rule authority.

### Small-pack assembly and sales units (future)

Small pack requires a richer model than treating a case as a single primitive Package.

A packaged beer unit such as a 440ml can is assembled from packaging components, for example:

```text
beer from Batch/Gyle
+ can body
+ can end/lid
+ product label or printed-can identity
= finished individual can
```

Those finished units can then be assembled into secondary sales/handling units, for example:

```text
1 x 440ml can
6 x 440ml cans
12 x 440ml case
24 x 330ml case
```

The model must therefore eventually distinguish:

- **Packaging Material / Component** — purchased inputs such as can bodies, ends/lids, labels, trays, cartons and wrap;
- **Packaged Unit** — the traceable primary packaged product, e.g. one labelled 440ml can from a Batch/Gyle;
- **Pack / Assembly Definition (BOM)** — how components or packaged units combine into another stock/sales unit;
- **Sales Unit / SKU** — the unit a channel/customer can buy, which may be an individual can, multipack or case;
- **Channel Listing** — external Shopify/Sellar/etc identity, price and availability mapped to the canonical Sales Unit rather than defining it.

B2B and B2C can therefore sell different units of the same underlying packaged beer without creating different beer Products. For example, Brewery Ops may sell cases B2B while Shopify B2C sells individual cans, six-packs and cases.

Batch provenance must survive assembly. If cans from Batch X are assembled into cases, every resulting sales unit must remain traceable back to Batch X and ultimately to the raw-material lots used in that batch. Where an assembly combines multiple source lots/batches, the resulting stock must preserve all relevant provenance rather than collapsing it into an untraceable aggregate.

This is a future production/inventory capability and is **not** required to expand Sprint 0. Sprint 0 should avoid modelling `12 x 440ml cans` in a way that prevents it later being represented as an assembly/sales unit built from traceable individual packaged cans and packaging components.

### Batch / Gyle
A production instance of a Product.

```text
Product -> Batch/Gyle -> Packaging Event/Packaged Lot -> Product Variant
```

### Packaged Lot
The primary packaged-product traceability object: a quantity of a Batch/Gyle packaged in a Package during a packaging event/take-off.

Packaged Lot tracks **what is inside the package**, not necessarily the identity of each physical vessel. This provenance must survive allocation and dispatch so recalls can identify customers even for one-way packages.

### Container
An optional individually tracked reusable physical asset where the business needs asset/return logistics.

Container tracking is separate from product/batch traceability. A Firkin can be batch/customer traceable without serialising every physical firkin; E-Cask/E-Keg/cans remain fully product/batch traceable without creating reusable Container assets.

### Stock
Physical packaged quantity associated with Product Variant, Packaged Lot/Batch provenance and location as required.

### Allocation
Stock committed/reserved to an order or other purpose while preserving provenance.

### Availability
The quantity/status Brewery Ops is prepared to offer for sale.

### Price List / Account Pricing
Canonical commercial pricing with effective-price calculation owned by Brewery Ops.

### Order
A customer's commitment to purchase Product Variants. Future-dated demand ultimately feeds allocation, packaging, production and material planning.

### Interaction / Observation / Task / Appointment
CRM and operational workflow concepts over the shared Account model.

### Weekly Sales Plan

A time-bounded sales-workflow lens over canonical Accounts, Territories and Products. It stores the week's concise commercial focus and relational selections, but never copies price, package or availability facts. Product selection uses the canonical Current Sales Catalogue, not current availability, because a weekly focus may legitimately pre-sell stock that has not yet been packaged.

Territory-service accounts in selected Territories form an explainable, bounded working list when their relationship state is `current`, `cooling`, `lapsed`, or `prospect`. `closed` and `dormant` Accounts are not inserted automatically; dormant reactivation requires an explicit future workflow/reason rather than territory membership alone. Per-plan Account progress (`not_contacted`, `contacted`, `follow_up`, `complete`) is operational workflow state rather than Account identity or relationship status. Managed accounts stay outside the territory push and surface through their canonical due Tasks and Appointments.

### Returnable Movement
A movement/state change for a reusable/collectible physical Container where asset-level tracking is operationally required.

## 4. Integration boundaries

### ViewPlan adapter (current)

| ViewPlan concept | Brewery Ops concept |
| --- | --- |
| `tblCustomer` | Account |
| `tblBrew_Type` | Product |
| brew type + packaging rows | Product Variant |
| `tblPackaging_Type_List` + audited business mapping | Package source inputs |
| packaging/take-off/batch/order lineage | Packaged Lot / traceability inputs |
| `tblPackaging_Inventory` | optional Container/legacy packaging-inventory inputs, not automatic proof of returnability |
| `tblImport_Product_Map.ecom_trade2_variant_id` | Sellar external identity bridge |
| customer price lists/rules | Price List / Account Pricing |
| orders/order items | Order / sales history |

ViewPlan is READ ONLY from Brewery Ops during migration.

### Sellar adapter (current)
Sellar supplies external Product Variant identity and availability observations. It does not define canonical Product, Package, lifecycle, procurement or pricing semantics.

## 5. Availability direction

```text
Sellar adapter
 -> exact Product Variant mapping
 -> canonical availability cache/service
 -> Availability / Quick Email / Price List / Order Capture
```

Account package preferences filter against canonical Package semantics, not Sellar container strings or package-name heuristics.

## 6. Production and procurement direction

The Package model is designed to support the future workflow:

```text
Order / forecast demand
 -> finished beer requirement
 -> packaging requirement
 -> Package procurement semantics
 -> packaging-material stock requirement
 -> purchase requirement
```

Reusable assets follow a different planning path:

```text
Packaging requirement
 -> available clean/ready reusable fleet
 -> recovery / cleaning / shortage / replacement requirement
```

For small pack the future planning chain extends through the assembly BOM, for example:

```text
12 x 440ml case demand
 -> 12 finished 440ml cans
 -> 12 can bodies + 12 ends + 12 labels/printed cans
 -> case/tray/carton/wrap requirements
 -> packaging-material stock check
 -> purchase requirements
```

These future modules are not part of Sprint 0; the model merely avoids preventing them.

## 7. Traceability direction

Returnability and product provenance are orthogonal. Every relevant packaged quantity must preserve:

```text
raw material lot(s)
 -> Batch/Gyle
 -> Packaging Event / Packaged Lot
 -> Allocation
 -> Order/Dispatch
 -> Customer
```

Small-pack assembly must preserve that same provenance through individual cans, multipacks/cases and channel sales units.

See `docs/traceability.md` for the canonical audit/recall requirements.

## 8. Sprint 0 package exit criteria

Sprint 0 package work is complete when:

1. the canonical Package schema is implemented;
2. active ViewPlan package types deterministically resolve to canonical Package records;
3. every live Product Variant resolves to exactly one Package;
4. account `one_way_only` behaviour uses canonical `Package.lifecycle`;
5. Quick Email and Availability consume the same package semantics;
6. regression checks prove branded/Firkin cask is not one-way, E-Cask/E-Keg are one-way, cans remain eligible, and normal accounts retain permitted formats;
7. no current sales UI rule depends on Sellar container naming or ViewPlan `has_inventory` to determine lifecycle;
8. temporary case/package representation does not preclude later decomposition into primary packaged units, packaging-component BOMs and channel-specific sales units.

## 9. Development guardrails

Before adding/changing an operational concept ask:

1. What Brewery Ops business concept is this?
2. Which system currently has authority for its source data?
3. Can that source be replaced without changing feature behaviour?
4. Are mappings explicit?
5. Are we preserving batch/lot provenance?
6. Are package lifecycle and procurement being treated as separate dimensions?
7. Is the role seeing only what helps complete the business outcome?
8. Can the workflow be completed without unnecessary screen hopping?
9. Is a sales unit actually an assembly of lower-level packaged units/components that should remain representable separately?

Avoid page-specific source-system logic, fuzzy commercial mappings, package-name lifecycle tests, duplicated business rules and loss of useful provenance.

## Public Sales price-list presentation

Generic and Account-specific live decorated lists consume canonical availability, effective pricing and Package labels/eligibility. They do not establish new product, inventory or ordering authority. The generic route uses the standard-price policy with no Account. Customer routes resolve a revocable opaque bearer token server-side; public output is limited to the Account display name and selling presentation. CRM records and commercial/credit snapshots remain private. Link management follows staff Account access; workspace preferences never grant permission. See [Sprint 2C live lists](./sprint-2c-live-price-lists.md).

## Sprint 3 planning boundary — 8 September 2026

Take Off Planning is a coordination view over ViewPlan-owned brew plans, batches and tank observations. Canonical local subjects have explicit source identities; plans resolve to batches through audited lineage or a Head Brewer-confirmed association. Tank 1 is the confirmed staging vessel, not physical FV occupancy. Sales requirements and Head Brewer decisions are separate local records; source changes invalidate the decision context without erasing history. This does not transfer stock, production execution or order authority. See [Sprint 3 implementation](./sprint-3-implementation-review.md).

### Take Off planning estimates — 8 September 2026

Take Off exposes canonical packaging_days on the source planning/batch snapshot, supplied by the ViewPlan adapter from product fermentation duration. The shared planning helper derives an estimated packaging date from brew date; null is unknown. This observation does not transfer Product ownership or establish batch release readiness. Canonical Package broad_format and capacity_litres drive requested volume groups: cask is non-carbonated, keg/can carbonated, other formats unclassified. These request scenarios share one source volume and remain separate from approved beer input with explicit losses.

### Cask planning formats — 8 September 2026

E-Cask (40 L), Firkin (41 L), Pin (20 L) and Pin (Flat Bottom) (20 L) are enabled as canonical Take Off planning options, even without an existing saleable variant for the selected beer. The shared database eligibility rule drives both the screen and request validation. Packages must remain active; other formats retain existing saleable-variant eligibility. This does not create Product Variants, prices or stock availability. Existing requests and Head Brewer review are preserved.

### Public upcoming-beer projection

A service-role-only price_list_coming_soon RPC reads the current Take Off source and approval context in one database snapshot. Its allow-listed result contains product presentation, approved canonical Packages and provisional dates; internal workflow records never leave this boundary. Public rendering reuses the canonical effective-price and Account package-restriction policies. This projection supplies neither stock availability nor production release authority. Invalidated approvals stop advertising formats; stale/failed source data is suppressed.

## Locally maintained product information — 9 September 2026

Confirmed direction: Brewery Ops owns published allergen, dietary and fining declarations, with beer defaults and per-Package overrides. This is a bounded presentation capability; ViewPlan still owns operational Product/Production/Inventory facts. Sales → Product information lets staff read the declarations and the Head Brewer confirm changes. Each write validates fields, checks the previous revision and records an audit event.

A missing override inherits the beer default; explicit unknown suppresses that default for the package. Store the confirmed allergen statement independently of vegan, gluten-free, lactose-free and fined/unfined status. Do not infer allergens from free-from flags, vegan status from fining, or fining from vegan status. New records start unconfirmed. The Sellar audit found package-level dietary differences, so source flags are not copied into reviewed local declarations. Source refreshes cannot overwrite these separate local tables.

Available and approved Coming soon formats display their effective package information on generic, customer-specific and internal decorated lists. Before the upcoming packaging format is confirmed, dietary details remain unconfirmed. Existing pricing, package restrictions, bearer-link privacy and approval rules remain intact. Tables: product_information and product_package_information; audit: product_information_events; migration: 20260909090000_product_information.sql. No ViewPlan connector update is required.
