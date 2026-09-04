# Sprint 2B Implementation Brief — Account Selling Flow

## Status

**NEXT after completed Sprint 2A.**

## Business outcome

Make the Account page the normal customer-selling workspace, so a salesperson can understand the customer, see what can be sold at that customer's price, contact them, and prepare a useful availability email without jumping between a bank of unrelated feature buttons.

The Account remains the canonical customer surface for both territory/day-to-day and managed/key-account rhythms.

## Current implementation observations

Sprint 2B should improve the current `main` implementation rather than build a parallel workflow.

Current Account detail already contains useful canonical context:

- relationship status;
- classification/location/territory;
- contacts and primary contact;
- package/container preference;
- open tasks and upcoming appointments;
- sales summary and latest order date;
- returnable container context;
- timeline;
- direct call/email/navigation actions.

The current header also exposes a broad action bank:

- Add note;
- Availability;
- Price list;
- Quick email;
- Appointment;
- Log visit;
- Call;
- Email;
- Navigate.

That is the principal UX problem for this sprint.

Current Account Availability is already a strong canonical selling surface: it combines Brewery Ops availability, canonical package eligibility, availability freshness and effective customer price. Quick Price Email independently retrieves substantially the same availability/pricing inputs and then presents its own product list.

Sprint 2B should connect these existing capabilities rather than introduce another product/pricing implementation.

## Primary user

**Field Sales** on phone first, while remaining usable for office/managed-account sales.

## Core workflow

**Account → understand customer → see current saleable variants + their price → choose what to discuss/send → contact or prepare Quick Email → continue with interaction/follow-up**

Sprint 2B ends before the full interaction/outcome workflow; that is Sprint 2C.

## Information hierarchy

The Account page should answer these questions in this order.

### 1. Who are they?

Keep immediately visible:

- Account name;
- relationship status;
- territory / sales-service rhythm where useful;
- town/location;
- primary contact and useful phone/email;
- one-way/package restriction when present.

Do not surface internal source-system status prominently in normal sales use unless it genuinely helps the salesperson make a decision.

### 2. What matters now?

Show compact actionable context such as:

- next appointment;
- open/due follow-up;
- latest order date;
- recent useful activity;
- important package restriction;
- concise customer/account knowledge.

Avoid turning this into a management dashboard.

### 3. What can I sell them?

This is the primary selling capability.

Reuse the existing canonical Account Availability inputs:

- `getAccountAvailability` / shared availability service;
- canonical Package and account container preference;
- effective customer pricing;
- availability freshness/stale-good behaviour;
- canonical Product Variant identity and presentation data.

The salesperson should be able to understand:

- Product;
- package;
- current available quantity;
- effective customer price;
- useful ABV/short description where it aids selling.

List price is secondary. The customer's effective price is the important field in normal selling use.

### 4. What should I do?

Keep high-frequency actions obvious:

- Call;
- Email;
- Log visit;
- prepare/send availability/price email;
- create follow-up/appointment where needed.

Lower-frequency actions belong behind progressive disclosure or inside the section to which they relate.

## Action hierarchy

Do not retain nine equivalent-looking top-level actions.

Suggested hierarchy, subject to implementation fit:

### Primary actions

- **Call** when a phone number exists.
- **Email / Send availability** depending on context.
- **Log visit** when field-selling context makes it useful.

### Contextual actions

- Appointment/follow-up near the current-work section.
- Manage contacts within Contact section.
- Package/account settings next to the relevant account metadata.
- Sales history within sales context.
- Containers within container context.

### Overflow / More

Use a compact lower-frequency menu or secondary-action area for operations that do not deserve persistent header space.

Do not add a large generic CRM menu simply to relocate the button bank.

## Canonical selling dataset

Sprint 2B should avoid the current pattern where Availability and Quick Email independently reconstruct very similar rows.

Create or reuse the smallest shared account-selling service/view-model that can provide, per eligible Product Variant:

- variant ID;
- Product identity/name;
- Product presentation needed for sales;
- canonical Package and broad format;
- available quantity;
- effective customer price;
- list price where useful;
- availability observation/freshness state.

The service should apply account package eligibility once.

Do not create a new persistence table merely for the UI if an application/service composition is sufficient.

## Availability / product selection flow

The existing Availability page can remain a dedicated detailed screen if useful, but the Account selling flow should make it feel like a continuation of the Account rather than an unrelated destination.

Minimum useful behaviour:

1. salesperson opens Account;
2. enters the selling/availability area;
3. sees customer-eligible current available variants with effective price;
4. filters by Cask/Keg/Can or search if needed;
5. selects the specific variants they want to communicate;
6. chooses **Send availability** / Quick Email;
7. selected variants carry forward into the email preparation step;
8. recipient defaults from canonical primary/active Account contact;
9. email preview shows exactly the selected canonical variants and their effective customer prices.

Do not make the salesperson reselect products after moving from availability to Quick Email.

## Quick Email changes

Quick Email is an action from the selling workflow, not a separate catalogue.

Current behaviour selects only broad formats (Cask/Keg/Can) and includes every currently available priced row in each chosen format. Sprint 2B should support carrying explicit variant selection from the Account selling flow.

Keep the existing simple format filters where useful, but explicit selected variants should be preserved when entering Quick Email.

Quick Email should continue to:

- use canonical package labels;
- respect account package preference;
- use effective customer pricing;
- show availability freshness/stale warning where relevant;
- default the best known active customer email address;
- use the existing outbound mechanism for now unless a separate approved change replaces it.

