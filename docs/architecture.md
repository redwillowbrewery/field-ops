# Brewery Ops Architecture

Status: **Canonical design reference**

This document defines the architectural principles and core business concepts for Brewery Ops. When implementation convenience conflicts with this document, prefer the architecture and update this document deliberately if the business model has genuinely changed.

## 1. North star

> **Brewery Ops owns the business truth. External systems are adapters.**

Brewery Ops must model brewery business concepts in its own canonical data model. ViewPlan, Sellar and future systems translate data into or out of that model; application features must not depend directly on the quirks, names or identifiers of an external system.

The intended migration path is:

1. **Today:** ViewPlan supplies much of the canonical master/operational data; Sellar supplies live channel availability; Brewery Ops supplies CRM/workflow.
2. **Transition:** Brewery Ops owns canonical products, packages, availability, customer activity and increasingly stock/order state. ViewPlan and Sellar become synchronisation adapters.
3. **Target:** Brewery Ops production/stock/order modules become the operational source of truth. Sellar/other commerce systems become outbound channels and ViewPlan can be retired without changing CRM/sales functionality.

## 2. Architectural principles

### 2.1 Canonical concepts first

Model the business concept before modelling an integration. Do not copy an external database schema into Brewery Ops simply because it already exists.

Examples:

- `Product` means the beer itself, not a ViewPlan row.
- `Package` means the commercial/physical package definition, not a Sellar container string.
- `Availability` means what Brewery Ops believes can be sold now, not merely the last API response from Sellar.

### 2.2 External IDs are mappings, never primary identity

Every Brewery Ops entity has its own stable ID. External identifiers are attached through explicit mapping/identity tables.

Example:

```text
Brewery Ops Product Variant UUID
    ├── ViewPlan: brew_type_id + package
    └── Sellar: variant_id
```

Never make application logic depend on a Sellar ID or ViewPlan key being Brewery Ops' own identity.

### 2.3 External systems have bounded authority

Each adapter is authoritative only for the fields/concepts it owns at that point in the migration.

Current examples:

- **ViewPlan:** product/package definitions, saleability, customer commercial pricing, returnable-container facts, historical orders, packaged-stock concepts.
- **Sellar:** current channel availability observation and channel metadata where required.
- **Brewery Ops:** CRM relationships, interactions, tasks, appointments, account preferences, canonical integration mappings.

Do not let Sellar decide package semantics (for example whether a cask is one-way). Do not let ViewPlan naming conventions leak into the sales UI.

### 2.4 Application features consume Brewery Ops services/data

Screens and workflows should ask canonical questions such as:

```text
getAvailableVariants(account)
getEffectivePrice(account, variant)
getPackageRules(variant)
getContainersAtAccount(account)
```

They should not independently call Sellar or interpret ViewPlan fields.

### 2.5 Mappings must be explicit where correctness matters

For commercial availability and pricing, exact mappings beat fuzzy/name matching.

Name matching is acceptable for diagnostics or historical association where no stable identifier exists, but must not silently determine the currently saleable product/variant.

### 2.6 Stock and availability are different concepts

Ultimately Brewery Ops should distinguish:

```text
physical_quantity
allocated_quantity
held_quantity
available_quantity
```

Availability is derived business state. A channel's reported availability is an observation/input, not necessarily physical stock.

### 2.7 Source replacement must not change feature behaviour

A successful adapter boundary means replacing Sellar or ViewPlan changes the integration implementation, not Availability, Quick Email, Price List, CRM or order-capture screens.

### 2.8 Prefer observable syncs over hidden magic

Every integration should expose:

- last successful sync/check time;
- source system;
- row/object counts where useful;
- failures without destroying the previous valid snapshot;
- enough diagnostic information to audit mappings.

### 2.9 Safe reconciliation

Full reconciliation jobs must not wipe known-good canonical data if an upstream source unexpectedly returns zero/unmapped data. Abort and preserve the previous snapshot when source/mapping sanity checks fail.

### 2.10 One definition per business rule

Rules such as package returnability, product saleability, customer effective price and availability should be calculated in one canonical place and reused. Avoid parallel implementations on different screens.

### 2.11 Frictionless by default

Brewery Ops is used by busy people in operational contexts. The UI should prioritise speed, clarity and confidence over feature density.

Practical rules:

- one obvious primary action per screen where possible;
- common actions in one or two taps;
- progressive disclosure for uncommon/advanced settings;
- mobile-first layouts for field and operational roles;
- no duplicate controls merely because multiple features exist;
- sensible defaults from account/user context;
- show enough system state to build confidence without adding noise;
- users should not need to understand ViewPlan, Sellar, mappings or other internal implementation details.

