# Architecture review fixes — 10 September 2026

Implementation on feature/product-foundation addresses R1–R7 in the [review](./architecture-review-2026-09-10.md).

## Changed behaviour

- Sellar requires valid complete pagination and valid identities/stock before reconciliation. Malformed later pages, duplicate identities and pagination-cap exhaustion fail without zeroing missing stock. All status-write results are checked; reporting failure is returned as failure. Old availability and customer availability reads are paged.
- Product and source pickers search in the database and page 50 rows. Direct Product URLs resolve independently of the search page.
- Internal launch readiness derives from the current artwork publication, latest formulation approval and current reviewed specification publication. Legacy manual evidence is retained but cannot override these requirements. External Untappd/Sellar/pump-clip work remains editable.
- Product editing and publishing are independent of packaging approval. Existing Head Brewer access is preserved; future grants are maintained in user_capabilities by an administrator/service role.
- The connector runner logs startup, module stages and failure locally even when Access or credentials fail. Each pass has a stable run ID and manual/scheduled invocation. The authenticated health view combines module facts, Take Off, label observations and runner status, preserving successful timestamps and unknown counts.
- PGlite is pinned in devDependencies. npm test runs JavaScript and database checks; npm run typecheck validates types; npm run build produces the application. CI runs tests/build and a Windows job exercises connector syntax and mocked 32-bit failure paths. No production secrets are required for tests or CI.

## Database and release order

Both migrations were applied successfully on 10 September 2026. Existing Head Brewer grants were verified after application:

- 20260910100000_product_capabilities_readiness.sql
- 20260910103000_connector_health.sql

The first migration seeds existing Head Brewer capabilities once, preserves Product/publication/CRM records and retains legacy checklist evidence. The second adds run-health records and a staff-only projection. Existing application behaviour remains compatible for the seeded Head Brewer during rollout. No new Product is created or published as a release test.

After application release, install the full supplied connector scripts together. Keep the repaired task's user, interactive logon, 32-bit executable and 02:00 trigger. Its arguments become:

    -NoProfile -ExecutionPolicy Bypass -File "C:\ViewPlan\BMS\Scripts\viewplan-connector.ps1" -Module all -Scheduled

Run through Task Scheduler and verify the complete run, then the next automatic overnight trigger. Missing log-directory write permissions surface as a nonzero task error; retain the task result if no local file can be created. Server log files contain codes/stages rather than source data or credential values.

## Acceptance still requiring the brewery

The repaired task ran successfully through Task Scheduler on 10 September; a natural 02:00 run remains to be verified. Sprint 4 still requires real Product adoption/publication checks for ordinary cask, unfined exception, gluten-free and milk-containing beers. Sprint 3 field checks and the deferred Sprint 2C prospect test remain distinct.

## Validation

39 JavaScript tests and six database suites pass, including capability separation, legacy migration, derived readiness, malformed Sellar pages and health-write failures. The 32-bit PowerShell runner passes isolated success, missing-credential, module-failure and reporting-failure scenarios with mocked network/source calls. TypeScript and focused lint pass. A runner left running for more than two hours is shown as stale for investigation; this does not terminate it or change successful observation times.

