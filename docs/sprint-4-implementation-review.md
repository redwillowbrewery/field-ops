# Sprint 4 implementation review — 9 September 2026

Status: **Implementation complete on feature/product-foundation; application deployment and Head Brewer field acceptance pending.** Six database migrations are applied. The supplied 1,257-row ViewPlan export is staged as source evidence; no Product publication or product declaration was automatically approved.

## Delivered

- /products: quick Beer draft creation, adoption of existing canonical Products, explicit Cask fining, Beer-level gluten status, Cask and Keg & Can vegan/process declarations.
- Keg & Can fining is centrally enforced as unfined. Existing explicit Beer information, package overrides and unknown values remain available in the adoption review. Legacy per-package editing redirects to the new workspace after adoption and its old write RPC is blocked for adopted beers.
- Source suggestions preserve raw ViewPlan label evidence and flag ambiguity/vegan-flag disagreement. Blank and gluten-free-only labels do not manufacture a complete allergen declaration.
- Immutable publication revisions, private draft artwork, reviewed copy of existing Sellar artwork to owned storage (source URL/checksum retained), upload and preview, historical publication review and restoration to a new draft.
- Existing presentation is retained as migration evidence until the beer is locally published. Generic/customer price lists, Account selling and Coming soon then consume the same published specification and family declarations.
- Formulation revisions with independent approval and private PDF attachments. New formulations flag declarations for renewed review without rewriting previous publications.
- Configurable launch tasks with required/complete state, owner and evidence. Tasks do not create Untappd/Sellar records or place orders. Completion is distinct from publication and availability.
- Duplicate a beer into a new identity/draft without mappings, publication, artwork ownership or inherited Cask approval.
- Exact ViewPlan matching for previously unmapped non-system/non-bought-in source records. Connector skips unmapped products and variants rather than creating duplicates.
- Sellar refresh writes availability only. ViewPlan continues prices and operational/lifecycle observations; a database guard protects published Product name/ABV from source replacement.
- Draft changes are isolated from customer output. Unsaved Product edits must be saved before another form action can discard them.

## Source coverage

Focused export: 1,257 rows, observed 2026-09-09T16:01:15Z. Compared with the live canonical current own-beer catalogue (active=true, business_exchange=false): 309 Products, all exactly mapped; 253 have label text with allergen/gluten wording, 56 have blank labels. This catalogue includes older/working records and is broader than currently stocked beer. Sixteen labels contain gluten-free wording; 24 contain vegan wording while the separate source flag is false. These are review candidates, not automatically approved claims.

Historical/system records are retained as evidence. Missing labels outside the active catalogue do not block current-beer adoption. Do not infer lifecycle from tblBrew_Type.is_available: current catalogue lifecycle uses the previously audited Product Names mapping.

## Database and rollout

Applied migrations:
- 20260909170000_product_source_observations.sql
- 20260909173000_product_workspace.sql
- 20260909180000_product_publication_access.sql
- 20260909183000_product_editorial_ownership.sql
- 20260909185000_product_reuse.sql
- 20260909190000_product_source_abv.sql

Source import:
`node --env-file=.env.local scripts/import-product-label-observations.mjs <product-label-detail.json> --apply`

This stages observations only. Replays/older snapshots are rejected; failed/empty/malformed reads retain the previous successful snapshot. Source refresh remains a full read because label edit change-marker behavior is unproven and some timestamps are null.

After application release, copy the Product connector bundle over the existing server installation. It contains the runner, reconciliation wrapper, products runner, price/catalogue reconciliation, new label sync, Package sync and Sellar mapping sync. Keep ViewPlan open/authenticated and use 32-bit Windows PowerShell in the same session:
`./viewplan-connector.ps1 -Module products`

The runner now stages labels before reconciliation. Existing overnight scheduling should continue to run the appropriate all-modules runner; this change does not repair the separately reported Windows scheduling/session fault.

Artwork: PNG/JPEG/WebP under 800 KB. Existing Sellar artwork is fetched only from the audited sellar.imgix.net host, without redirects, with timeout and size limit, then stored privately. Unpublished artwork is not served by the public artwork route; historical approved artwork remains available. Formulation PDF attachments are private and under 800 KB.

## Validation

- Product source database tests: service-only mutation, exact mappings, null source timestamps, stale/replayed refreshes, missing rows and atomic rollback.
- Combined Product database tests: Head Brewer authorization, immutable publication isolation, concurrent revision rejection, family rules, source overwrite protection, formulation approval/review, launch updates, duplication, recovery and exact mapping.
- Existing Take Off database suite: approvals, source lineage, grid conflicts, cask formats, Coming soon privacy and old declaration behavior.
- Twenty JavaScript tests: source interpretations, published family fields, customer pricing/restrictions, revoked links, Coming soon and Sellar availability-only writes.
- TypeScript, production build, focused lint and PowerShell syntax checks.
- Local rendered Product preview inspected at desktop and phone widths; no horizontal overflow at phone width.
- Built app against migrated Supabase: /price-list returns 200 with Coming soon; unauthenticated /products redirects to login; unknown/unpublished artwork returns 404.

## Field acceptance and remaining business work

The Head Brewer should adopt a normal fined beer, an unfined/vegan cask exception, a gluten-free beer and a beer containing milk; review the old overrides and source wording, copy/preview artwork, publish and compare both price-list types. Check draft edits do not change the live publication and source refresh does not overwrite it. Exercise a real launch task and formulation revision. Review the 56 blank-label catalogue records rather than inventing declarations or assuming they are all currently sold.

Deploy the application and install/run the server connector bundle before calling Sprint 4 operationally accepted. No real beer was created, edited or published merely to manufacture test evidence.

Sprint 3 field acceptance and the nightly scheduler diagnosis remain open; Sprint 2C prospect testing remains deferred. Full recipe calculation/water treatment, production execution, materials planning, Inventory, Order Capture and Logistics remain outside this bounded release.
