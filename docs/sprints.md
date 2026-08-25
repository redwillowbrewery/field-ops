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

# Sprint 1 — Canonical availability

**Goal:** Brewery Ops becomes the single application-facing source of availability even while Sellar remains the upstream observation source.

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

# Sprint 2 — Sales workflow polish + UI simplification

**Goal:** make the existing field-sales workflows demonstrably fast and uncluttered before adding more capabilities.

Primary backlog: Quick Email hardening, account/activity UX and planned UI refactor.

Suggested branches:

- `refactor/account-role-actions`
- `refactor/mobile-sales-workflow`
- `feature/quick-email-polish`

Outcomes:

- account page has a clear information hierarchy rather than an expanding button bank;
- common sales actions require minimal taps;
- secondary actions use progressive disclosure;
- Quick Email is fast, canonical and account-aware;
- mobile layout is treated as the primary operational layout;
- internal ViewPlan/Sellar terminology is absent from normal sales UI.

**Sprint exit:** sales team can field-test the core account → availability/price → contact/follow-up workflow without UI friction becoming the dominant feedback.

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

Start with **Sprint 0** rather than opening several future feature branches. We have already proven substantial CRM, pricing, availability and returnables functionality; the highest-leverage next step is to remove the remaining package/integration ambiguity before building the availability abstraction on top of it.
