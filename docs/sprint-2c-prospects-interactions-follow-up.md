# Sprint 2C Implementation Brief — Prospects, Interaction + Follow-up

## Status

**NEXT while Sprint 2B is in sales-team field testing.**

Do not treat Sprint 2B as closed until field feedback has been reviewed. Genuine 2B defects may be fixed while 2C is prepared, but avoid expanding 2B scope merely because 2C work has started.

## Business outcome

Make Brewery Ops own the commercial relationship before the first order, and make recording customer/prospect contact quick enough that Sales actually does it.

The normal loop should be:

**find/create Account → contact → record what happened → create next action when needed → move on**

For a new lead in the field:

**spot/find prospect → Add Prospect → Account → contact/visit → outcome → follow-up → eventually become trading customer**

This is deliberately not a broad CRM expansion. It consolidates existing prospect, visit, note, task, appointment and provisional interaction behaviour around the canonical Account model.

## Architectural decisions

### Brewery Ops owns prospects

A prospect is a canonical `Account`, not a separate Prospect entity.

An Account may exist in Brewery Ops without a ViewPlan customer identity. ViewPlan must not determine whether a commercial relationship is allowed to exist in Brewery Ops.

Brewery Ops owns the pre-customer workflow:

- Account identity for Brewery Ops-only prospects;
- relationship state `prospect`;
- CRM-only Contacts;
- location and territory;
- assigned salesperson;
- Interactions;
- Tasks/follow-ups;
- Appointments;
- Account knowledge/notes.

ViewPlan remains **read only from Brewery Ops** during the current migration. Sprint 2C must not add a Brewery Ops → ViewPlan customer write merely to support prospect conversion.

When a prospect becomes a trading customer, the same canonical Account must continue. The later ViewPlan customer identity is attached to it rather than creating a second Brewery Ops Account.

### External identity is optional

`accounts.brewery_customer_id` / ViewPlan external identity is not Account identity.

A Brewery Ops-only prospect is valid with no ViewPlan mapping. Features that genuinely require ViewPlan-derived commercial data may be unavailable until a mapping exists, but normal CRM workflow must still work.

### Prospect is relationship state, not a parallel model

Continue using canonical Account relationship states. Do not create `prospects`, `leads` or `opportunities` tables simply to distinguish pre-customer Accounts.

An opportunity may become a useful future concept if RedWillow later needs to track a specific potential deal independently of the Account; that is not required for Sprint 2C.

### Interaction, Task and Appointment are distinct

- **Interaction** — something that happened.
- **Task** — something that needs to happen.
- **Appointment** — something scheduled to happen at a particular time.

Do not collapse these into one generic activity record.

A completed Interaction may naturally create a Task or Appointment, but they retain separate identities and lifecycle.

## Current implementation audit

Sprint 2C must evolve what already exists rather than build a parallel CRM.

### Prospect creation already exists

`/prospects/new` already creates a normal row in `accounts` with:

- `relationship_status = prospect`;
- current user as `assigned_rep_id`;
- address/location/contact fields;
- optional primary CRM-only Contact;
- optional captured latitude/longitude;
- redirect into the normal Account page.

This is directionally correct and should be retained/refined rather than replaced.

### Account schema already permits Brewery Ops-only Accounts

The canonical Account ID is a Brewery Ops UUID. `brewery_customer_id` is nullable. The initial relationship-state enum already contains `prospect`.

This supports the target architecture without creating a separate prospect table.

### ViewPlan sync already preserves some CRM ownership

The ViewPlan customer sync upserts by ViewPlan customer ID and deliberately does not overwrite canonical CRM-owned relationship state on update. CRM-only Contacts without ViewPlan contact slots are also preserved.

However, if a Brewery Ops-created prospect later appears in ViewPlan with a new ViewPlan customer ID, current sync behaviour can insert a second Account because the source upsert is keyed by `brewery_customer_id`.

Sprint 2C therefore needs an explicit reconciliation/conversion boundary. Do not solve this with silent fuzzy name matching.

### Visits are already structured

`visits` currently records Account, optional Contact/Appointment, salesperson, timestamps, notes, outcome and location. Existing visit logging can create a Task follow-up and complete an Appointment.

This is useful behaviour. Sprint 2C should decide how Visit relates to canonical Interaction rather than throwing it away.

### Tasks and Appointments already exist

Tasks already support Account, Contact, Visit, assignee, type, title, notes, due time and status.

