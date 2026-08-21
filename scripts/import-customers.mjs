import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const fileArg = args.find((arg) => !arg.startsWith("--"));

if (!fileArg) {
  console.error("Usage: npm run import:customers -- <Customer List.xlsx> [--commit]");
  process.exit(1);
}

const filePath = path.resolve(fileArg);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

loadEnvFile(path.resolve(".env.local"));

const workbook = XLSX.readFile(filePath, { cellDates: true });
const firstSheetName = workbook.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
  defval: null,
  raw: true,
});

const REQUIRED_COLUMNS = ["ID", "Customer Name", "Status", "Available"];
for (const column of REQUIRED_COLUMNS) {
  if (!rows.length || !(column in rows[0])) {
    throw new Error(`Expected column '${column}' was not found in the export.`);
  }
}

const sourceSha256 = crypto
  .createHash("sha256")
  .update(fs.readFileSync(filePath))
  .digest("hex");

const transformed = rows.map((row, index) => transformRow(row, index + 2));
const report = buildReport(transformed);
printReport(report, filePath, sourceSha256, commit);

if (!commit) {
  console.log("\nDry run only. Re-run with --commit to write this import to Supabase.");
  process.exit(0);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "\nCommit mode requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local."
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

await commitImport({
  supabase,
  transformed,
  sourceFileName: path.basename(filePath),
  sourceSha256,
});

console.log("\nImport completed successfully.");

function transformRow(raw, sourceRowNumber) {
  const breweryCustomerId = integer(raw.ID);
  const name = text(raw["Customer Name"]);

  if (!breweryCustomerId || !name) {
    return {
      sourceRowNumber,
      breweryCustomerId,
      raw,
      error: "Missing required customer ID or customer name",
    };
  }

  const lastOrderDate = dateOnly(raw["Last Order Date"]);
  const totalOrders = number(raw["Total Orders"]);
  const prospect = bool(raw.Prospect);
  const breweryStatus = text(raw.Status);

  const account = {
    brewery_customer_id: breweryCustomerId,
    brewery_customer_ref: text(raw["Customer Ref No"]),
    external_ref: text(raw["External Ref ID"]),
    name,
    classification: text(raw.Classification),
    relationship_status: deriveRelationshipStatus({
      prospect,
      totalOrders,
      lastOrderDate,
      breweryStatus,
    }),
    brewery_status: breweryStatus,
    brewery_available: bool(raw.Available),
    address_line_1: text(raw["Address Line 1"]),
    address_line_2: text(raw["Address Line 2"]),
    town: text(raw.Town),
    county: text(raw.County),
    postcode: postcode(raw["Post Code"]),
    country: country(raw.Country),
    phone: text(raw["Tel No"]),
    mobile: text(raw["Tel No 2"]),
    email: email(raw["Primary Contact Emal"]),
    website: text(raw.Website),
    preferred_contact_method: text(raw["Contact Method"]),
    do_not_call: bool(raw["Do Not Call"]) ?? false,
    do_not_email: bool(raw["Do Not Email"]) ?? false,
    brewery_location_zone: text(raw["Location Zone"]),
    brewery_sales_channel: text(raw["Sales Channel"]),
    brewery_customer_rep: text(raw["Customer Rep"]),
    brewery_telesales_rep: text(raw["Tele-Sales Rep"]),
    brewery_last_call_date: dateOnly(raw["Last Call Date"]),
    brewery_next_call_date: dateOnly(raw["Next Call Date"]),
    brewery_call_days: text(raw["Call Days"]),
    brewery_call_time: text(raw["Call Time"]),
    brewery_call_schedule: text(raw["Call Schedule"]),
    brewery_last_synced_at: new Date().toISOString(),
  };

  const contacts = [
    contactFrom(raw, 1, "Primary Contact", "Primary Contact Emal", "Primary Contact Tel No", true),
    contactFrom(raw, 2, "Contact 2", "Contact 2 Email", "Contact 2 Tel No"),
    contactFrom(raw, 3, "Contact 3", "Contact 3 Email", "Contact 3 Tel No"),
    contactFrom(raw, 4, "Contact 4", "Contact 4 Email", "Contact 4 Tel No"),
    contactFrom(raw, 5, "Contact 5", "Contact 5 Email", "Contact 5 Tel No"),
  ].filter(Boolean);

  const salesSnapshot = {
    total_orders: integer(raw["Total Orders"]),
    total_spend: number(raw["Total Spend"]),
    average_order_value: number(raw["Avg Order Value"]),
    maximum_order_value: number(raw["Max Order Value"]),
    first_order_date: dateOnly(raw["First Order Date"]),
    last_order_date: lastOrderDate,
    last_delivery_date: dateOnly(raw["Last Delivery Date"]),
    years_as_customer: number(raw["Years as Customer"]),
    imported_at: new Date().toISOString(),
  };

  return {
    sourceRowNumber,
    breweryCustomerId,
    raw,
    transformedData: { account, contacts, salesSnapshot },
  };
}

function contactFrom(raw, slot, nameColumn, emailColumn, phoneColumn, isPrimary = false) {
  const fullName = text(raw[nameColumn]);
  const contactEmail = email(raw[emailColumn]);
  const phone = text(raw[phoneColumn]);

  if (!fullName && !contactEmail && !phone) return null;

  return {
    brewery_contact_slot: slot,
    full_name: fullName,
    email: contactEmail,
    phone,
    is_primary: isPrimary,
    active: true,
  };
}

function deriveRelationshipStatus({ prospect, totalOrders, lastOrderDate, breweryStatus }) {
  if (breweryStatus && breweryStatus.toLowerCase() !== "active") return "closed";
  if (prospect === true || !totalOrders) return "prospect";
  if (!lastOrderDate) return "dormant";

  const days = Math.floor((Date.now() - Date.parse(`${lastOrderDate}T00:00:00Z`)) / 86400000);
  if (days <= 90) return "current";
  if (days <= 180) return "cooling";
  if (days <= 365) return "lapsed";
  return "dormant";
}

function buildReport(items) {
  const valid = items.filter((item) => !item.error);
  const ids = valid.map((item) => item.breweryCustomerId);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const territories = new Set(
    valid.map((item) => item.transformedData.account.brewery_location_zone).filter(Boolean)
  );
  const classifications = countBy(valid, (item) => item.transformedData.account.classification || "(blank)");
  const relationshipStatuses = countBy(
    valid,
    (item) => item.transformedData.account.relationship_status
  );
  const contactCount = valid.reduce(
    (total, item) => total + item.transformedData.contacts.length,
    0
  );

  return {
    sourceRows: items.length,
    validRows: valid.length,
    errorRows: items.length - valid.length,
    duplicateIds: [...new Set(duplicateIds)],
    territories: territories.size,
    contactCount,
    classifications,
    relationshipStatuses,
  };
}

function printReport(report, filePath, sha256, isCommit) {
  console.log("Field Ops - BMS customer import");
  console.log("--------------------------------");
  console.log(`Mode:          ${isCommit ? "COMMIT" : "DRY RUN"}`);
  console.log(`File:          ${filePath}`);
  console.log(`SHA-256:       ${sha256}`);
  console.log(`Source rows:   ${report.sourceRows}`);
  console.log(`Valid rows:    ${report.validRows}`);
  console.log(`Error rows:    ${report.errorRows}`);
  console.log(`Duplicate IDs: ${report.duplicateIds.length}`);
  console.log(`Territories:   ${report.territories}`);
  console.log(`Contacts:      ${report.contactCount}`);

  console.log("\nDerived relationship status:");
  printCounts(report.relationshipStatuses);
  console.log("\nTop classifications:");
  printCounts(report.classifications, 15);
}

async function commitImport({ supabase, transformed, sourceFileName, sourceSha256 }) {
  const valid = transformed.filter((item) => !item.error);
  if (valid.length !== transformed.length) {
    throw new Error("Import contains invalid rows. Fix them before using --commit.");
  }

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      source_system: "ViewPlan BMS",
      source_file_name: sourceFileName,
      source_file_sha256: sourceSha256,
      status: "processing",
      row_count: valid.length,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (batchError) throw batchError;

  try {
    await insertInChunks(
      supabase,
      "customer_import_staging",
      valid.map((item) => ({
        batch_id: batch.id,
        source_row_number: item.sourceRowNumber,
        brewery_customer_id: item.breweryCustomerId,
        raw_data: jsonSafe(item.raw),
        transformed_data: item.transformedData,
        status: "ready",
      })),
      200
    );

    const territoryNames = [
      ...new Set(
        valid.map((item) => item.transformedData.account.brewery_location_zone).filter(Boolean)
      ),
    ];

    if (territoryNames.length) {
      const { error } = await supabase
        .from("territories")
        .upsert(territoryNames.map((name) => ({ name })), { onConflict: "name" });
      if (error) throw error;
    }

    const { data: territoryRows, error: territoryError } = await supabase
      .from("territories")
      .select("id,name");
    if (territoryError) throw territoryError;
    const territoryIdByName = new Map(territoryRows.map((row) => [row.name, row.id]));

    const existingAccounts = await fetchAll(
      supabase,
      "accounts",
      "id,brewery_customer_id",
      "brewery_customer_id"
    );
    const existingIdSet = new Set(existingAccounts.map((row) => row.brewery_customer_id));

    const accountRows = valid.map((item) => {
      const account = { ...item.transformedData.account };
      account.territory_id = account.brewery_location_zone
        ? territoryIdByName.get(account.brewery_location_zone) || null
        : null;
      return account;
    });

    const newAccounts = accountRows.filter((row) => !existingIdSet.has(row.brewery_customer_id));
    const existingAccountUpdates = accountRows
      .filter((row) => existingIdSet.has(row.brewery_customer_id))
      .map(({ relationship_status, ...sourceOwned }) => sourceOwned);

    await upsertInChunks(supabase, "accounts", newAccounts, "brewery_customer_id", 150);
    await upsertInChunks(
      supabase,
      "accounts",
      existingAccountUpdates,
      "brewery_customer_id",
      150
    );

    const refreshedAccounts = await fetchAll(
      supabase,
      "accounts",
      "id,brewery_customer_id",
      "brewery_customer_id"
    );
    const accountIdByBreweryId = new Map(
      refreshedAccounts.map((row) => [row.brewery_customer_id, row.id])
    );

    const salesRows = valid.map((item) => ({
      account_id: accountIdByBreweryId.get(item.breweryCustomerId),
      ...item.transformedData.salesSnapshot,
    }));
    await upsertInChunks(supabase, "account_sales_snapshot", salesRows, "account_id", 200);

    const contactRows = valid.flatMap((item) => {
      const accountId = accountIdByBreweryId.get(item.breweryCustomerId);
      return item.transformedData.contacts.map((contact) => ({ account_id: accountId, ...contact }));
    });
    await upsertInChunks(
      supabase,
      "contacts",
      contactRows,
      "account_id,brewery_contact_slot",
      200
    );

    const { error: stagedError } = await supabase
      .from("customer_import_staging")
      .update({ status: "imported", processed_at: new Date().toISOString() })
      .eq("batch_id", batch.id);
    if (stagedError) throw stagedError;

    const { error: finishError } = await supabase
      .from("import_batches")
      .update({
        status: "completed",
        imported_count: valid.length,
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);
    if (finishError) throw finishError;
  } catch (error) {
    await supabase
      .from("import_batches")
      .update({
        status: "failed",
        error_count: 1,
        notes: String(error?.message || error),
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);
    throw error;
  }
}

async function insertInChunks(supabase, table, rows, chunkSize) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + chunkSize));
    if (error) throw error;
  }
}

async function upsertInChunks(supabase, table, rows, onConflict, chunkSize) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + chunkSize), { onConflict });
    if (error) throw error;
  }
}

async function fetchAll(supabase, table, columns, orderColumn) {
  const pageSize = 1000;
  const result = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    result.push(...data);
    if (data.length < pageSize) return result;
  }
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function text(value) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function email(value) {
  const result = text(value);
  return result ? result.toLowerCase() : null;
}

function postcode(value) {
  const result = text(value);
  return result ? result.toUpperCase().replace(/\s+/g, " ") : null;
}

function country(value) {
  const result = text(value);
  if (!result) return "United Kingdom";
  if (["UK", "GB", "GBR"].includes(result.toUpperCase())) return "United Kingdom";
  return result;
}

function bool(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  return null;
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value) {
  const parsed = number(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function dateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function jsonSafe(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (item instanceof Date ? item.toISOString() : item))
  );
}

function countBy(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const key = selector(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function printCounts(entries, limit = entries.length) {
  for (const [name, count] of entries.slice(0, limit)) {
    console.log(`  ${String(name).padEnd(22)} ${count}`);
  }
}
