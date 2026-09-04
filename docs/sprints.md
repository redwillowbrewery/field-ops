# Brewery Ops Sprint & Branch Roadmap

This document turns [`architecture.md`](./architecture.md) and [`backlog.md`](./backlog.md) into bounded delivery increments.

## Delivery principles

- **Each sprint has one business outcome.** Avoid a sprint becoming a collection of unrelated tickets.
- **Each branch has one coherent technical goal.** Prefer small reviewable branches over long-lived feature branches.
- **`main` stays deployable.** Work lands through short-lived branches and should not knowingly leave production in a broken intermediate state.
- **Architecture before convenience.** Every sprint starts by checking the relevant canonical concepts and integration boundaries in `architecture.md`.
- **Vertical slices where practical.** A useful slice should include canonical data/service behaviour and the minimum UI needed to prove it.
- **External systems remain adapters.** New UI must not deepen direct ViewPlan/Sellar coupling.
- **User feedback can reprioritise the next sprint, not silently corrupt the current sprint goal.** Urgent fixes are exceptions and should remain bounded.
- **Refactoring is planned work.** UI/domain cleanup should have explicit acceptance criteria rather than being indefinitely postponed.

## Branch convention

Use short-lived branches from `main`:

```text
sprint/<number>-<goal>          optional sprint integration branch only when needed
feature/<concept>-<outcome>     normal product/domain work
fix/<area>-<problem>            production bug
refactor/<area>-<goal>          behaviour-preserving structural work
audit/<source>-<question>       read-only discovery/audit work
```

Default: branch directly from current `main`, merge a coherent feature, then delete the branch. Avoid maintaining a permanent `develop` branch.

A sprint integration branch is only useful when several dependent branches genuinely need to be tested together before reaching `main`.

## Definition of done

A change is done when:

1. the business outcome/acceptance criteria are met;
2. canonical concepts remain consistent with `architecture.md`;
3. source authority and mappings are explicit;
4. no new page-specific external-system business logic has been introduced;
5. mobile/busy-user workflow has been considered;
6. failure states preserve known-good data where relevant;
7. lint/build/CI are green;
8. architecture/backlog/sprint docs are updated if the decision changed the model;
9. the deployed result can be tested by the intended user role.

---

# Sprint 0 — Stabilise the foundation

**Goal:** finish the architectural corrections already uncovered so subsequent features build on canonical package and availability concepts.

Primary backlog: P0.1–P0.3.

Suggested branches:

- `audit/viewplan-package-semantics`
- `feature/canonical-packages`
- `feature/account-container-rules`

Outcomes:

- authoritative ViewPlan package semantics documented;
- canonical `Package` exists;
- Product Variants reference canonical Package;
- returnable/one-way behaviour is canonical rather than Sellar-name logic;
- account `one_way_only` preference behaves consistently across Availability, Quick Email and Price List.

**Sprint exit:** we can replace Sellar package naming without changing customer-facing package behaviour.

# Sprint 0B — Canonical availability

**Goal:** Brewery Ops becomes the single application-facing source of availability even while Sellar remains the upstream observation source. This Canonical Availability increment completes the Sprint 0 foundation started by canonical packages.

Primary backlog: P1.1–P1.3.

Suggested branches:

- `feature/availability-snapshot`
- `feature/availability-service`
- `feature/adaptive-availability-refresh`
- `refactor/availability-consumers`

Outcomes:

- Sellar adapter writes exact-mapped availability observations to Brewery Ops;
- canonical availability service/cache exists;
- Availability and Quick Email consume the same service;
- freshness/source state is visible;
- adaptive refresh reduces unnecessary Sellar calls;
- low-stock/order commitment can demand fresher data;
- stale-but-valid snapshots survive temporary upstream failure.

**Sprint exit:** disconnecting the Sellar API changes freshness, not the structure of sales screens.

# Sprint 2 — Field Sales Workflow

**Primary users:** Field Sales, with Sales Manager/delegate responsible for setting the weekly plan.