Appointments already support Account, Contact, assignee, start/end, purpose, status and notes.

Reuse these concepts. Do not create a second follow-up table.

### Current generic interaction logging is provisional

The existing `/api/accounts/[id]/interactions` endpoint accepts only `call` or `email`, writes a formatted string such as `[call] target` into `account_notes`, and can set weekly progress to `contacted`.

This is a useful UX spike but is not the target canonical Interaction model. Sprint 2C should replace/consolidate this behaviour rather than treating formatted Account notes as structured interaction data.

### Account notes remain useful

Free-text Account notes/knowledge should not disappear merely because Interaction becomes canonical. A note is useful durable/contextual knowledge; an Interaction is an event in time.

Do not mechanically migrate every historic note into an Interaction unless semantics are clear.

## 2C.0 — Discovery and migration design

Before changing schema, inspect the current implementations and real data for:

- `account_notes`;
- `visits`;
- `tasks`;
- `appointments`;
- `/api/accounts/[id]/interactions`;
- Account timeline composition;
- Quick Email preparation logging;
- weekly-sales progress updates;
- prospect creation from form/map;
- ViewPlan customer/external-ID reconciliation.

Document the chosen consolidation/migration approach in this brief or `docs/architecture.md` if implementation discoveries materially change the domain decision.

Prefer compatibility/migration over destructive rewrites.

Exit: Codex can explain which existing records remain as-is, which become canonical Interaction producers, and how the Account timeline will present them coherently.

## 2C.1 — Brewery Ops-owned prospect workflow

### Minimum field workflow

Creating a prospect in the field should remain deliberately lightweight.

Required:

- Account name.

Useful optional fields:

- classification;
- location/address/postcode;
- map/current-position latitude/longitude;
- contact name;
- contact phone/email;
- short note;
- territory where known or safely derived.

Defaults:

- relationship state = `prospect`;
- active = true;
- assigned rep = current user;
- source/audit context retained where the existing model supports it.

Do not require ViewPlan customer number, pricing information, full billing detail or other trading-customer administration to capture a lead.

### Entry points

Preserve/add prospect creation where it naturally occurs, especially:

- Map;
- Accounts/search when the organisation cannot be found;
- Sales workflow where useful.

Do not create a separate heavyweight Prospects application area unless field testing demonstrates a need.

### Duplicate prevention

Before creating a new prospect, provide lightweight duplicate awareness using explainable Brewery Ops data such as:

- similar/exact Account name;
- postcode/address;
- phone/email;
- nearby Account where location is known.

Do not automatically merge Accounts based only on fuzzy name similarity.

The salesperson should be able to recognise an existing Account and open it instead.

## 2C.2 — Prospect → ViewPlan customer reconciliation boundary

This sprint must make the ownership boundary safe even though Brewery Ops does not write customers to ViewPlan.

Required behaviour:

1. Brewery Ops prospect can exist indefinitely without ViewPlan identity.
2. CRM activity on that Account remains Brewery Ops-owned.
3. If/when the prospect becomes a trading customer, the ViewPlan customer is created through the existing operational process outside Brewery Ops.
4. Brewery Ops provides a safe way to associate that ViewPlan identity with the existing canonical Account.
5. Subsequent ViewPlan sync updates ViewPlan-owned fields on that same Account.
6. Contacts/interactions/tasks/appointments/notes/history remain attached to the original canonical Account.
7. The next connector run must not create a duplicate Account for a mapping that has already been explicitly established.

Implementation may use an explicit reconciliation/admin action, staging exception, or existing `account_external_ids` mapping machinery. Choose the smallest auditable solution consistent with the connector architecture.

Do **not** silently auto-link an incoming ViewPlan customer to a Brewery Ops prospect solely by name.

If a probable match is detected, surface it for explicit reconciliation.

## 2C.3 — Canonical Interaction

Introduce or clarify the smallest canonical Interaction representation needed by Sales.

Minimum semantic fields:

- stable Interaction ID;
- Account ID;
- optional Contact ID;
- actor/salesperson;
- channel/type;
- outcome where meaningful;
- optional short note;
- occurred-at timestamp;
- source/context where useful, e.g. account, weekly_sales, visit, quick_email;
- optional link/reference to source object where this prevents duplication.

### Initial channels

Support the channels RedWillow actually uses:

- call;
- email;
- WhatsApp;
- visit.

Keep channel separate from outcome.

### Initial outcomes

