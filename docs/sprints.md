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

# Sprint 0B — Canonical availability (current increment)

**Goal:** Brewery Ops becomes the single application-facing source of availability even while Sellar remains the upstream observation source. This is the current Canonical Availability increment and completes the Sprint 0 foundation started by canonical packages.

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

# Sprint 2 — Field sales workflow

**Primary user:** Field Sales.

**Goal:** opening Brewery Ops immediately tells a salesperson where their attention is needed, and the existing account → availability/price → contact → follow-up workflow is fast enough to use as the normal field-sales tool.

This is deliberately a usability and workflow sprint rather than a broad CRM expansion. It should simplify and connect capabilities that already exist before Order Capture or further operational roles are added.

Primary backlog: P2.1/P2.4 role-centric UX foundation, P6.1 Quick Email hardening and P6.3 account/activity UX.

Core workflow:

**find/choose customer → understand customer → see what they can buy and their price → contact/visit → record outcome → create follow-up → move to next customer**

The three main sales surfaces have distinct jobs:

- **Sales Home:** what should I do next?
- **Accounts:** find/show me a customer.
- **Map:** who is useful around here?

## Sprint 2A — Sales Home + Account Focus

**Goal:** fix the front door first. The landing page must stop behaving as an unfiltered list of every account and instead focus attention on actionable sales work.

Suggested branch:

- `refactor/sales-home-account-focus`

Sales Home should prioritise existing deterministic operational signals rather than introduce a speculative scoring engine.

Initial sections/capabilities:

- **Today:** today's appointments plus tasks/follow-ups that are due or overdue.
- **Opportunities:** useful prospects, lapsed/dormant accounts and cooling accounts requiring attention, using existing relationship/activity data where the recommendation is defensible.
- **Nearby:** a concise entry into location-based selling, with the Map remaining the broader exploration tool.
- **Search:** prominent account search for the common case where the salesperson already knows who they need.

Do not show every account simply because it exists. The comprehensive account directory remains the responsibility of **Accounts**.

Account detail should become the salesperson's customer workspace and answer, in order:

1. **Who are they?** Name, relationship status, territory and useful primary contact context.
2. **What matters now?** Due follow-up/appointment, recent activity, package restriction and compact useful customer knowledge.
3. **What can I sell them?** Clear access to canonical availability and effective customer pricing.
4. **What should I do?** Obvious high-frequency contact/visit/follow-up actions.

Avoid an expanding top-level button bank. Keep high-frequency actions obvious and move lower-frequency operations behind progressive disclosure where practical.

Acceptance:

- opening Brewery Ops does not present an indiscriminate all-account list;
- today's due work and appointments are immediately visible;
- a known account can be found quickly;
- opportunities shown on Sales Home have an explainable reason for appearing;
- the complete account directory remains available separately;
- account detail has a clear information/action hierarchy on a phone;
- no new external-system terminology or page-specific ViewPlan/Sellar business logic is introduced;
- existing canonical package, pricing and availability rules are reused.

## Sprint 2B — Selling flow

**Goal:** Availability, effective price and Quick Email feel like one customer-selling workflow rather than unrelated destinations.

Suggested branch:

- `refactor/account-selling-flow`

Outcomes:

- from an Account, available Product Variants can be understood with package, available quantity and effective customer price;
- availability freshness remains visible;
- account package/container rules apply automatically;
- selecting relevant products can flow naturally into Quick Email without restarting the task;
- Quick Email remains canonical and account-aware;
- decorated/undecorated price outputs reuse the same pricing and availability services;
- internal Sellar/ViewPlan terminology is absent from normal sales UI.

Acceptance:

- salesperson can go from Account to "what can I sell this customer and at what price?" with minimal navigation;
- preparing a customer availability email does not require reselecting information already established in the workflow;
- pricing/package/availability logic is not duplicated in page code.

## Sprint 2C — Interaction + follow-up flow

**Goal:** recording useful sales activity is quick enough that it happens consistently, preparing clean operational data for later contact → order intelligence.

Suggested branch:

- `refactor/sales-interaction-follow-up`

Outcomes:

- call and visit actions are prominent where useful;
- simple outcomes such as spoke/no answer/left message can be captured with optional notes where appropriate;
- visit logging is short and mobile-friendly;
- creating the next task/follow-up is a natural continuation of logging the interaction;
- avoid building the full Sprint 3 analytics model prematurely, but do not create new data structures that conflict with the planned canonical `Interaction` direction.

Acceptance:

- salesperson can record a call or visit outcome and optional follow-up in a few seconds on a phone;
- existing timeline/activity information remains coherent;
- the workflow does not require unnecessary CRM form completion.

## Sprint 2D — Today, Map + mobile field pass

**Goal:** connect the day's work and location context, then test the complete workflow on the device it is intended for.

Suggested branch:

- `refactor/mobile-sales-workflow`

Outcomes:

- appointments and due follow-ups on Sales Home link directly into the relevant Account workflow;
- Map supports the practical question "who useful is near me?" using existing status/location information;
- avoid premature route optimisation or complex next-best-account scoring;
- navigation/back behaviour is consistent across Account child workflows;
- complete mobile pass for overflow, dialogs, sticky actions, tap targets and unnecessary navigation;
- desktop remains usable without driving the field-sales design.

Acceptance:

- a salesperson with spare time in an area can identify a plausible nearby account to visit;
- today's appointment/task can be opened and completed without navigating through unrelated screens;
- core workflow works cleanly at normal phone widths;
- no primary action is inaccessible because of viewport/dialog layout.

## Explicitly out of Sprint 2

- Order Capture.
- Sales effectiveness/contact → order reporting.
- Driver workflow and returnable collection workflow.
- Production/warehouse screens.
- Route optimisation.
- Mailchimp integration.
- Elaborate role/permission infrastructure.
- Major new CRM capabilities unrelated to the core field workflow.
- Broad visual redesign for its own sake.

## Sprint 2 field-test exit

The sprint is complete when a salesperson can use Brewery Ops during a normal field-sales day to:

1. open the app and understand what needs attention;
2. find/select an account;
3. understand the customer's current context;
4. see what they can buy and their effective price;
5. contact or visit the customer;
6. record what happened;
7. create the appropriate follow-up;
8. move on to the next useful customer;

without needing to understand ViewPlan/Sellar implementation details and without UI friction becoming the dominant field-test feedback.

This workflow should also leave a clean insertion point for future Order Capture: the existing Account → Product Variant + availability + effective price flow can later gain **Add to order** rather than creating a separate stock/pricing workflow.

# Sprint 3 — Customer contact → order intelligence

**Goal:** answer whether calls/visits/emails are associated with subsequent customer orders.

Primary backlog: P2.1–P2.3.

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

Primary backlog: P4 plus role-centric UI/Observation work.

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

Primary backlog: P3.1 and prerequisites for P3.2.

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

Complete **Sprint 0B Canonical Availability** before opening Sprint 2 feature branches. Once Sprint 0B has passed deployment/reconciliation and stale-but-valid operational verification, start Sprint 2 with **2A Sales Home + Account Focus** and field-test each increment before adding further capability.