**Goal:** Brewery Ops follows the way RedWillow actually sells: agree the week's commercial focus, target the areas being worked, complete the initial sales push, then use the rest of the week to follow up, fill delivery gaps and recover returnable containers without losing sight of managed/key accounts.

This is deliberately a workflow sprint rather than a broad CRM expansion. It should simplify and connect capabilities that already exist before Order Capture or full logistics are added.

## Business rhythm

The normal territory/day-to-day sales cycle is:

**Thursday planning → Friday broad communication → Sunday reminder → Monday onward targeted contact → follow-up → tactical gap-filling**

Typical behaviour:

- on Thursday the Sales Manager or delegate decides what RedWillow wants to say/offer the following week based on availability, specials and commercial priorities;
- the broad message currently goes through Mailchimp on Friday morning with a follow-up on Sunday;
- once weekend trade has happened, most day-to-day accounts know what they have sold and what they need;
- sales then works geographically useful call/contact lists using email, phone and occasionally WhatsApp;
- once the initial push is substantially complete, attention shifts to delivery-route gaps, spare vehicle capacity and useful container collections in the same areas.

Mailchimp, route optimisation and van-capacity calculation are not Sprint 2 dependencies. Sprint 2 establishes the canonical workflow that those later capabilities can enrich.

## Two sales rhythms over one Account model

Brewery Ops keeps one canonical `Account`. Sales rhythm is a workflow/lens over that Account, not a separate customer record.

Two important rhythms are recognised:

1. **Territory/day-to-day trade accounts** — driven primarily by the weekly plan, geography, contact list and tactical follow-up.
2. **Managed/key accounts** — larger house/company accounts with a more account-focused rhythm based on relationship context, ongoing requirements, agreed pricing/products, issues, opportunities and due actions.

Do not encode this distinction by duplicating Account data or by overloading relationship status. A lightweight sales/service-model property may be introduced when implementation requires it, but Sprint 2 should avoid elaborate permissions or taxonomy.

## Shared surface responsibilities

- **Sales Home:** what should I/we be selling and working this week?
- **Accounts:** find/show me a customer.
- **Account:** what matters about this customer and what should I do next?
- **Availability:** what can I sell them?
- **Interaction/Task:** what happened and what comes next?
- **Map:** who is useful around here?

## Sprint 2A — Weekly Sales Focus + Sales Home

**Status: COMPLETE — 4 September 2026.**

**Goal:** replace the indiscriminate all-account landing page with a weekly sales workspace that reflects RedWillow's actual selling rhythm.

Delivered capability includes:

- Sales Manager/delegate weekly plan creation/editing;
- weekly commercial focus, current Product selection and territory selection;
- canonical current-product lifecycle imported from ViewPlan, including active/sellable/BeX semantics;
- bounded territory/day-to-day working lists rather than the complete account database;
- weekly contact progress;
- explainable filtering by territory and open work;
- managed-account due actions kept separate from the territory list;
- account search and direct navigation;
- actionable account context including primary contact and latest order date;
- mobile-oriented Sales Home workflow.

The comprehensive account directory remains the responsibility of **Accounts** and is not duplicated on Sales Home.

**Sprint exit achieved:** Sales can open Brewery Ops and understand the week's commercial focus, selected areas and remaining initial-push work without starting from an indiscriminate list of every account.

See [`sprint-2a-weekly-sales-focus.md`](./sprint-2a-weekly-sales-focus.md) for the implementation brief and accepted domain decisions.

## Sprint 2B — Account Selling Flow

**Status: NEXT.**

**Goal:** make the Account the fast customer-selling workspace for both territory and managed-account rhythms.

Suggested branch:

- `refactor/account-selling-flow`

Account detail should answer, in order:

1. **Who are they?** Name, relationship status, territory/service rhythm and useful primary contact context.
2. **What matters now?** Due follow-up/appointment, recent activity, package restriction and compact customer knowledge.
3. **What can I sell them?** Canonical availability plus effective customer price.
4. **What should I do?** Obvious high-frequency call/email/WhatsApp/visit/follow-up actions.