Do not hard-code a large generic CRM taxonomy. Start with a small set that helps the next action, for example:

- contacted / spoke;
- no answer;
- left message;
- no requirement;
- follow-up required.

Exact labels should be easy to refine after sales-team feedback. Avoid modelling `email` or `WhatsApp` as outcomes when they are channels.

Not every channel needs every outcome. Do not force meaningless fields merely for schema uniformity.

### Visit relationship

Do not create duplicate history where a visit is both a `visits` row and an unrelated Interaction row with copied text.

Choose and document one coherent approach, for example:

- Visit remains the richer visit record and produces/links to one canonical Interaction event; or
- Interaction becomes the common event and Visit is specialised detail linked one-to-one.

Preserve existing visit data and follow-up behaviour.

### Historic account notes

Keep historic free-text notes as notes unless there is deterministic evidence that a record represents a specific interaction. Timeline may compose Notes + Interactions + Visits/Tasks/Appointments during transition.

## 2C.4 — Contact → outcome → follow-up UX

The interaction workflow must be phone-first and fast enough to use immediately after a call/visit.

Normal flow:

1. salesperson is already on Weekly Sales or Account;
2. initiates/has a call, email, WhatsApp or visit;
3. records the interaction with one or two taps plus optional note;
4. optionally chooses a follow-up;
5. follow-up creates the existing canonical Task or Appointment as appropriate;
6. returns to the Account/weekly list and moves on.

Do not require a full CRM form.

### Follow-up

Common follow-up should be extremely easy, e.g.:

- tomorrow;
- later this week;
- next week;
- choose date;
- appointment when a fixed meeting/time is agreed.

Use existing Task/Appointment concepts. A follow-up should not be stored only as prose inside the Interaction note.

### Contact selection

Where an Account has Contacts, allow the salesperson to associate the Interaction with the person actually contacted without making Contact mandatory.

If the salesperson meets a new person during a visit, preserve the existing useful ability to add that Contact in context.

## 2C.5 — Weekly Sales integration

Weekly Sales progress should increasingly reflect actual activity rather than requiring duplicate checklist maintenance.

Minimum rule:

- a qualifying Interaction originating from/associated with the active weekly plan can move `not_contacted` → `contacted`.

Do not automatically mark an Account `complete` merely because contact occurred.

If the Interaction creates an outstanding follow-up, `follow_up` may be the appropriate working-list state where the current weekly model supports it.

Completion remains an explicit workflow decision unless a deterministic business rule is agreed.

Avoid page-specific updates scattered across Call/Email/Visit components. Put progress transition policy in one reusable service/action where practical.

## 2C.6 — Account timeline

The Account timeline should become the coherent history of commercial activity without flattening distinct concepts into meaningless generic rows.

A salesperson should be able to understand entries such as:

- call — spoke — short note;
- email prepared/sent where truth is known;
- WhatsApp — contacted;
- visit — opportunity — note;
- follow-up Task created/completed;
- Appointment scheduled/completed;
- durable Account note.

Preserve truthful event semantics.

### Quick Email truth boundary

Current Quick Email uses an external mail-client handoff. Preparing/opening an email is not proof that it was sent.

Do not create a `sent email` Interaction unless Brewery Ops actually knows a send occurred.

It is acceptable to retain a truthful `email prepared`/workflow event if useful, or to omit it from canonical Interaction until direct Microsoft 365 sending exists.

Later direct sending can create a definitive email Interaction.

## 2C.7 — Field pass

Test the complete workflow with both:

1. an existing trading Account;
2. a brand-new Brewery Ops-only prospect.

Phone-width field test should cover:

- create prospect quickly;
- avoid obvious duplicate;
- open normal Account page;
- add/find Contact;
- call/email/WhatsApp/visit;
- record outcome;
- create follow-up;
- see activity on Account timeline;
- see weekly progress respond where relevant;
- complete Task/Appointment later;
- prospect remains functional with no ViewPlan identity.

## Explicitly out of Sprint 2C

Do not add:

- Brewery Ops writes to ViewPlan;
- Order Capture;
- sales-effectiveness/contact→order analytics;
- Mailchimp integration;
- Microsoft 365 direct email sending unless separately approved;
- inbox/email synchronisation;
- call recording/transcription;
- AI lead scoring or next-best-action;
- heavyweight opportunity/pipeline management;
- separate Prospect/Lead customer model;
- automatic fuzzy Account merges;
- route optimisation or van capacity;
- management activity-count dashboards.

