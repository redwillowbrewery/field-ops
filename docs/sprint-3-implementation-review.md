# Sprint 3 implementation and rollout — 8 September 2026

Implemented on feature/take-off-planning. Sprint 2C is already on origin/main at 81b8a0f. Sprint 3 application deployment and first ViewPlan-server sync remain pending.

## Delivered

- Authenticated /take-off page, linked from Sales. Shared upcoming, staging and in-tank rows; history includes unresolved/completed/missing rows.
- Read-only full ViewPlan projection, separate source and local-request storage. Exact task_brew_register_id lineage groups plan requests with the actual batch without moving or deleting their request records. The same batch identity survives vessel transfers.
- User-confirmed tank ID 1 (Tomorrows Brew) is staging. Physical FV observations remain separate; source volumes are current_level, not original brew_quantity.
- Sales request quantities, required dates and customer/context notes; own-request editing/withdrawal. Head Brewer review accepts an adjusted quantity/date, explicit extra beer allowance and response.
- Approval permission seeded and verified for toby@redwillowbrewery.com using auth user identity, not a client-side email check. Other authenticated staff cannot approve or directly mutate the protected tables.
- Source and request revisions prevent silent concurrent overwrite. Source changes invalidate approvals; older/duplicate/invalid refresh transactions roll back. Missing rows remain visible when they have requests.
- Explicit manual association by Head Brewer for a plan lacking source lineage; matching source product and a reason are required. No name/date guessing.
- Existing ViewPlan take-off quantities remain separately labelled and are not added to local requests.
- Canonical package capacities drive output litres. The brewer explicitly supplies extra-input percentage: input = output × (1 + percent / 100). No automatic 6% assumption. Unknown quantities stay unknown.
- Package totals, outstanding review count, over-volume warning and change history.

Migration 20260908120000_take_off_planning.sql applied to the linked redwillow-field-ops project. Verified the Head Brewer account and anonymous denial. No test brews or requests inserted into production.

## Server installation

Copy these three files together to C:\ViewPlan\BMS\Scripts:

- viewplan-take-off-source.ps1
- viewplan-take-off-sync.ps1
- viewplan-connector.ps1 (updated runner)

Use the existing logged-in 32-bit ViewPlan/PowerShell session and configured connector environment variables:

```powershell
.\viewplan-connector.ps1 -Module take-off
```

This performs read-only ViewPlan SELECT snapshots and writes only to Brewery Ops. The existing all-module run includes Take Off after the other modules. For a read-only exported projection without any Brewery Ops write:

```powershell
.\viewplan-take-off-sync.ps1 -ExportPath .\take-off-projection.json
```

Recommended operating cadence is hourly during the working day, subject to the existing interactive ViewPlan session being available. No Windows scheduled task has been created on the dev box or remote server. Initial manual runs and the existing all-module schedule work immediately. Snapshot age is shown; approvals are blocked after 24 hours or any recorded refresh failure. This conservative initial threshold is documented and can be tightened after field use.

On failure, prior facts/timestamps remain, and the screen warns about stale data. Check the stage reported by the runner. Do not clear production tables or rerun old audit samples as a live snapshot.

## Validation

- Isolated PGlite migration/workflow tests: roles, direct-write denial, create/edit/withdraw, optimistic concurrency, explicit plan-to-batch link, changed-source approval invalidation, failed-refresh approval denial and transactional source rollback.
- Node calculation/identity tests: separate request/approval scenarios, explicit losses, unknown capacities, withdrawal, stale approval and exact identity.
- PowerShell source/parser/projection tests: empty versus zero, invalid quantities, staging versus physical FV, transfer identity and missing linked batch.
- Production build and TypeScript; ESLint checked. Desktop/phone layout inspected using local fixture data, not production records.

## Remaining acceptance and deployment

1. Run the server connector and compare current staging/FV rows and upcoming brews with ViewPlan.
2. Deploy the application branch through the normal reviewed release process.
3. Sales adds a real requirement; Head Brewer reviews it. Verify current production quantities and loss assumptions.
4. Confirm a subsequent sync preserves the request through a source date/tank change and marks the earlier approval for review.
5. Confirm any historical plan without lineage is explicitly reconciled, and agree a working-day schedule on the ViewPlan server.

The source SQL has been derived from the actual audit but cannot be executed against Access on this dev machine. First-server-run validation is still required; local tests do not claim it complete.

## First source-refresh correction

The exported projection contained 1,325 rows and five explicit plan-to-batch links with different source product identities. The initial migration rejected the entire transaction. Migration 20260908140000_take_off_link_conflicts.sql now preserves those source references as evidence, flags their plans as unresolved, and excludes them from automatic grouping with the mismatched batches. Missing targets and invalid/manual conflicts still fail closed. The full exported projection reproduced the original failure and imported successfully after the fix in isolated PGlite, with all five conflicts retaining their own root identities. The correction is applied to the linked database; a fresh server sync remains required. The exported snapshot was not loaded into production.


## First live sync verified — 8 September 2026

The ViewPlan server connector successfully wrote 1,325 subjects at 2026-09-08T11:59:08.299017Z (12:59 UK time). Database verification confirms the row count and no recorded sync error. All five conflicting plans remain unresolved and separate. Batch 4189 is correctly classified as staging in Tomorrows Brew, with 2,100 litres. This supersedes earlier pending first-server-run notes. App deployment, real-user source/UI comparison and request/approval field acceptance remain outstanding.

## Quantity grid and estimated packaging — 8 September 2026

Implemented on feature/take-off-quantity-grid; not deployed. Migration 20260908160000_take_off_grid.sql is applied to the linked database. The grid saves all changed quantities atomically, preserves other owners and untouched approvals, rejects stale/repeated forms and supports zero-to-withdraw. Detailed existing requests and Head Brewer review remain available. Live totals group cask/pin separately from keg/can and show remaining beer before losses; approved totals retain explicit allowance calculations.

The audited tblBrew_Type.incubation_duration_days is included for both planned and actual brews. Dates are estimates derived from source brew date plus calendar days, not release/stock promises. Unknown values stay unknown. Update the three-file connector bundle on the ViewPlan server and run take-off to populate them; no Access source query was executed on the dev box.

Validation: production build, focused lint, isolated database workflow tests (atomic rollback, duplicate-submit protection, ownership, approval preservation, withdrawal, null/invalid fermentation data), calculation and source-projection tests. Live Sales/Head Brewer acceptance and comparison of the new date fields with ViewPlan remain pending.

### Cask planning formats — 8 September 2026

E-Cask (40 L), Firkin (41 L), Pin (20 L) and Pin (Flat Bottom) (20 L) are enabled as canonical Take Off planning options, even without an existing saleable variant for the selected beer. The shared database eligibility rule drives both the screen and request validation. Packages must remain active; other formats retain existing saleable-variant eligibility. This does not create Product Variants, prices or stock availability. Existing requests and Head Brewer review are preserved.