Outcomes:

- Account page has a clear information hierarchy instead of an expanding button bank;
- secondary actions use progressive disclosure;
- available Product Variants can be understood with package, available quantity and effective customer price;
- availability freshness remains visible;
- account package/container rules apply automatically;
- selecting products can flow naturally into Quick Email without restarting the task;
- Quick Email remains canonical and account-aware;
- internal Sellar/ViewPlan terminology is absent from normal sales UI.

Acceptance:

- salesperson can go from Account to "what can I sell this customer and at what price?" with minimal navigation;
- territory and managed accounts can use the same Account page without duplicated customer models;
- preparing a customer availability email does not require reselecting information already established in the workflow;
- pricing/package/availability logic is not duplicated in page code;
- primary actions remain usable on a phone.

## Sprint 2C — Interaction + Follow-up

**Goal:** recording useful sales activity is quick enough that it happens consistently, preparing clean operational data for later contact → order intelligence.

Suggested branch:

- `refactor/sales-interaction-follow-up`

Outcomes:

- call, email, WhatsApp and visit actions are easy to initiate/log where useful;
- simple outcomes such as spoke/no answer/left message can be captured with optional notes where appropriate;
- visit logging is short and mobile-friendly;
- creating the next task/follow-up is a natural continuation of logging the interaction;
- working-list progress can reflect that contact has occurred;
- avoid building Sprint 3 analytics prematurely, but do not create structures that conflict with the planned canonical `Interaction` direction.

Acceptance:

- salesperson can record a contact/visit outcome and optional follow-up in a few seconds on a phone;
- existing timeline/activity information remains coherent;
- the workflow does not require unnecessary CRM form completion;
- a completed interaction can advance the relevant weekly working-list state without duplicating customer data.

## Sprint 2D — Tactical Sales + Field Pass

**Goal:** once the initial weekly push is complete, help sales exploit the areas/routes already being worked and field-test the whole workflow on mobile.

Suggested branch:

- `refactor/tactical-mobile-sales-workflow`

Initial tactical behaviour should support the practical questions:

- who useful is nearby or in an area already being visited?
- which current/cooling/prospect accounts in that area have not ordered/contacted recently?
- which accounts in the same area have meaningful returnable containers outstanding?

Use existing map/location/account/container information where available. Do **not** make Sprint 2 depend on canonical Delivery Run, vehicle load, weight/capacity calculations or route optimisation.

Architectural principle to preserve for later logistics work:

> **A delivery run remains a commercial and container-recovery opportunity until it closes.**

Future Order Capture + Delivery Runs + vehicle/load data can later enrich this tactical view with actual planned orders, route geometry and spare weight/capacity.

Acceptance:

- after the initial push, a salesperson can identify plausible additional sales or collection opportunities in an area being worked;
- recommendations remain explainable from existing account/location/container data;
- Map remains the broader location exploration tool rather than a duplicate CRM;
- appointments/tasks/accounts link cleanly through the mobile workflow;
- navigation/back behaviour, dialogs, sticky actions and tap targets work at normal phone widths;
- no primary action is inaccessible because of viewport layout;
- no premature route optimisation or vehicle-capacity model is introduced.

## Explicitly out of Sprint 2

- Order Capture.
- Sales effectiveness/contact → order reporting.
- Full driver workflow.
- Canonical Delivery Run/Service Pattern implementation.
- Vehicle weight/capacity calculation.
- Route optimisation.
- Mailchimp integration or campaign sending.
- Production/warehouse screens.
- Elaborate role/permission infrastructure.
- AI/opaque next-best-account scoring.
- Major new CRM capabilities unrelated to the core sales workflow.
- Broad visual redesign for its own sake.

## Sprint 2 field-test exit

The sprint is complete when sales can use Brewery Ops through a normal RedWillow sales week to:

1. create/understand the week's commercial focus and areas;
2. work through a bounded territory contact list;
3. keep managed/key-account actions visible in their account-focused rhythm;
4. open an Account and understand the customer's current context;
5. see what they can buy and their effective price;
6. contact or visit the customer;
7. record what happened and create the appropriate follow-up;
8. move on to the next useful customer;
9. after the initial push, identify sensible additional sales/container opportunities in areas already being worked;

