# Brewery Ops Workflow Design Principles

Status: **Canonical product/workflow reference**

This document complements `docs/architecture.md`. It defines how Brewery Ops should turn canonical business concepts into low-friction, end-to-end operational workflows.

## 1. North star: complete the business outcome, not the screen

> **A user should be able to complete a real business task with minimal navigation, re-entry or module switching.**

Brewery Ops should be designed around the outcome the user is trying to achieve, not around the internal boundaries of Sales, Production, Warehouse, Logistics or Finance modules.

A task may span several canonical concepts and operational teams. The system should carry context and trigger downstream work automatically rather than forcing the initiating user to understand or manually visit each subsystem.

Examples:

- A salesperson receiving a future order should be able to see what can be supplied now and what is expected from the brew/packaging schedule, capture the order, and leave the system to create the relevant production/warehouse/logistics implications.
- A driver arriving at a customer should see the delivery/collection task, access notes and empties, capture an observation, and finish the stop without navigating through the sales CRM.
- A bar manager completing a stock take should be able to record stock state and have that feed ordering/replenishment decisions without separately updating another system.

## 2. Context should flow with the task

Once a workflow starts, Brewery Ops should retain the relevant context:

```text
Account
Order / intended fulfilment date
Product Variant(s)
Quantity
Pricing
Availability / forecast availability
Packaging requirement
Delivery method / route
Operational notes
Responsible roles
```

Do not ask a later step to re-select the customer, product, date or quantities when those facts are already known.

## 3. Cross-functional workflow example: distributor future order

Reference scenario:

> A distributor calls today to place an order required in two weeks.

The desired Brewery Ops workflow is:

```text
Customer calls sales
    ↓
Open Account / start Order
    ↓
See:
  - available stock now
  - expected availability by requested date
  - brew schedule / beer in tank
  - customer's one-way packaging constraint
  - effective customer price
    ↓
Capture order for delivery date
    ↓
Brewery Ops evaluates fulfilment
    ├── packaged stock sufficient
    └── future packaging required from beer in tank / planned batch
            ↓
      packaging demand updated
            ↓
Relevant production/warehouse demand becomes visible
    ↓
Approaching fulfilment date
    ├── sales reminder / exception if supply risk
    ├── production/packaging reminder
    ├── warehouse pick/pack job
    └── logistics requirement
            ↓
Pallet shipment booked through carrier adapter
    ↓
Booking/tracking details linked to Order
    ↓
Warehouse job updated with pallet/collection details
    ↓
Dispatch
    ↓
Order / stock / container / customer timeline updated
```

The salesperson should not have to leave the order workflow to manually create production notes, warehouse tasks or pallet-booking context.

## 4. Workflow orchestration, not hidden coupling

End-to-end workflows must still respect the canonical architecture.

The order workflow should coordinate canonical services/concepts such as:

```text
Order
Availability
Forecast Availability
Allocation
Batch / Brew Schedule
Packaging Requirement
Warehouse Job
Shipment
Task / Notification
Account
Interaction
```

It should **not** become one giant page that directly knows ViewPlan tables, Sellar APIs and a pallet carrier API.

External actions remain adapters:

```text
Brewery Ops Shipment
    ↓
Pallet carrier adapter
    ↓
Carrier booking / label / tracking
```

Replacing the carrier later should not change the order or warehouse workflow.

## 5. Progressive orchestration

Do not wait for every future module before delivering workflow value.

Implement workflows progressively:

1. Show the relevant information together.
2. Carry context between steps.
3. Create canonical downstream tasks automatically.
4. Replace tasks with direct module integration when that module exists.
5. Replace external authorities with Brewery Ops-owned services without changing the initiating workflow.

Example during migration:

```text
Order captured
    ↓
create Packaging Task
```

Later:

```text
Order captured
    ↓
canonical packaging requirement recalculated automatically
```

The user-facing workflow need not change.

## 6. Exceptions should surface; routine work should disappear

Routine downstream coordination should happen automatically where it is safe and deterministic.

Users should be interrupted primarily for decisions and exceptions:

- insufficient expected stock;
- brew/packaging timing cannot meet requested date;
- one-way package requirement cannot be satisfied;
- price/credit approval required;
- carrier booking unavailable or unusually expensive;
- warehouse cannot meet collection window.

Prefer:

> `Order due Friday — all supply and logistics ready.`

or

> `Order due Friday — 6 E-Casks short. Packaging decision required.`

rather than requiring a user to inspect five modules to discover the state themselves.

## 7. Role hand-offs should be explicit but lightweight

A workflow can cross roles without exposing every role's interface to everyone.

For the distributor-order example:

- **Sales** owns customer/order intent and exceptions requiring customer conversation.
- **Production** sees demand against batches/tanks and packaging deadlines.
- **Warehouse** sees pick/pack/despatch work and physical handling requirements.
- **Driver/logistics** sees route/collection/delivery details.
- **Management** sees readiness, risks and bottlenecks.

All roles operate on the same canonical Order and related entities.

## 8. Forecast availability is a distinct concept

Future orders require more than current availability.

Brewery Ops should eventually answer:

```text
What can we sell now?
What do we expect to have on <date>?
What production/packaging work is required to make that true?
```

This implies a future canonical concept/service such as `ForecastAvailability`, derived from:

- current stock;
- allocations / existing orders;
- beer in tank;
- planned batches;
- packaging schedule/yield;
- holds/quality status;
- expected losses or safety buffers.

Forecast availability must be distinguishable from confirmed physical availability.

## 9. Derived operational demand

Orders should eventually drive downstream requirements rather than relying on humans to notice them.

Examples:

```text
Order demand
    -> allocation demand
    -> packaging demand
    -> production demand / exception
    -> warehouse work
    -> shipment requirement
```

These should be canonical relationships/events, not copied notes between modules.

## 10. UI design rules for end-to-end workflows

When implementing a workflow:

- keep the initiating business object visible throughout (for example Account + Order);
- surface the next meaningful action rather than every possible action;
- allow in-place completion of small dependent actions where safe;
- use drawers/inline sections/progressive disclosure before sending users to separate screens;
- avoid requiring users to remember facts between screens;
- preserve drafts/context if a specialist screen genuinely must be opened;
- return the user to the workflow state they came from;
- show readiness and exceptions clearly;
- do not expose internal integration terminology.

## 11. Workflow design test

Before considering a cross-functional feature complete, ask:

1. What real-world outcome is the user trying to complete?
2. How many separate screens/modules must they enter?
3. What information are they being asked to enter twice?
4. Which downstream actions can Brewery Ops derive automatically?
5. Which decisions genuinely require another role?
6. Can those hand-offs become tasks/notifications against the same canonical object?
7. Are routine steps automated while exceptions remain visible?
8. If ViewPlan, Sellar or the carrier were replaced, would the workflow remain essentially unchanged?

## 12. Strategic implication

Brewery Ops should evolve as a **full-stack operational workflow system**, not a collection of departmental applications.

Modules remain useful boundaries for architecture, permissions and specialist work. They should not become navigation boundaries that users are forced to traverse to complete ordinary business tasks.
