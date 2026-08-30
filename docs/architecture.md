# Brewery Ops Architecture

Status: **Canonical design reference**

This document defines the architectural principles and core business concepts for Brewery Ops. When implementation convenience conflicts with this document, prefer the architecture and update this document deliberately if the business model has genuinely changed.

## 1. North star

> **Brewery Ops owns the business truth. External systems are adapters.**

Brewery Ops must model brewery business concepts in its own canonical data model. ViewPlan, Sellar and future systems translate data into or out of that model; application features must not depend directly on the quirks, names or identifiers of an external system.

## 2. Architectural principles

### 2.1 Canonical concepts first
Model the business concept before modelling an integration.

### 2.2 External IDs are mappings, never primary identity
Every Brewery Ops entity has its own stable ID. External identifiers attach through explicit mappings.

### 2.3 External systems have bounded authority
ViewPlan currently supplies much brewery master/operational data; Sellar supplies channel observations; Brewery Ops owns the canonical business semantics and workflow.

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

### 2.13 Operational observations feed shared account knowledge
Low-friction observations captured in context should enrich shared Account knowledge and, where durable, be promotable into structured attributes.

## 3. Canonical domain model v1

### Account
A business/customer/prospect we have a commercial relationship with.

### Contact
A person associated with an Account.

### Product
The beer/product identity independent of packaging and batch/gyle.

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

A time-bounded sales-workflow lens over canonical Accounts, Territories and Products. It stores the week's concise commercial focus and relational selections, but never copies price, package or availability facts. Product selection uses canonical commercial eligibility (an active Product with at least one saleable Product Variant), not current availability, because a weekly focus may legitimately pre-sell stock that has not yet been packaged.

Territory-service accounts in selected Territories form an explainable, bounded working list. Per-plan Account progress (`not_contacted`, `contacted`, `follow_up`, `complete`) is operational workflow state rather than Account identity or relationship status. Managed accounts stay outside the territory push and surface through their canonical due Tasks and Appointments.

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