without needing to understand ViewPlan/Sellar implementation details and without UI friction becoming the dominant field-test feedback.

This workflow also leaves a clean insertion point for future Order Capture: the existing Account → Product Variant + availability + effective price flow can gain **Add to order** rather than creating a separate stock/pricing workflow.

# Sprint 3 — Customer contact → order intelligence

**Goal:** answer whether calls/visits/emails are associated with subsequent customer orders.

Primary backlog: sales/orders connector and interaction reporting.

Suggested branches:

- `feature/order-history-sync`
- `feature/canonical-interactions`
- `feature/sales-effectiveness-reporting`

Outcomes:

- automated incremental ViewPlan order/order-line history sync;
- canonical Interaction captures meaningful customer contact consistently;
- reporting shows order within 7/14/30 days, time-to-next-order and revenue after contact;
- analysis supports salesperson, interaction type and relationship-status segmentation;
- reporting distinguishes association from causation.

**Sprint exit:** management can use Brewery Ops to evaluate contact activity against commercial outcomes without manual exports.

# Sprint 4 — Driver / returnables operational slice

**Goal:** turn the successful Returns Near Me prototype into a role-specific dray workflow informed by field trial feedback.

Suggested branches:

- `feature/driver-stop-view`
- `feature/account-observations`
- `feature/returnable-priority`

Outcomes:

- driver sees only operationally relevant stop information: location, delivery/collection window, empties, call-ahead/access notes and primary actions;
- driver can capture lightweight observations at the stop;
- observations feed shared Account knowledge;
- durable observations can later be promoted into structured account attributes;
- return collection suggestions account for count/age/detour once field evidence supports the policy.

**Sprint exit:** dray team can use a simple role-specific workflow without needing the sales CRM interface.

# Sprint 5 — Lightweight order capture

**Goal:** allow sales to turn current availability + effective customer price into a safe order intent.

Suggested branches:

- `feature/order-draft`
- `feature/order-availability-check`
- `feature/order-handoff`

Outcomes:

- select canonical Product Variants and quantities;
- use the same effective-price service as price/availability screens;
- respect account package/container rules;
- sufficiently fresh availability check before commitment;
- safe handoff to the current authoritative order-processing path;
- no premature duplication of full ViewPlan order logic.

**Sprint exit:** a salesperson can capture a useful order without creating a second inconsistent stock/pricing implementation.

# Sprint 6+ — Brewery Ops operational core

After the CRM/field workflows are stable, begin replacing ViewPlan bounded authorities deliberately rather than cloning ViewPlan wholesale.

Likely sequence:

1. Product + Batch/Gyle production model.
2. Packaging events and canonical packaged stock.
3. Stock movement ledger and locations.
4. Allocation/holds.
5. Brewery Ops-derived availability.
6. Order authority migration.
7. ViewPlan adapter retirement one boundary at a time.

Each of these should become its own sprint/epic once requirements are sufficiently understood.

---

## Sprint planning ritual

At the start of each sprint:

1. Confirm the **business outcome** and primary user role.
2. Re-read the relevant architecture section.
3. Identify canonical concepts affected.
4. State current and target source authority.
5. Split work into small branches with explicit acceptance criteria.
6. Identify what user feedback will prove the sprint successful.

At the end of each sprint:

1. Demo/test with the intended users.
2. Capture feedback as business requirements rather than immediately coding every suggestion.
3. Ask whether the sprint reduced or increased architectural coupling.
4. Update `architecture.md` for genuine domain decisions.
5. Reprioritise `backlog.md` and the next sprint.

## Current recommendation

**Sprint 2A is complete. Proceed with Sprint 2B — Account Selling Flow.** Base 2B on the current `main` implementation: simplify the Account action hierarchy and connect the existing canonical Availability + effective pricing flow to Quick Email without duplicating pricing, package or availability logic.