### 2.12 Role-centric views over one shared model

Different users should see the information required for their job, not the whole canonical model.

Role-specific screens are **lenses over shared Brewery Ops data**, not separate systems or duplicate records.

Examples:

- **Driver:** location, number/type of empties, collection/delivery priority, delivery window, access notes, call-ahead requirement, navigation and a fast way to record observations.
- **Salesperson:** contacts, status, current availability, customer pricing, recent interactions/orders, tasks and quick communication/order actions.
- **Bar manager:** beer on line, remaining stock, full containers in cellar, ordering needs and cellar tasks.
- **Production/warehouse:** batch, packaged stock, allocation, location, holds and container state.

A role should generally not see information that does not help the immediate decision or action.

### 2.13 Operational observations feed shared account knowledge

Role-centric simplicity must not create information silos. A driver, salesperson or other user should be able to capture concise observations in context, and those observations should enrich the canonical Account/Interaction knowledge for other authorised roles.

Examples from a delivery/collection visit:

```text
Customer asks us to call 20 minutes before delivery.
Rear-yard access only before 11:00.
Pub closed on Mondays.
Manager says they may want a guest pale next month.
Four additional empty casks seen in cellar.
```

Capture should be very low friction: short note, optional structured observation type, timestamp, user/role and account. Where an observation represents durable operational knowledge (for example delivery access or call-ahead), it should be promotable into a structured account preference rather than remaining buried in a timeline.

## 3. Canonical domain model v1

### Account

A business/customer/prospect we have a commercial relationship with.

Owns CRM/commercial preferences such as relationship status and container preference. It will also accumulate durable operational knowledge such as delivery/access preferences where those concepts become structured.

### Contact

A person associated with an Account. Contacts may have roles, contact details and a primary designation.

### Product

The beer/product identity independent of packaging.

Examples: `Wreckless`, `Amarillo Porter`, `Dreaming of El Dorado`.

Do not encode batch/gyle numbers such as `F241 -` into canonical product identity unless they are genuinely part of the commercial product name.

### Package

A first-class definition of how product is packaged/sold.

Expected properties include:

```text
id
name
broad_format          cask | keg | can | bottle | other
capacity_litres
container_model       returnable | one_way | none
draught
active
```

Examples:

| Package | Broad format | Container model |
| --- | --- | --- |
| Firkin | cask | returnable |
| Pin | cask | returnable |
| E-Cask | cask | one_way |
| 30L Steel | keg | returnable |
| 50L Steel | keg | returnable |
| E-Keg | keg | one_way |
| Key Keg | keg | one_way |
| 12 x 440ml cans | can | none |

Package semantics must come from the current brewery master-data authority (ViewPlan today; Brewery Ops production/stock module later), not Sellar naming.

### Product Variant

A sellable combination of Product + Package (and any future commercially meaningful variant attributes).

Examples:

```text
Amarillo Porter + Firkin
Amarillo Porter + E-Cask
Amarillo Porter + E-Keg
Amarillo Porter + 12 x 440ml cans
```

### Batch / Gyle

A production instance of a Product.

This becomes central when Brewery Ops gains production functionality.

```text
Product -> Batch/Gyle -> packaged stock -> Product Variant
```

A batch identifier is not a Product identity.

### Container

An individually tracked reusable physical asset.

Examples: a numbered Firkin or steel keg owned by RedWillow.

One-way packages do not normally create a returnable Container asset.

### Stock

Physical packaged quantity owned/controlled by the brewery, associated with Product Variant and (where required) Batch/location.

### Allocation

Stock committed/reserved to an order or other purpose.

### Availability

The quantity/status Brewery Ops is prepared to offer for sale now.

Availability can be derived from Stock - Allocation - Holds. Until Brewery Ops owns that calculation, external channel availability can populate an availability observation/cache.

### Price List

Canonical base commercial prices by Product Variant/package and price-list code.

### Account Pricing

Customer-specific pricing rules, exact overrides, package rules, formula-based pricing and discounts.

The effective price is a calculated Brewery Ops concept. The UI should not reimplement formula evaluation.

### Order

A customer's commercial commitment to purchase Product Variants at quantities/prices.

Orders should eventually drive allocation and availability.

### Interaction

A logged customer contact/activity: call, visit, email or other meaningful interaction.

Interactions should support later analysis of contact -> subsequent order outcomes.

### Observation

A concise operational fact captured by a user in context, normally linked to an Account and optionally to an Interaction/Visit/Delivery/Collection.

Observations may be transient timeline knowledge or candidates for promotion into durable structured account attributes.

Likely fields/concepts:

