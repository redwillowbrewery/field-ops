# Implementation and architecture review — 10 September 2026

**Follow-up:** R1–R7 have implementation fixes on the Sprint 4 branch. This document retains the original findings/evidence; see [fixes and rollout](./architecture-review-fixes.md) for current delivery state. The server task configuration was subsequently corrected and all modules completed through Task Scheduler. Natural overnight execution remains to be checked.

Reviewed `feature/product-foundation` at `1556289`, including inherited Sprint 2C/3 behaviour and Sprint 4 changes. Working tree was clean at the start. This is a code, schema, test and read-only live-state review; it is not Head Brewer/Sales field acceptance. No application changes, publications, production migrations or deployments were made during this review.

## Recommendation

Keep the architecture and continue the bounded Product ownership transition. A rewrite or separate Product application would add duplication without solving the actual weaknesses. Resolve the release findings below, restore reliable ViewPlan refresh, then perform the Sprint 4 adoption field pass before calling the sprint operationally complete.

The Product model is modelling brewery concepts rather than copying ViewPlan: Product identity, Package, Variant, planning/batch observations, packaging requests, published specification and formulation revisions are separate. The critical next design step is to make readiness and approval capabilities canonical services, while retaining the current operational ownership gates.

## Findings, ordered by impact

### R1 — P1: malformed Sellar pagination can replace good availability with zero

`src/lib/sellar-availability-sync.mjs:25` treats an unrecognised HTTP 200 response body as an empty final page. If the first page was valid, the refresh continues; lines 16–18 zero variants missing from that partial result and save it as a successful snapshot.

Reproduced with 100 valid first-page records followed by an invalid response object. A previously available variant on the missing page was written as zero and the function returned success. This reproduction used mocks only.

Fix before release: validate every response envelope and row, distinguish a valid empty page from malformed data, reject pagination-cap exhaustion, and only reconcile absence after a proven complete read. Add failure tests for later-page corruption, invalid stock and incomplete traversal. This is inherited adapter debt, not caused by editorial cutover.

### R2 — P1 operational: nightly startup failures can leave no database error

`scripts/viewplan-connector-customers.ps1:54` attaches to Access before it creates a run at line 67 and before the guarded processing block at line 72. Missing Access, wrong Windows session or missing credentials can fail before any failure state is recorded. The all-modules runner stops at that first failure, so later modules do not refresh either.

The live database confirms stale ViewPlan success times with null errors; this is consistent with a preflight failure but does not prove the server's exact cause. No server task settings or logs have yet been supplied.

Fix path: inspect the actual task first; use the correct 32-bit process and interactive ViewPlan user/session, verify credentials are available to a new scheduled process, and add durable local startup/failure logging with a nonzero task exit code. Database reporting cannot substitute for local logging when credentials/network fail before startup. Preserve previous successful snapshot times. Do not change ViewPlan to unattended database access without separately auditing that connection method.

### R3 — P2: the Product picker silently loses beers after the first 1,000

`src/app/products/page.tsx:16–20` loads the first 1,000 own-product rows and resolves the selected Product only within that array. The live count is 985, including historical records. Growth beyond the cap makes later names inaccessible even through a direct Product URL. The unmapped source selector has the same fixed cap.

Fix before release: query the selected Product by ID independently, and provide database-backed search/pagination for both selectors. Preserve canonical IDs and exact mapping. Test with more than 1,000 records. Separately audit other unpaged reads, including availability and old-snapshot reconciliation, before those datasets exceed their server response limit.

### R4 — P2: launch checklist completion can contradict the actual Product state

`src/app/products/page.tsx:34,46` calculates outstanding work solely from manually ticked required tasks. `save_product_launch_task` permits a user to mark “Formulation approved” or “Product declarations reviewed” complete independently of their underlying state. `flag_formulation_review` invalidates the declaration-review flag but does not invalidate those task ticks.

Consequently the page can say all required launch tasks are complete while a new formulation remains unapproved. Publication is correctly separate from launch and should remain so; do not make every external launch task a publishing blocker.

Recommended bounded follow-up: derive internal formulation/declaration/artwork readiness from actual revisions and review state; retain owner/evidence checklists for external Untappd/Sellar/pump-clip work. Expose one canonical readiness projection. The current checklist must not become the authority for production release.

### R5 — P2: sync health is fragmented and some status-write errors are ignored

The global `/api/sync-status` reads only `connector_sync_state`; Take Off stores state in `take_off_sync` and Product label observations in `product_source_refresh`, so they are missing from that overview. Sellar's success-state/run writes at `src/lib/sellar-availability-sync.mjs:20` await Supabase results without checking their returned `error`, allowing success to be reported when health recording failed.

Unify the health projection without replacing module-specific facts: attempted time, successful observation time, running/failed status, row counts and stale threshold. Check every persistence result. Add a scheduled-run identity so a full overnight pass can be distinguished from a manual module refresh. Products reconciliation currently reports a placeholder zero row count; it is not evidence of an empty source.

### R6 — P2 architectural debt: Product permissions depend on a planning-specific role

Product RPCs, page actions and storage policies reuse `take_off_is_approver` and its role table. It enforces the current Head Brewer rule correctly, but ties editorial permission to packaging approval administration. Adding a packaging approver would also grant Product/formulation publication rights.

Before expanding roles, introduce shared capability checks such as Product editing/publication and packaging approval, initially assigned to the same Head Brewer. Keep workspace preference independent of permissions. Do not introduce separate departmental copies of data.

