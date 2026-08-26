# Brewery Ops Traceability & Audit Lineage

Status: **Canonical requirement**

This document defines a non-negotiable Brewery Ops requirement: traceability and auditability must run through the entire operational system, independently of whether packaging is returnable.

## Principle

> **Every material, product and significant business action should have provenance: what, which batch/lot, who, when, where and why.**

Container returnability and product traceability are separate concerns. A package may be one-way and therefore have no reusable `Container` asset to recover, but Brewery Ops must still know which Product and Batch/Gyle was packaged, sold and dispatched to which customer.

Auditability is broader still: Brewery Ops should be able to reconstruct how a product was made and handled, which raw-material lots were consumed, which people performed or authorised significant actions, when those actions happened, and what downstream product/customer records were affected.

## End-to-end lineage

The target traceability graph is:

```text
Supplier
  -> Raw Material
  -> Supplier Lot / Brewery Lot
  -> Goods Receipt / QC / Release
  -> Raw Material Stock
  -> Material Consumption
  -> Batch / Gyle
  -> Production / Process Events
  -> Packaging Event
  -> Packaged Lot / Stock
  -> Allocation
  -> Order Line
  -> Dispatch / Shipment
  -> Account / Customer
```

Each significant transition should carry audit context such as:

```text
performed_by
performed_at
location
source / device / integration
reason / reference where relevant
recorded_at
amended_by / amended_at where relevant
```

The aim is not to create paperwork. Normal operational actions should generate this audit evidence automatically as a consequence of doing the job.

## Raw-material traceability

Raw materials must ultimately be lot/batch traceable where applicable, including malt, hops, yeast, adjuncts, processing aids and packaging materials where recall/quality relevance warrants it.

A receipt should preserve, as appropriate:

```text
supplier
material
supplier_lot_number
brewery_lot / receipt identity
quantity
unit
received_at
received_by
best_before / expiry
COA / specification reference
QC / quarantine / release status
stock_location
purchase_order / delivery reference
```

Consumption must connect the exact material lot(s) to the Batch/Gyle or other production activity that consumed them.

Therefore Brewery Ops must be able to answer both:

```text
Raw material lot X
  -> which batches used it?
  -> which packaged lots resulted?
  -> which customers received them?
```

and:

```text
Finished beer / Batch X
  -> exactly which raw-material lots went into it?
```

## Product and batch traceability

Examples:

- Firkin: returnable physical container **and** batch/customer traceability.
- 30L steel keg: returnable physical container **and** batch/customer traceability.
- E-Cask: no returnable container asset required, but **full batch/customer traceability remains mandatory**.
- E-Keg / Key Keg: no returnable container asset required, but **full batch/customer traceability remains mandatory**.
- Cans/cases: no returnable container asset, but **full batch/customer traceability remains mandatory**.

Brewery Ops must ultimately be able to traverse both directions:

```text
Product
  -> Batch / Gyle
  -> Packaging Event
  -> Packaged Stock / Lot
  -> Product Variant
  -> Order Line
  -> Dispatch / Shipment
  -> Account / Customer
```

and for recall:

```text
Batch / Gyle
  -> all packaged lots
  -> all order/dispatch lines
  -> every Account/customer that received affected product
  -> quantity, package, dispatch date and shipment reference
```

The reverse query is equally important:

```text
Customer + delivered product
  -> dispatch
  -> order line
  -> packaged lot
  -> Batch / Gyle
  -> production events
  -> consumed raw-material lots
  -> supplier/receipt
```

## Canonical concepts

### Material

A canonical raw material or packaging material used by the brewery.

### Material Lot

An identifiable lot/batch of a Material received or produced. This is the core upstream traceability identity.

### Material Movement / Consumption

A stock movement that records receipt, transfer, adjustment, quarantine/release, consumption or disposal. Consumption links Material Lot to Batch/Gyle or another operational activity.

### Batch / Gyle

A production instance of a Product. This is the primary production traceability identity.

### Production Event

A meaningful action or state transition in producing a Batch/Gyle, for example mash-in, ingredient addition, transfer, yeast pitch, fermentation action, dry hop, QC release or other process event. The exact event vocabulary will evolve with the production module.

Production events should record who performed the action and when, and link relevant material lots, equipment/location, measurements and source records where appropriate.