```text
account_id
observation_type
text
source_role
created_by
created_at
promoted_to_attribute nullable
```

### Task

A follow-up action owned by a user and optionally linked to an Account/Interaction/Order.

### Appointment

A planned customer interaction/visit.

### Returnable Movement

A movement/state change for a returnable Container: dispatched, at customer, collected, returned, lost, blocked, etc.

## 4. Integration boundaries

### ViewPlan adapter (current)

Current mapping direction:

| ViewPlan concept | Brewery Ops concept |
| --- | --- |
| `tblCustomer` | Account |
| customer contacts | Contact |
| `tblBrew_Type` | Product |
| brew type + packaging rows | Product Variant |
| `tblPackaging_Type_List` | Package |
| `tblPackaging_Inventory` | Container |
| `tblImport_Product_Map.ecom_trade2_variant_id` | Sellar external identity bridge |
| customer price lists/rules | Price List / Account Pricing |
| orders/order items | Order / Sales history |
| packaging inventory history | Returnable Movement |

Important: ViewPlan is READ ONLY from Brewery Ops connectors during the migration phase.

### Sellar adapter (current)

| Sellar concept | Brewery Ops concept |
| --- | --- |
| product/variant ID | External identity for Product Variant |
| available quantity | Availability observation |
| storefront metadata | Channel metadata only where needed |
| channel orders (future) | Order import/channel source |

Sellar does **not** define canonical Product, Package, returnability or customer price semantics.

## 5. Availability architecture

Target near-term flow:

```text
Sellar adapter
    -> exact Sellar/Product Variant mapping
    -> canonical availability snapshot/cache
    -> Brewery Ops availability service
    -> Availability / Quick Email / Price List / Order Capture
```

The screens must not call Sellar directly once this layer exists.

### Adaptive refresh policy

Availability observations can be cached more aggressively at healthy stock levels and refreshed more frequently when scarce.

Initial policy to test:

| Cached available qty | Suggested max age |
| ---: | ---: |
| 20+ | 30-60 min |
| 6-19 | 10-15 min |
| 1-5 | 2-5 min |
| 0 | 5-10 min |

A final order/commit action should force a sufficiently fresh availability check.

The exact thresholds are configuration/policy, not UI logic.

### Availability record direction

Likely fields:

```text
product_variant_id
available_quantity
physical_quantity       nullable during channel-derived phase
allocated_quantity      nullable/0 initially
held_quantity           nullable/0 initially
source_system
source_checked_at
expires_at
status/confidence
updated_at
```

## 6. Account container preference

An Account may restrict draught packages to `one_way_only`.

This preference must filter on the canonical Package `container_model`, not Sellar container strings or ad-hoc package-name checks.

Cans/non-returnable packaged goods are not returnable-container restrictions and remain eligible.

## 7. Reporting principles

Sales reporting should favour useful business outcomes over activity counts.

Key planned concepts:

- interaction -> order within 7/14/30 days;
- median time from contact to order;
- revenue following contact;
- conversion by interaction type and salesperson;
- dormant/lapsed reactivation rate and revenue;
- comparison with normal/customer baseline behaviour.

Use wording such as **"order within 14 days of contact"** until causal attribution is justified. Association is not automatically causation.

## 8. Development guardrails

Before adding an integration-dependent feature, ask:

1. What Brewery Ops business concept is this?
2. Does that canonical concept already exist?
3. Which system currently has authority for the input data?
4. Can that source be replaced without changing the feature?
5. Are we adding an explicit mapping, or relying on names?
6. Are we duplicating a business rule already implemented elsewhere?
7. Which role needs this information/action, and what can be hidden from them?
8. Can useful observations from this workflow enrich shared account knowledge?

Avoid:

- page-specific Sellar API calls;
- fuzzy mapping for current commercial availability;
- hard-coded package-name tests in sales UI;
- using ViewPlan/Sellar IDs as canonical IDs;
- creating a second effective-pricing implementation;
- overwriting valid snapshots after obviously failed source reconciliation;
- exposing every available field/action to every role;
- creating role-specific copies of Account/Product/Stock data instead of role-specific views.

## 9. Decisions still to prove

The following are intentionally unresolved until audited:

- Which exact ViewPlan field(s) in `tblPackaging_Type_List` authoritatively identify returnable vs one-way packages.
- Final Package schema and migration from `product_variants.package_type` text.
- Exact stock/allocation model required for the Brewery Ops production module.
- Order ownership/authoritative write path during migration from ViewPlan/Sellar.
- Which operational observations deserve first-class structured Account attributes (delivery windows, access, call-ahead, etc.) versus remaining timeline observations.

Record the evidence and update this document when those decisions are made.
