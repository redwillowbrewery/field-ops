# Sprint 2A Implementation Brief — Weekly Sales Focus + Sales Home

## Business outcome

Replace the current all-account landing experience with a weekly sales workspace that matches how RedWillow actually sells.

The first version should help Sales answer:

1. What are we talking about this week?
2. Which areas are we working?
3. Who is left to contact in the initial push?
4. Which managed/key accounts have actions due?
5. What do I personally need to do today?

This is not a campaign-management, route-planning or order-capture sprint.

## Primary users

- **Sales Manager / delegate:** creates and edits the weekly sales plan.
- **Field Sales:** works from the plan and contact list.

Do not build elaborate permissions in this increment. Reuse existing user/role capability where possible and keep the permission boundary easy to harden later.

## Domain decisions

### Account remains canonical

Do not create separate customer records for territory and managed accounts.

Sales rhythm is a workflow/lens over `Account`:

- territory/day-to-day accounts participate primarily in the weekly geographic sales rhythm;
- managed/key accounts use a more account-focused rhythm and should appear through due actions rather than being forced through the weekly territory list.

Do not overload relationship status to encode this distinction.

If implementation requires an explicit property, introduce the smallest useful sales/service-model field and document it clearly. Avoid a large taxonomy.

### Weekly Sales Plan

Introduce the smallest canonical representation needed for the weekly workflow.

Suggested shape:

`weekly_sales_plans`

- `id`
- `week_start` / date range
- `title` or concise focus label
- `message` / commercial focus summary
- `status` (`draft`, `active`, `closed`) only if useful to implementation
- `created_by`
- `created_at`
- `updated_at`

Related selections should be represented relationally rather than hidden in UI-only state.

Possible related records:

`weekly_sales_plan_areas`
- plan
- territory/area reference where a canonical reference exists
- optional display label only where no canonical entity exists yet

`weekly_sales_plan_products`
- plan
- canonical Product or Product Variant reference as appropriate
- optional short sales note for the week's message

Do not copy price, package or availability values into the plan. Those remain canonical live data.

### Working contact list

The working list is operational state for the week, not a replacement Account directory.

For the first implementation it may be generated dynamically from the plan plus existing account data, or persisted if progress tracking requires it. Prefer the simplest design that can reliably represent progress.

Each included account must have an explainable inclusion reason, such as:

- selected territory/area;
- relationship status suitable for active prospecting/follow-up;
- due task/appointment;
- recent activity condition already supported by current data.

Do not invent opaque scoring.

Minimum useful progress states should remain simple. Example:

- `not_contacted`
- `contacted`
- `follow_up`
- `complete`

Only add states that correspond to real salesperson behaviour.

## Sales Home behaviour

The home page should become a weekly sales workspace, not a dashboard of everything Brewery Ops knows.

### 1. Weekly focus

Show the active/current week's:

- date range;
- commercial message/focus;
- selected products/specials;
- selected areas/territories.

Sales Manager/delegate can edit this from the same workflow without needing Mailchimp.

### 2. Initial push progress

Show a compact summary such as:

- total target accounts;
- contacted;
- remaining;
- follow-up needed.

Then show the bounded working list with enough context to choose the next action.

Useful account row/card information should be restrained, for example:

- account name;
- relationship status;
- territory/area;
- reason for inclusion or relevant due action;
- contact progress state.

Do not show litres or broad account-detail data simply because it is available.

### 3. Managed/key-account actions

Show due tasks/appointments for managed/key accounts separately from the weekly territory list.

This section should be small and action-oriented. It is not a managed-account dashboard.

### 4. My today

Surface today's appointments and due/overdue follow-ups/tasks relevant to the salesperson.

Reuse existing Task/Appointment data; do not create a second scheduling model.

### 5. Search

Keep account search prominent for known-target and exception workflows.

The full Account directory remains a separate Accounts destination.

## Account navigation

Every account surfaced from Sales Home should enter the existing canonical Account workflow.

Sprint 2A should not redesign the whole Account page; that is Sprint 2B. Only make changes required for coherent navigation from the new Sales Home.

## What not to build

Do not include:

