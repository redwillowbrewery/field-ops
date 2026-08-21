# BMS Customer Import Mapping

Source: `Customer List.xlsx` exported from ViewPlan Brewery Management System.

The current export contains 1,893 customer rows and 118 columns. Field Ops should treat ViewPlan as the system of record for customer master and sales data, while Field Ops owns visits, appointments, tasks, field notes, priorities and prospecting activity.

## Import strategy

1. Store each source row unchanged in `customer_import_staging.raw_data`.
2. Normalise optional BMS text fields by trimming whitespace and converting blank strings to `NULL`.
3. Upsert accounts using `ID` → `accounts.brewery_customer_id` as the permanent source key.
4. Import contacts separately instead of preserving the fixed Contact 1–5 structure.
5. Import BMS sales metrics into `account_sales_snapshot` only. They are not editable CRM data.
6. Never overwrite Field Ops-owned notes, visits, tasks, appointments, priority or manually-assigned CRM status during a BMS refresh.

## Accounts

| BMS column | Field Ops field | Rule |
| --- | --- | --- |
| ID | `accounts.brewery_customer_id` | Required source key; integer |
| Customer Name | `accounts.name` | Required |
| Customer Ref No | `accounts.brewery_customer_ref` | Optional text |
| External Ref ID | `accounts.external_ref` | Optional text |
| Classification | `accounts.classification` | Import as source classification |
| Status | `accounts.brewery_status` | Import unchanged |
| Available | `accounts.brewery_available` | Boolean |
| Location Zone | `accounts.brewery_location_zone` | Preserve source label and map/create `territories` |
| Sales Channel | `accounts.brewery_sales_channel` | Preserve source value |
| Customer Rep | `accounts.brewery_customer_rep` | Preserve source text initially |
| Tele-Sales Rep | `accounts.brewery_telesales_rep` | Preserve source text initially |
| Address Line 1 | `accounts.address_line_1` | Optional text |
| Address Line 2 | `accounts.address_line_2` | Optional text |
| Town | `accounts.town` | Optional text |
| County | `accounts.county` | Optional text |
| Post Code | `accounts.postcode` | Optional text; uppercase/trim |
| Country | `accounts.country` | Convert `UK` to `United Kingdom`; otherwise preserve |
| Tel No | `accounts.phone` | Optional text |
| Tel No 2 | `accounts.mobile` | Optional text initially; do not assume it is always mobile |
| Primary Contact Emal | `accounts.email` | Preserve source spelling in import lookup; map to account email |
| Website | `accounts.website` | Optional text |
| Contact Method | `accounts.preferred_contact_method` | Optional text |
| Do Not Call | `accounts.do_not_call` | Boolean |
| Do Not Email | `accounts.do_not_email` | Boolean |
| Call Days | `accounts.brewery_call_days` | Preserve source text |
| Call Time | `accounts.brewery_call_time` | Preserve source text |
| Call Schedule | `accounts.brewery_call_schedule` | Preserve source text |
| Last Call Date | `accounts.brewery_last_call_date` | Convert Excel serial/date to date |
| Next Call Date | `accounts.brewery_next_call_date` | Convert Excel serial/date to date |

`relationship_status` is intentionally **not** overwritten directly from the BMS. It is a Field Ops interpretation (`prospect`, `current`, `cooling`, `lapsed`, `dormant`, `closed`) derived from source status/order history and later CRM activity.

## Contacts

Create contact records only when a contact name/email/telephone contains meaningful data after normalisation.

| BMS columns | Contact behaviour |
| --- | --- |
| Primary Contact / Primary Contact Emal / Primary Contact Tel No | Create primary contact (`is_primary = true`) |
| Contact 2 / Contact 2 Email / Contact 2 Tel No | Create secondary contact if populated |
| Contact 3 / Contact 3 Email / Contact 3 Tel No | Create secondary contact if populated |
| Contact 4 / Contact 4 Email / Contact 4 Tel No | Create secondary contact if populated |
| Contact 5 / Contact 5 Email / Contact 5 Tel No | Create secondary contact if populated |
| Correspondence Contact | Do not create a duplicate contact automatically in v1; retain only if later analysis shows distinct useful names |
| Invoice Contact / Invoice Email | Commercial/accounts contact; defer to later CRM enhancement unless it clearly matches an existing contact |

Contact deduplication within an account should prefer matching normalised email, then normalised phone, then exact normalised name.

## Territories

`Location Zone` is already useful operational territory data (for example `1 - South Manchester`, `2 - Manchester Central`, `7 - Liverpool & Warrington`).

For each distinct non-empty Location Zone:

- create/upsert `territories.name` using the full source value;
- store the same source value in `accounts.brewery_location_zone`;
- set `accounts.territory_id` to the matching territory.

Do not derive new geographic territories during the first import. Postcodes/coordinates can later support map and route planning independently of the BMS territory structure.

## Sales snapshot

| BMS column | Field Ops field |
| --- | --- |
| Total Orders | `account_sales_snapshot.total_orders` |
| Total Spend | `account_sales_snapshot.total_spend` |
| Avg Order Value | `account_sales_snapshot.average_order_value` |
| Max Order Value | `account_sales_snapshot.maximum_order_value` |
| First Order Date | `account_sales_snapshot.first_order_date` |
| Last Order Date | `account_sales_snapshot.last_order_date` |
| Last Delivery Date | `account_sales_snapshot.last_delivery_date` |
| Years as Customer | `account_sales_snapshot.years_as_customer` |

These values are replaced on each successful BMS refresh. They are never edited manually in Field Ops.

## Useful source fields deferred from v1

The export also contains commercially useful information that we should preserve in the raw staging payload but not model yet: payment terms, payment method, wholesale price list, fixed discount, credit limit, credit on account, delivery days, permanent line, pre-order, draught settings, duty/invoice flags, loyalty data, e-commerce integrations, accounting integration flags and parent-customer invoicing fields.

They can be promoted into typed columns later if Field Ops develops a real use case for them.

## Fields not imported into CRM tables in v1

VAT/AWRS/Excise/EORI identifiers, invoice presentation flags, accounting-system flags, e-commerce link flags, loyalty configuration and most pricing/accounting configuration remain in ViewPlan and the raw staging payload. Field Ops should not become a replacement brewery-management or accounting system.
