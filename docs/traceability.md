# Brewery Ops Product & Batch Traceability

Status: **Canonical requirement**

This document defines a non-negotiable Brewery Ops requirement: product/batch traceability must be maintained independently of whether packaging is returnable.

## Principle

> **Container returnability and product traceability are separate concerns.**

A package may be one-way and therefore have no reusable `Container` asset to recover, but Brewery Ops must still know which Product and Batch/Gyle was packaged, sold and dispatched to which customer.

Examples:

- Firkin: returnable physical container **and** batch/customer traceability.
- 30L steel keg: returnable physical container **and** batch/customer traceability.
- E-Cask: no returnable container asset required, but **full batch/customer traceability remains mandatory**.
- E-Keg / Key Keg: no returnable container asset required, but **full batch/customer traceability remains mandatory**.
- Cans/cases: no returnable container asset, but **full batch/customer traceability remains mandatory**.

## Required lineage

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
```

## Canonical concepts

### Batch / Gyle

A production instance of a Product. This is the primary production traceability identity.

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

## Recall capability

The target Brewery Ops recall workflow should support:

1. select affected Batch/Gyle (or packaged lot / best-before range);
2. identify every affected packaged quantity;
3. identify every customer/order/dispatch that received it;
4. show quantities and package formats still believed to be with each customer where knowable;
5. identify internal stock and allocations not yet dispatched;
6. generate a recall/contact worklist for authorised users;
7. record contact/outcome/return/destruction actions against the recall;
8. preserve an audit trail.

Recall readiness is not a future optional reporting feature; it is a design constraint on stock, packaging, allocation, order and dispatch data models.

## Integration boundary

### Current phase

ViewPlan remains the current authority for much of batch, packaging and order/dispatch history. Brewery Ops adapters must preserve enough identifiers and relationships to reconstruct lineage rather than importing only aggregate stock totals.

### Target phase

Brewery Ops owns Batch/Gyle, Packaging Event, packaged-stock provenance, Order, Allocation and Dispatch. External commerce/carrier systems become adapters and cannot break the canonical traceability chain.

## Development guardrail

Before changing stock, packaging, allocation, order or dispatch models, ask:

> **If Batch X had to be recalled tomorrow, can this design identify every customer that received it without relying on container returnability or a manual spreadsheet?**

If the answer is no, the design is incomplete.