### Packaging Event

An event that converts bulk beer from a Batch/Gyle into packaged stock. It should capture at minimum:

```text
batch_id
product_variant_id
package_id
packaging_date
quantity
stock_location
lot / take-off / packaging reference where applicable
best_before where applicable
performed_by
performed_at
```

A Packaging Event is required for both returnable and one-way packages.

### Packaged Lot / Stock Provenance

Packaged stock must retain its Batch/Gyle provenance. Stock totals alone are insufficient if they merge quantities from multiple batches without preserving lineage.

Where stock from more than one Batch can exist for the same Product Variant, allocation/dispatch must preserve which batch/lot supplied the order line, using FIFO/FEFO or an explicit warehouse choice according to future policy.

### Dispatch Line

A dispatch must identify the exact Product Variant, quantity and source Batch/Lot(s) sent to the Account.

This link must survive external system replacement. ViewPlan order IDs, Sellar IDs or carrier references may be stored as external identities, but they are not the canonical traceability chain.

### Container

A `Container` is an individually tracked reusable physical asset. It is relevant to returnable logistics, but it is **not** the mechanism by which product traceability is guaranteed.

A one-way package can therefore have:

```text
Container asset: none
Batch traceability: required
```

### Audit Event

Significant actions should be attributable without every domain model having to invent its own incompatible audit mechanism.

Likely common audit concepts include:

```text
actor_user_id       nullable for system/integration actions
actor_type          user | system | integration
action
target_type
target_id
occurred_at
source
reason/reference    nullable
before/after or change metadata where appropriate
correlation/workflow id where appropriate
```

Domain records remain the business truth; the audit event records who/what changed or performed something and when.

## Corrections and history

Traceability records should generally not be silently overwritten in a way that destroys history.

Where an operational record is corrected, the system should preserve enough information to determine:

```text
original value/action
corrected value/action
who made the correction
when
reason where required
```

This does not mean every typo requires a heavyweight approval workflow. Audit depth should be proportionate to the business significance of the action.

## Recall capability

The target Brewery Ops recall workflow should support:

1. start from a finished-product Batch/Gyle, packaged lot, raw-material lot, supplier lot or relevant date/reference;
2. traverse upstream and downstream lineage;
3. identify every affected packaged quantity;
4. identify every customer/order/dispatch that received it;
5. show quantities and package formats still believed to be with each customer where knowable;
6. identify internal stock, work in progress and allocations not yet dispatched;
7. generate a recall/contact worklist for authorised users;
8. record contact/outcome/return/destruction actions against the recall;
9. preserve the complete recall and decision audit trail.

Recall readiness is not a future optional reporting feature; it is a design constraint on purchasing, materials, stock, production, packaging, allocation, order and dispatch data models.

## Integration boundary

### Current phase

ViewPlan remains the current authority for much of batch, material, packaging and order/dispatch history. Brewery Ops adapters must preserve enough identifiers and relationships to reconstruct lineage rather than importing only aggregate totals.

As Sprint 0 audits ViewPlan concepts, audits should look not only for the current value/state but also for provenance fields and history: IDs, dates/times, operators/users, material lot/batch numbers, transaction/history tables and relationships between them.

### Target phase

Brewery Ops owns Materials/Lots, movements/consumption, Batch/Gyle, Production Events, Packaging Events, packaged-stock provenance, Order, Allocation, Dispatch and operational audit lineage. External commerce, accounting, carrier and other systems become adapters and cannot break the canonical traceability chain.

## Development guardrails

Before designing or changing an operational concept, ask:

1. **What happened?**
2. **What product/material/asset did it happen to?**
3. **Which batch/lot was involved?**
4. **Who performed or authorised it?**
5. **When did it happen?**
6. **Where did it happen, if relevant?**
7. **What upstream records caused it?**
8. **What downstream records did it affect?**
9. **If corrected, can we still reconstruct the original event?**
10. **Could we traverse this information quickly during a recall or investigation?**

Two standing tests apply:

> **If Batch X had to be recalled tomorrow, can this design identify every customer that received it and every raw-material lot that went into it?**

> **If someone asks six months later why a stock, production, order or dispatch state changed, can we determine who/what changed it, when and from which workflow/source?**

If either answer is no, the design is incomplete.
