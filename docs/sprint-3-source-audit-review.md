# Sprint 3 source audit review — 8 September 2026

Source: user-supplied take-off-audit.json, observed 2026-09-08T07:02:31Z. Metadata evidence only; no sample records included. Sprint 2C commit 81b8a0f is verified in origin/main.

## Confirmed source structure

- `qryBrewPlan` identifies brew-planning records in `tblTasks`, joined via `task_type_id` to `tblTask_Type_List` with `internal_id = 2`. Product identity is `task_object_id → tblBrew_Type.brew_type_id`; the plan identity is `task_id`, not gyle or beer name.
- `qryTakeOffPlanBasic` uses `task_due_date` for the planned brew date. It obtains planned litres, tank and gyle from positions 1, 2 and 4 of the pipe-delimited `task_object_list` through ViewPlan's `GetArg`. Verify actual data and indexing before implementing a parser; do not execute this query outside its Access function context.
- `tblTank_List.brew_register_id → tblBrew_Register.brew_register_id` supplies current batch association. `qryReport%Production_Tank Levels` explicitly labels `current_level` as Litres in Tank. `brew_quantity` is a different batch field and must not replace it.
- `tblTank_Brew_History` exposes transfers, with tank, batch, litres and transfer date. Tank is not batch identity; one batch may need multiple vessel observations.
- `tblTake_Off_Plan` already holds source packaging quantities by `task_id`, `pkg_type_id`, `take_off_qty`, with processed/deleted flags and optional customer reservation. `pkg_type_id` maps to `tblPackaging_Type_List.internal_id`, not a guessed label.
- Source estimated packaging date adds product `incubation_duration_days` to planned brew date. Treat this as an estimate, never a release or stock availability promise.
- Source product `expected_loss_litres` and historical packaging-efficiency queries exist. Neither establishes the intended spreadsheet 1.06 loss policy.

## Findings that affect implementation

The first script's name-based table filter missed `tblTasks` and `tblTask_Type_List`, although their use is visible in query definitions. It has been corrected. No direct planned-task-to-actual-batch lineage is established by this report. A planned gyle string is not sufficient evidence for automatic reconciliation.

The source already contains packaging demand. Imported ViewPlan take-off rows must be displayed with provenance, separate from Brewery Ops requests, until the team confirms whether they are used operationally. Do not silently sum them into duplicate demand or treat them as local approvals.

## Next evidence

Use the updated audit with `-PlanningSamples -SampleRows 20` in the ViewPlan session. This includes the missing task schema and bounded samples, including task_object_list; task samples are ordered by latest due date and actual batches/take-off by highest ID. These are discovery samples, not a complete sync or current occupancy dataset. Saved queries remain unexecuted and ViewPlan remains read-only.

After inspection, establish explicit transition/reconciliation, completion/cancellation filters and whether current tank values match the working screen. If automatic lineage is unavailable, implement the sprint's explicit auditable manual association fallback. Source mapping and production data migration remain pending these findings; no speculative production schema has been applied.

## Detailed sample review — 8 September 2026

The second audit contains 20 planning tasks and 20 tank observations, plus sampled register/package/take-off rows. It resolves a real source lineage: task 4590 carries task_brew_register_id 4184; other examples include 4522 → 4175 and 4558 → 4176. Use this explicit field when populated. Completed/closed tasks also occur with null lineage; preserve these for explicit association rather than guessing from date/product/gyle.

The observed task_object_list values confirm first-field planned litres and second-field tank ID (for example 2100|1|||N). Separate tasks 4592 and 4593 have the same product, date and quantity and must retain separate identities.

Tank 1 is labelled Tomorrows Brew but has tank_type FV, is_available true and a batch association. This demonstrates why non-null association alone cannot prove physical occupancy. Presentation classification requires a reviewed vessel mapping; a question is pending with the owner.

Implemented source reader: scripts/viewplan-take-off-source.ps1. It reads planning task identities, tank/batch facts and existing source take-off rows using explicit SELECT snapshots, never saved queries or ViewPlan writes. It retains completed/deleted source identities for reconciliation, separates current_level from brew_quantity and preserves null quantities. scripts/test-viewplan-take-off.ps1 passes observed argument parsing and invalid-number/zero/null cases.

The reader is not yet integrated into a scheduled sync, applied database migration or UI. Production approval permissions and staging-vessel classification are being clarified. No source fixtures have been inserted into production.
