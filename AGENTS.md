<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Brewery Ops architecture guardrail

Before changing domain models, integrations, availability, pricing, product/package semantics, stock, orders, containers, CRM business rules or cross-functional workflows, read:

- `docs/architecture.md` — canonical concepts, integration boundaries and architectural principles.
- `docs/workflow-design.md` — end-to-end workflow, low-friction task completion and cross-role orchestration principles.
- `docs/backlog.md` — prioritised migration path and accepted direction.
- `docs/sprints.md` — current sprint/branch delivery structure.
- `docs/weekly-fulfilment-plan.md` and `docs/weekly-fulfilment-implementation-review.md` — revised fulfilment priority and discovery gates.

Key rules:

- **Brewery Ops owns canonical application semantics and Sales Ops CRM relationship/workflow; ViewPlan remains authoritative for products, production, inventory, orders, logistics and account commercial facts during transition.** Weekly fulfilment planning, collection jobs, route suggestions and load calculations now precede broader Product/Production/Inventory replacement under the 15 September brief. ViewPlan retains order capture, barcode allocation, order printing and pre-dispatch allocation assurance. Brewery Ops planning readiness is not dispatch release. Verify remaining stock, traceability, delivery completion, invoicing and duty responsibilities before live execution. Local planning/completion must not imply a ViewPlan update or bypass dispatch blocks. External systems integrate through adapters. Application features should consume canonical Brewery Ops concepts/services and must not embed external-system semantics where a canonical rule belongs.
- **Complete the business outcome, not the screen.** Minimise module switching and repeated data entry; carry context through the workflow and derive downstream tasks/actions from canonical state where possible.