- Mailchimp API integration or campaign sending;
- Sunday follow-up automation;
- route optimisation;
- delivery-run modelling;
- van weight/capacity calculations;
- order capture;
- AI or scoring engine;
- full managed-account workspace;
- new pricing logic;
- new availability logic;
- duplicate Product/Account/Task/Appointment models;
- generic visual redesign unrelated to the weekly workflow.

## Reuse requirements

Prefer existing canonical/services for:

- Account;
- Contact;
- Territory/location;
- relationship status;
- Product/Product Variant;
- Package;
- Availability;
- effective pricing;
- Task;
- Appointment;
- current user identity.

No UI component should call ViewPlan/Sellar directly to implement this workflow.

## Mobile behaviour

Field Sales is phone-first.

At normal phone widths:

- weekly focus is understandable without horizontal scrolling;
- working-list progress is visible near the top;
- account rows/cards are easily tappable;
- primary next actions are not hidden below oversized dashboard content;
- dialogs/forms for editing the weekly plan fit the viewport and preserve visible save/cancel actions;
- navigation back to Sales Home is predictable.

Desktop should remain usable but should not dictate the field workflow.

## Suggested implementation sequence

### Branch 1 — canonical weekly plan

Suggested branch: `feature/weekly-sales-focus`

- add minimum weekly-plan persistence;
- add area/product associations if needed;
- add simple create/edit service/actions;
- seed/create an active plan manually for testing;
- no Home redesign yet unless needed to prove the model.

Exit: a weekly plan can be created/read/edited without duplicating canonical product/availability facts.

### Branch 2 — Sales Home working list

Suggested branch: `feature/sales-home-working-list`

- replace the all-account landing behaviour;
- show current weekly focus;
- derive/show bounded territory working list;
- show progress;
- retain account search and route into Account;
- surface today's work and managed-account due actions using existing data.

Exit: a salesperson can open the app and understand this week's work without visiting Accounts first.

### Branch 3 — field polish

Suggested branch: `refactor/sales-home-mobile-polish`

- phone layout pass;
- loading/empty/error states;
- edit-form usability;
- navigation consistency;
- remove duplicate/low-value information exposed during implementation.

Exit: 2A acceptance test passes on a normal phone.

If Branch 1 and 2 are small enough to remain coherent, combining them is acceptable. Do not create branches merely for ceremony.

## Acceptance test — normal weekly setup

Given a Sales Manager/delegate on Thursday:

1. they create/select next week's plan;
2. enter a concise commercial focus;
3. select products/specials to talk about;
4. select the areas expected to be worked;
5. save the plan;
6. Sales Home shows that plan as the current sales context;
7. Sales sees a bounded list of relevant territory/day-to-day accounts;
8. the list does not contain every account in the database;
9. progress starts in an understandable state;
10. selecting an account opens the normal Account workflow.

## Acceptance test — managed account

Given a managed/key account with a due task or appointment:

1. it is visible as a due managed-account action;
2. it does not need to be inserted artificially into the territory working list;
3. opening it uses the same canonical Account page/data as any other account.

## Acceptance test — field user

Given a salesperson opening Brewery Ops on a phone during the week:

1. they can understand the week's focus quickly;
2. they can see how much of the initial push remains;
3. they can pick the next account to contact;
4. they can search directly for a known account;
5. today's due task/appointment remains visible;
6. no primary action is inaccessible because of viewport layout.

## Definition of done

Sprint 2A is done when:

- Sales Home no longer defaults to an indiscriminate all-account view;
- weekly plan creation/editing works for Sales Manager/delegate;
- territory working-list logic is explainable and bounded;
- progress through the initial push is visible;
- managed/key-account due actions remain visible in their own rhythm;
- account search remains fast;
- existing canonical services are reused;
- no Mailchimp/logistics/order-capture dependency has been introduced;
- mobile field test succeeds;
- lint/build/CI are green;
- any new domain/model decision is reflected in architecture/backlog/sprint docs.

## Future insertion points — not Sprint 2A

The weekly plan should later be able to feed:

- Mailchimp / outbound campaign content;
- Quick Email / WhatsApp messaging;
- Order Capture;
- Delivery Run planning;
- tactical spare-capacity selling;
- returnable-container collection opportunities.

Preserve these insertion points without implementing them now.