## Suggested implementation sequence

### 2C.0 — Audit + migration decision

Inspect existing schema/data/routes and document how notes, visits and provisional interactions converge.

### 2C.1 — Prospect ownership hardening

- retain/refine existing Brewery Ops prospect creation;
- add duplicate awareness;
- ensure all normal CRM capabilities work without ViewPlan ID;
- make ViewPlan reconciliation explicit and safe.

### 2C.2 — Canonical Interaction foundation

- implement smallest canonical Interaction schema/service;
- migrate/bridge current call/email endpoint;
- integrate Visit without duplicate event history;
- preserve historic notes.

### 2C.3 — Interaction + follow-up UX

- phone-first channel/outcome capture;
- optional note;
- existing Task/Appointment continuation;
- Contact association.

### 2C.4 — Weekly + timeline integration

- centralise weekly-progress transition from qualifying interaction;
- present coherent Account timeline;
- preserve truthful Quick Email semantics.

### 2C.5 — Mobile field test

Use with real prospects and existing customers; refine vocabulary/tap count from sales feedback.

Combine branches where coherent. Branch boundaries are not ceremony.

## Acceptance test — new field prospect

Given Sales discovers a new pub not already in Brewery Ops:

1. salesperson chooses Add Prospect;
2. enters name and only the useful information currently known;
3. Brewery Ops warns about plausible existing Accounts without silently merging;
4. saving creates a canonical Account with `relationship_status = prospect` and no required ViewPlan identity;
5. optional Contact/location are retained;
6. normal Account workflow opens immediately;
7. salesperson records a visit/call and optional follow-up;
8. Interaction appears coherently in Account history;
9. follow-up appears in normal Tasks/Today workflow;
10. the prospect remains fully usable even though pricing/order history/other ViewPlan-derived information may not exist.

## Acceptance test — weekly sales contact

Given an Account is `not_contacted` on the active Weekly Sales Plan:

1. salesperson opens/calls it from the weekly list;
2. records Call → Spoke/Contacted;
3. optional short note is saved;
4. weekly progress becomes `contacted` without a second manual update;
5. if follow-up is requested, an existing canonical Task is created and weekly state can reflect `follow_up` according to the central policy;
6. Account timeline shows the Interaction once, not as duplicate note/visit rows.

## Acceptance test — prospect becomes trading customer

Given a Brewery Ops-only prospect has Contacts, Interactions, Tasks and history and is subsequently created in ViewPlan through the existing operational process:

1. probable duplicate is not silently merged by name;
2. an explicit/auditable reconciliation associates the ViewPlan identity with the existing canonical Account;
3. the next ViewPlan sync updates ViewPlan-owned fields on that Account;
4. the original Account UUID remains unchanged;
5. CRM-only Contacts and Brewery Ops activity remain intact;
6. no duplicate canonical Account is left representing the same reconciled business relationship.

## Definition of done

Sprint 2C is done when:

- Brewery Ops is explicitly the owner of prospect/pre-customer workflow;
- a prospect is a normal canonical Account and requires no ViewPlan identity;
- prospect creation is fast and phone-friendly;
- duplicate awareness exists without unsafe fuzzy auto-merging;
- there is an auditable path to attach a later ViewPlan identity to the existing Account;
- ViewPlan remains read-only from Brewery Ops;
- call/email/WhatsApp/visit activity has a coherent canonical Interaction direction;
- existing Visit data/behaviour is preserved rather than duplicated/destructively replaced;
- Interaction, Task and Appointment have clear separate semantics;
- contact outcome + optional note + follow-up can be recorded in a few seconds;
- follow-up reuses canonical Tasks/Appointments;
- qualifying weekly-plan contact updates progress without duplicate manual administration;
- Account timeline presents coherent truthful activity;
- Quick Email does not claim an email was sent when Brewery Ops only prepared it;
- both existing customers and Brewery Ops-only prospects pass the mobile field workflow;
- lint/build/CI are green;
- no Order Capture, analytics, ViewPlan writes or heavyweight CRM pipeline is introduced.

## Handoff to later work

Sprint 2C creates the clean event history needed for later contact → order intelligence. Future Order import/capture can associate subsequent customer orders with preceding Interactions using transparent time-window analysis without pretending that correlation proves causation.

It also establishes the ownership boundary required for Brewery Ops eventually to become the commercial system of record while ViewPlan is progressively reduced to an adapter and then retired in bounded areas.