### R7 — P2 delivery debt: automated local verification is not a durable release gate

The repository has no `.github` workflow directory and `package.json` has no standard test command. Database tests also depend on a PGlite runtime installed outside the repository. They pass locally, but a fresh checkout cannot reproduce the entire gate through one documented command.

Add a pinned development test dependency, standard test commands and CI for build/types plus domain/database regressions. Keep field acceptance explicit. The architecture/backlog/sprint docs also retain contradictory historical CURRENT/NEXT paragraphs below overriding status notes; consolidate current delivery status and clearly label historical sections.

## Architecture assessment

| Boundary | Assessment | Next constraint |
| --- | --- | --- |
| Account / CRM | Canonical Accounts and atomic Interaction/follow-up workflows remain intact. Commercial facts are separate, read-only observations. | Preserve deferred prospect field test; do not write to ViewPlan. |
| Commercial facts | Explicit order and dispatch flags remain independent of balance/limit; missing and stale values are visible. | Restore overnight refresh; unknown does not mean cleared. |
| Product / Package / Variant | Appropriate separation; family treatment uses canonical broad format rather than display names. | Add searchable maintenance and later explicit lifecycle governance, not another catalogue. |
| Editorial information | Source observations, private draft assets and immutable publications are separate; published names/ABV are protected from connector writes. | Finish adoption field checks and retire legacy presentation fallback deliberately. |
| Allergens and family declarations | Beer gluten status is shared across formats; family fining/vegan/process overrides are separate. Unknowns and legacy evidence remain reviewable. | No automatic approval of imported mixed label text. |
| Formulations | Independently versioned records/attachments are a useful foundation. | Free text/PDF is not yet a structured recipe engine; later batches must bind the revision actually used. |
| Shared planning | ViewPlan supplies source plan/tank facts; Sales requests and Head Brewer decisions remain separate and concurrency-checked. | Do not turn requested or approved packaging demand into actual stock. |
| Customer presentation | Account selling and public lists reuse pricing, package restrictions and published specifications; bearer links and private evidence stay separated. | Continue testing all consumers during cutover; never derive a second pricing policy in a page. |
| Operational ownership | Product editorial ownership advances without assuming production, inventory, order or logistics ownership. | Product → Production → Inventory must precede Order Capture and Logistics authority. |
| Application structure | Next.js/Supabase is proportionate to this application. Important writes use transactional RPCs and optimistic revisions. | Extract shared domain types/readiness/capabilities as they grow; avoid a large untyped Product JSON model becoming the recipe/inventory model. |

Public customer endpoints intentionally use a server service key, but resolve only authorised bearer links and allow-listed selling projections. Staff have broad read access, including formulation attachments, under the current model; this needs an explicit capability review before wider driver/external-user access. No evidence in this review establishes an anonymous write bypass.

## Live freshness evidence

Read on 10 September 2026; timestamps below are UTC, not server local time.

| Module | Last successful observation/run |
| --- | --- |
| Customers | 7 September 08:09:24 |
| Account commercial | 7 September 08:09:24 |
| Products reconciliation | 8 September 15:06:02 |
| Customer pricing | 4 September 06:55:37 |
| Containers | 4 September 06:56:02 |
| Take Off snapshot | 8 September 18:00:52 |
| Product label evidence | 9 September 16:01:15 — supplied audit, not proof of a server run |
| Sellar availability | 10 September 05:10:48 |

Null errors on these rows do not prove scheduler health. Snapshot/module clocks differ and must not be presented as one successful overnight run.

## Verification and limits

- Production build and TypeScript pass. The first sandboxed build could not write `.next/trace`; the authorised rerun passed.
- 30 JavaScript tests pass across commercial status, Take Off calculations, live lists, label interpretation and Sellar ownership.
- Five database scripts pass: Product source, Product workspace, Take Off, live price-list links and account commercial snapshots. These run locally with PGlite, not by inserting test data into production.
- Read-only live queries checked freshness and the 985-row Product count.
- The malformed later-page Sellar failure was reproduced independently with mocked data.
- No Windows server execution or unattended overnight run has been observed. Authentication/storage policies were inspected and tested locally; this is not an exhaustive penetration test or a full fresh-database migration replay.

## Next actions

1. Run `scripts/viewplan-scheduler-audit.ps1` on the ViewPlan server in the user session where ViewPlan is open. It exports selected task settings, last result, process/session information, presence-only environment checks, a 32-bit Access attachment probe and connector file hashes. It does not execute the connector or change tasks, source data or credentials. Raw task arguments are omitted because they can contain secrets.
2. Use that evidence to repair the existing task rather than create an overlapping schedule. Verify through Task Scheduler's Run action, then check database timestamps, then observe the next scheduled run. A successful manual PowerShell command alone is insufficient acceptance.
3. Resolve R1/R3 and health reporting, then field-test Product adoption/publication. Schedule readiness/capability/CI work explicitly; do not describe the checklist as production release authority meanwhile.

Microsoft documents the interactive logon distinction in [Principal.LogonType](https://learn.microsoft.com/en-us/windows/win32/taskschd/principal-logontype) and [scheduled task troubleshooting](https://techcommunity.microsoft.com/blog/askperf/help-my-scheduled-task-does-not-run8230/375528/). The same-session dependency here comes from the actual `GetActiveObject('Access.Application')` connector implementation, not a guess about generic cron behaviour.
