# Sprint 2C implementation review — 7 September 2026

Sprint 2C remains CURRENT. Reviewed against repository HEAD `c4fb143` and the updated requirements, preserving the existing uncommitted documentation changes.

## Existing implementation retained

| Requirements | Repository evidence | Status |
| --- | --- | --- |
| 2C.0 discovery and historic preservation | 4 September audit, Interaction migration, timeline legacy labels | Implemented; old audit text describes the pre-implementation baseline |
| 2C.1 prospects | `create_brewery_ops_prospect`, prospect form/actions, explainable duplicate review | Implemented; full field acceptance still required |
| 2C.2 reconciliation | `link_viewplan_account`, immutable BOP reference, exact connector reconciliation | Implemented; conflicting existing identity remains rejected, as designed |
| 2C.3–2C.4 Interaction and follow-up | atomic `record_account_interaction` / `record_account_visit`, linked Task and Appointment flows | Implemented; no replacement activity model introduced |
| 2C.5 weekly progression | database workflow transitions and eligibility hardening | Implemented; end-to-end field acceptance still required |
| 2C.6 timeline | canonical Interactions, linked Visit de-duplication, truthful historic email/launch labels | Implemented |
| 2C.7 field pass | trading Account and unmapped prospect phone workflow | Requires real-user field validation; not claimed complete by source review |
| 2C.8 commercial snapshot | previously absent; new migration, connector module, canonical reader and Account panel | Migration applied and verified on 7 September; server connector run and app deployment remain pending |

Spreadsheet prospect intake and conflicting-Account merge administration remain separately scoped backlog work. Workspace defaults/switching are durable architecture principles, not a requirement to implement Production or Logistics screens in 2C.

## Source audit and confirmed commercial interpretation

Evidence: `commercial-audit.json`, observed `2026-09-07T07:06:26.5491870Z`; business clarification on 7 September 2026.

- Balance is `qryCustomerOutstandingTotalsAll.outstanding_total`, by the exact `customer_id`. The owner selected all unpaid orders, not the delivered/aged invoice-customer aggregate.
- That existing ViewPlan query sums `total_amount + vat_amount - Nz(part_payment_amount,0)` for unpaid, non-deleted, non-cancelled orders of types 1 and 2. The connector consumes the query rather than recreating these filters in the application. No parent-account redistribution or credit-on-account subtraction is added.
- `tblCustomer.credit_amount` is labelled **Credit on Account** by ViewPlan's customer export. It is not the balance owed and is not substituted for it.
- Credit limit is `tblCustomer.customer_max_credit` (ViewPlan export: Max Allowed Credit). The audit found 535 null limits; these remain null, distinct from the 10 explicit zeros.
- Currency is GBP, confirmed by the owner; a DAO Currency field alone was not treated as proof of currency.
- Customer status comes from `tblCustomer.customer_status_id → tblCustomer_Status_List.customer_status_id`. Its explicit `allow_order` and `allow_order_dispatch` flags are translated separately to canonical `order_blocked` and `dispatch_blocked`. A missing status/flag stays unknown.
- Sales interpretation confirmed by the owner: an Account may be allowed to order but require payment before dispatch. Present **Can order — payment required before dispatch** prominently when order is allowed and dispatch is blocked. If ordering itself is blocked, show a stop. No balance/limit comparison creates or clears either restriction.

## Refresh, failures and ownership

The customer connector invokes `viewplan-account-commercial-sync.ps1` after every successful customer identity pass, including zero-change incremental passes. The scheduled wrapper therefore needs no new schedule. Commercial data is a separate full read with its own connector state; it never relies on customer-master `lud`.

All source rows are read before one transactional snapshot RPC. Malformed/empty/duplicate payloads or older retries are rejected; a failed transaction preserves prior facts and timestamps. A missing row in the successfully read outstanding-order aggregate means no unpaid orders (zero balance); a returned row with a null total stays unknown. Missing queries or failed reads never become zero balances.

Snapshot time is the source-read start, not completion of a later retry or page render. A failed refresh is visibly stale, with age-based fallback after 36 hours (daily refresh plus 12-hour grace). Last-known flags remain visible, but stale data never promises current clearance. Connector errors must be inspected separately if the source session, migration or network is unavailable.

Authenticated users can only read snapshots for accessible Accounts whose external identity still matches. Only the service-role connector RPC may write; it does not create Accounts or change CRM data. Remapped source identities cannot expose a previous customer's snapshot. No ViewPlan write, Order Capture or Logistics ownership change is introduced.

## Operational acceptance still required

1. **Done — 7 September 2026:** applied `20260907100000_account_commercial_snapshot.sql` to linked project `redwillow-field-ops` (`ikajzasughiqtippcdpc`). Verified migration history, row-level security, authenticated read-only permissions, anonymous denial and connector-only sync permission. No pending migrations; snapshot table empty awaiting first connector run.
2. Deploy the Account reader/display and copy the new commercial sync/source scripts plus updated customer connector to the ViewPlan server.
3. Run the customer connector in the normal authenticated 32-bit session. Compare several source Accounts with ViewPlan, including ordering allowed/dispatch blocked, ordering stopped, null limit, zero unpaid orders and a prospect.
4. Verify an overnight commercial-only change appears even when customer-master `lud` is unchanged; simulate a failed read and confirm the previous timestamp and facts remain visible.
5. Complete the existing phone-width prospect/contact/follow-up field pass. Sprint 2C is not marked complete by this implementation review.


## Local validation

- Production build and TypeScript checks passed. Lint passed with no errors and four existing warnings in unchanged files.
- Node regression tests cover independent order/dispatch permissions, stale and failed refreshes, missing amounts and unmapped prospects.
- PowerShell permission conversion tests passed for true/false/null and DAO numeric Boolean values; unexpected types reject the read.
- An isolated PostgreSQL-compatible PGlite run applied the migration and verified full-transaction rollback for malformed/empty/duplicate payloads, null preservation, old-read rejection, authenticated read-only access, anonymous denial and hidden snapshots after source identity changes.
- Production migration applied and permissions verified on 7 September with user authorisation. ViewPlan-server sync and real-user mobile acceptance remain pending.

## First server sync verified — 7 September 2026

The customer wrapper completed successfully and refreshed 1,901 commercial snapshots at `2026-09-07T08:09:24.3449201Z` (09:09 UK time). Database verification confirmed all 1,901 rows use GBP, share that snapshot timestamp, and `account_commercial` state records 1,901 rows with no error. This supersedes the earlier pending first-server-run status; app deployment, source/UI comparisons and mobile field validation remain outstanding.

The first attempt failed before creating a run because the new HTTP helper omitted the working connector's User-Agent. Read-only comparison reproduced HTTP 401 without it and success with it. The helper now uses the existing connector identifier and reports failure stage/HTTP status without exposing credentials.

## Acceptance update — recorded 8 September 2026

Commit 81b8a0f was deployed successfully to Vercel Production. The user confirmed balances, customer-specific prices/package restrictions and order/dispatch flags, then confirmed all remaining checks apart from prospect testing. Prospect creation/conversion and history-preservation field validation is explicitly deferred to avoid introducing test data into ViewPlan. This supersedes earlier pending deployment/acceptance notes; deferred prospect testing is not claimed complete. The next sprint is being scoped separately.