Do not build Microsoft 365 send integration in this sprint merely because Quick Email currently opens `mailto:`.

## Account page cleanup

Refactor the page around the four questions above rather than around database entities or existing routes.

Likely changes:

- reduce the header action bank;
- elevate primary contact and immediate actions;
- keep due work visible without large lists dominating the page;
- surface a compact selling/availability entry with freshness and useful summary;
- move Account settings/package preference to contextual placement;
- retain Timeline as supporting history rather than the first sales decision;
- retain Sales and Container summaries where they help account context;
- keep detailed child routes available where depth is useful.

Do not rewrite the entire Account domain or delete useful existing routes simply for visual cleanliness.

## Territory vs managed accounts

Both sales rhythms use the same Account page and canonical data.

Territory/day-to-day accounts typically emphasise:

- latest order;
- current products/price;
- quick contact;
- weekly selling action.

Managed/key accounts may need stronger visibility of:

- next action/appointment;
- relationship context;
- ongoing notes/issues/opportunities;
- sales history.

Use conditional emphasis where existing `sales_service_model` makes that useful, but do not create separate Account pages.

## Mobile requirements

At normal phone widths:

- Account identity and primary contact/action are visible quickly;
- no horizontal action bar or wrapped wall of buttons;
- current selling/availability action is obvious;
- effective price and package can be read without awkward tables;
- selected products can be moved into Quick Email without losing state;
- back navigation returns predictably to Account/Sales Home;
- lower-frequency detail does not push primary selling action several screens down unnecessarily.

## Explicitly out of Sprint 2B

Do not add:

- Order Capture;
- Mailchimp integration;
- Microsoft 365 direct sending unless separately approved;
- route optimisation;
- delivery runs / van capacity;
- sales effectiveness reporting;
- full canonical Interaction/outcome model;
- AI next-best-action scoring;
- duplicate pricing logic;
- duplicate availability logic;
- duplicate package eligibility logic;
- a separate managed-account customer model.

## Suggested implementation sequence

### 2B.1 — Shared account-selling data

Suggested branch: `refactor/account-selling-data`

- inspect current Availability, Quick Email and Price List consumers;
- extract/reuse a shared account-selling composition over canonical availability + effective pricing + package eligibility;
- preserve stale-good/freshness semantics;
- add focused tests around package preference and effective price.

Exit: Availability and Quick Email can consume the same canonical selling-row definition without duplicating business rules.

### 2B.2 — Account hierarchy

Suggested branch: `refactor/account-selling-flow`

- restructure Account page around Who / What matters / What can I sell / What next;
- remove button-bank presentation;
- preserve existing useful detail routes;
- keep primary actions phone-friendly;
- ensure Sales Home → Account navigation remains coherent.

Exit: salesperson can understand and act from Account without scanning a toolbar of unrelated features.

### 2B.3 — Selection → Quick Email

Suggested branch: `feature/account-availability-email-flow`

- add explicit Product Variant selection to the selling/availability flow;
- carry selected variant IDs into Quick Email;
- preserve customer/account context;
- render only selected eligible canonical variants in preview;
- handle empty/stale/unavailable selections cleanly.

Exit: salesperson does not reselect products when preparing an availability email.

### 2B.4 — Mobile field pass

Suggested branch: `refactor/account-selling-mobile-polish`

- test normal phone widths;
- check loading/empty/stale/error states;
- check navigation/back behaviour;
- remove low-value visual clutter exposed by field testing.

Combine branches where the changes remain coherent; branch boundaries are not ceremony.

## Acceptance test — normal territory account

Given a current territory account with a primary contact, effective pricing and eligible current availability:

1. salesperson opens the Account from Sales Home;
2. Account identity, status and useful primary contact are immediately understandable;
3. current available products and customer-effective price are easy to reach;
4. account package preference is automatically respected;
5. salesperson selects specific products;
6. chooses Send availability / Quick Email;
7. selected products carry into the email preview;
8. recipient defaults sensibly;
9. salesperson does not need to reselect products or re-establish the Account;
10. returning from the workflow preserves a predictable Account/Sales navigation path.

## Acceptance test — one-way-only account

Given an Account with `container_preference = one_way_only`:

1. selling rows exclude brewery-returnable packages according to canonical package semantics;
2. the Account shows the restriction clearly but without dominating the screen;
3. Availability and Quick Email show the same eligible variant set;
4. no page uses package-name string matching to implement the rule.

## Acceptance test — managed account

Given a managed/key account with an open task or upcoming appointment:

1. the same canonical Account page is used;
2. due account work is prominent enough to understand what needs attention;
3. availability/effective pricing remains accessible without changing customer model;
4. the account is not forced into the territory-weekly workflow to use selling functions.

## Definition of done

Sprint 2B is done when:

- Account no longer presents a flat bank of competing top-level feature buttons;
- Account hierarchy answers Who / What matters / What can I sell / What next;
- current availability + effective customer price reuse one canonical selling composition;
- account package eligibility is applied consistently;
- availability freshness remains visible where selling decisions depend on it;
- selected Product Variants can flow into Quick Email without reselection;
- Quick Email remains account-aware and canonical;
- both territory and managed-account rhythms use the same Account model/page;
- phone workflow is field-usable;
- lint/build/CI are green;
- no Order Capture, logistics, Mailchimp or duplicated source-system business logic is introduced.

## Handoff to Sprint 2C

Sprint 2B should leave obvious hooks for Sprint 2C to attach contact outcomes and follow-up creation to Call / Email / WhatsApp / Visit actions. Do not fully implement that interaction model here.