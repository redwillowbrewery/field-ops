# ViewPlan Connector

The ViewPlan connector is the read-only bridge from the legacy ViewPlan BMS into Brewery Ops.

## Ownership

ViewPlan remains authoritative for source-owned operational/master data. Brewery Ops owns CRM activity and application state.

### ViewPlan-owned customer fields

The customer connector updates:

- ViewPlan customer ID/reference
- customer name and classification
- postal address
- account telephone/email/website
- contact preferences and do-not-call/email flags
- sales channel
- ViewPlan call schedule fields
- ViewPlan availability flag
- numbered ViewPlan contact slots 1-5

### Brewery Ops-owned fields

The connector deliberately does **not** overwrite existing:

- relationship status
- CRM-created contacts (contacts without a ViewPlan contact slot)
- notes
- visits
- appointments
- tasks/follow-ups
- geocoding
- CRM priority/workflow state

For a brand-new account only, an initial relationship status is seeded from ViewPlan availability/prospect flags. Later syncs do not replace it.

## Requirements

- Run from 32-bit Windows PowerShell.
- ViewPlan must already be open and authenticated in the same Windows session.
- `NEXT_PUBLIC_SUPABASE_URL` must be set.
- `SUPABASE_SERVICE_ROLE_KEY` must be a protected Supabase server/service-role key, never a publishable browser key.
- Migration `20260824171500_viewplan_connector_customer_sync.sql` must be applied first.

## First run

Run a full reconciliation:

```powershell
.\viewplan-connector-customers.ps1 -Full
```

A full run reads all ViewPlan customers and batch-merges them into Brewery Ops.

## Normal run

```powershell
.\viewplan-connector-customers.ps1
```

After the first successful full run, normal runs use `tblCustomer.lud` as a high-water mark and re-read a five-minute overlap to avoid timestamp-boundary misses.

## Audit/state

The connector writes:

- `connector_sync_state` - last successful high-water mark per module
- `connector_sync_runs` - one audit row for each connector execution

Failures do not advance the high-water mark.

## Scheduling

Initially schedule the customer connector overnight only after the full and incremental runs have both been validated manually.

The current safe connection method attaches to the already-running authenticated ViewPlan Access application. Therefore a Windows scheduled task must run in the same interactive user session and ViewPlan must remain open. A later connector phase should replace this dependency with a safe unattended database-open method.

A sensible initial schedule is daily at 02:00, plus a periodic full reconciliation (for example weekly) as a safety check.

## Planned modules

The same connector framework will be extended to:

1. products and packaging
2. customer pricing
3. sales history
4. availability
5. returnable containers
6. delivery/route data
