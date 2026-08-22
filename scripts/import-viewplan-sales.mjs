import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const fileArg = args.find((arg) => !arg.startsWith("--"));
if (!fileArg) {
  console.error("Usage: npm run sales:import -- <ViewPlan sales export.xlsx> [--commit]");
  process.exit(1);
}

const filePath = path.resolve(fileArg);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

loadEnvFile(path.resolve(".env.local"));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const workbook = XLSX.readFile(filePath, { cellDates: true });
const sheetName = workbook.SheetNames[0];
let rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: true });
if (!rows.length) throw new Error("Sales export contains no rows.");
rows = rows.map(normaliseHeaders);

for (const column of ["Order Date", "Customer", "Product", "Quantity", "Net (Incl Discount)"]) {
  if (!(column in rows[0])) throw new Error(`Expected column '${column}' was not found in the export.`);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const accounts = await fetchAllAccounts(supabase);
const byName = buildNameIndex(accounts);
const customerMatch = matchCustomers(rows, byName);
const groupedOrders = buildOrders(rows, customerMatch.matches);

printSummary({ rows, groupedOrders, customerMatch, commit });
if (!commit) {
  console.log("\nDry run only. Re-run with --commit after applying the sales-history migration.");
  process.exit(0);
}

if (!groupedOrders.length) throw new Error("No matched orders to import.");
await importOrders(supabase, groupedOrders);
console.log("\nSales history import completed successfully.");

async function fetchAllAccounts(client) {
  const result = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from("accounts")
      .select("id,brewery_customer_id,name,town,postcode")
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < pageSize) return result;
  }
}

function buildNameIndex(accounts) {
  const map = new Map();
  for (const account of accounts) {
    const key = normalizeName(account.name);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(account);
  }
  return map;
}

function matchCustomers(sourceRows, byName) {
  const uniqueDisplays = [...new Set(sourceRows.map((r) => text(r.Customer)).filter(Boolean))];
  const matches = new Map();
  const skipped = [];

  for (const display of uniqueDisplays) {
    const parsed = parseViewPlanCustomer(display);
    const candidates = byName.get(normalizeName(parsed.name)) || [];
    if (candidates.length === 1) {
      matches.set(display, candidates[0]);
      continue;
    }
    if (candidates.length > 1) {
      const location = normalizeName(parsed.location);
      const narrowed = candidates.filter((a) => {
        const town = normalizeName(a.town);
        return location && town && (location === town || location.includes(town) || town.includes(location));
      });
      if (narrowed.length === 1) {
        matches.set(display, narrowed[0]);
        continue;
      }
      skipped.push({ display, reason: "ambiguous", candidates: candidates.map((a) => `${a.name} [${a.town || ""}]`) });
      continue;
    }
    skipped.push({ display, reason: "no exact account-name match", candidates: [] });
  }

  return { matches, skipped, uniqueCustomers: uniqueDisplays.length };
}

function buildOrders(sourceRows, customerMatches) {
  const orders = new Map();
  for (const row of sourceRows) {
    const orderNo = orderKey(row);
    if (!orderNo) continue;
    const customerDisplay = text(row.Customer);
    const account = customerMatches.get(customerDisplay);
    if (!account) continue;

    if (!orders.has(orderNo)) {
      orders.set(orderNo, {
        account,
        sourceCustomerDisplay: customerDisplay,
        rows: [],
      });
    }
    const order = orders.get(orderNo);
    if (order.account.id !== account.id) throw new Error(`Order ${orderNo} maps to multiple accounts.`);
    order.rows.push(row);
  }

  return [...orders.entries()].map(([orderNo, group]) => transformOrder(orderNo, group));
}

function transformOrder(orderNo, group) {
  const first = group.rows[0];
  const sums = group.rows.reduce((acc, row) => {
    acc.net += money(row["Net (Incl Discount)"]) || 0;
    acc.vat += money(row["VAT (Incl Discount)"]) || 0;
    acc.gross += money(row.Gross) || 0;
    acc.litres += number(row["Total Litres"]) || 0;
    return acc;
  }, { net: 0, vat: 0, gross: 0, litres: 0 });

  return {
    order: {
      account_id: group.account.id,
      viewplan_order_no: orderNo,
      order_date: dateOnly(first["Order Date"]),
      invoice_date: dateOnly(first["Order Invoice Date"]),
      delivery_date: dateOnly(first["Delivery Date"]),
      customer_order_ref: text(first["Customer Order Ref"]),
      comment: text(first.Comment),
      sales_channel: text(first["Sales Channel"]),
      customer_class: text(first["Customer Class"]),
      location_zone: text(first["Location Zone"]),
      account_rep: text(first["Account Rep"]),
      order_source: text(first["Order Source"]),
      dispatched: bool(first.Dispatched),
      dispatched_date: dateOnly(first["Dispatched Date"]),
      delivered: bool(first.Delivered),
      invoice_no: text(first["Invoice No"]),
      invoice_year: integer(first["Invoice Year"]),
      invoice_month: integer(first["Invoice Month"]),
      net_amount: round2(sums.net),
      vat_amount: round2(sums.vat),
      gross_amount: round2(sums.gross),
      total_litres: round3(sums.litres),
      source_customer_display: group.sourceCustomerDisplay,
      imported_at: new Date().toISOString(),
    },
    lines: group.rows.map((row, index) => transformLine(row, index + 1)),
  };
}

function transformLine(row, lineNumber) {
  const product = text(row.Product);
  const pkg = text(row["Packaging Type"]);
  return {
    line_number: lineNumber,
    product_name: product,
    package_type: pkg,
    package_unit_litres: number(row["Pkg Unit Litres"]),
    total_litres: number(row["Total Litres"]),
    draught: bool(row.Draught),
    standard_unit_price: money(row["Standard Unit Price"]),
    item_discount_percent: percent(row["Item Discount"]),
    order_discount_percent: percent(row["Order Level Discuount"]),
    quantity: number(row.Quantity),
    net_amount: money(row.Net),
    vat_amount: money(row.VAT),
    net_after_discount: money(row["Net (Incl Discount)"]),
    vat_after_discount: money(row["VAT (Incl Discount)"]),
    vat_rate: number(row["VAT Rate"]),
    gross_amount: money(row.Gross),
    manufacturing_cost: money(row["Product Mfg Cost"]),
    total_manufacturing_cost: money(row["Total Mfg Cost"]),
    duty: money(row.Duty),
    sales_margin_percent: percent(row["Sales Margin"]),
    delivery_vehicle: text(row["Delivery Vehicle"]),
    line_weight_kg: number(row["Line Item Weight (kg)"]),
    line_type: classifyLine(product, pkg),
  };
}

async function importOrders(client, groups) {
  const orderNos = groups.map((g) => g.order.viewplan_order_no);
  console.log(`\nReplacing ${orderNos.length} existing/new ViewPlan orders...`);

  for (const batch of chunk(orderNos, 200)) {
    const { error } = await client.from("sales_orders").delete().in("viewplan_order_no", batch);
    if (error) throw error;
  }

  for (const batch of chunk(groups, 100)) {
    const { data: inserted, error } = await client.from("sales_orders")
      .insert(batch.map((g) => g.order))
      .select("id,viewplan_order_no");
    if (error) throw error;
    const idByOrder = new Map(inserted.map((r) => [r.viewplan_order_no, r.id]));
    const lineRows = batch.flatMap((g) => g.lines.map((line) => ({
      order_id: idByOrder.get(g.order.viewplan_order_no),
      ...line,
    })));
    for (const lineBatch of chunk(lineRows, 500)) {
      const { error: lineError } = await client.from("sales_order_lines").insert(lineBatch);
      if (lineError) throw lineError;
    }
  }
}

function printSummary({ rows, groupedOrders, customerMatch, commit }) {
  const matchedDisplays = new Set(customerMatch.matches.keys());
  const matchedRows = rows.filter((r) => matchedDisplays.has(text(r.Customer)) && orderKey(r));
  const skippedRows = rows.filter((r) => !matchedDisplays.has(text(r.Customer)));
  const matchedRevenue = matchedRows.reduce((s, r) => s + (money(r["Net (Incl Discount)"]) || 0), 0);
  const skippedRevenue = skippedRows.reduce((s, r) => s + (money(r["Net (Incl Discount)"]) || 0), 0);

  console.log("Field Ops - ViewPlan sales history import\n-----------------------------------------");
  console.log(`Mode:                  ${commit ? "COMMIT" : "DRY RUN"}`);
  console.log(`Source rows:           ${rows.length}`);
  console.log(`Source customers:      ${customerMatch.uniqueCustomers}`);
  console.log(`Matched customers:     ${customerMatch.matches.size}`);
  console.log(`Skipped customers:     ${customerMatch.skipped.length}`);
  console.log(`Orders ready:          ${groupedOrders.length}`);
  console.log(`Line rows ready:       ${groupedOrders.reduce((s, g) => s + g.lines.length, 0)}`);
  console.log(`Matched revenue:       ${gbp(matchedRevenue)}`);
  console.log(`Skipped revenue:       ${gbp(skippedRevenue)}`);
  console.log(`Rows without order no: ${rows.filter((r) => !orderKey(r)).length}`);

  if (customerMatch.skipped.length) {
    console.log("\nSkipped customers:");
    for (const item of customerMatch.skipped) {
      console.log(`  ${item.display} | ${item.reason}${item.candidates.length ? ` | ${item.candidates.join(" | ")}` : ""}`);
    }
  }
}

function normaliseHeaders(row) {
  const out = { ...row };
  if (!("Quantity" in out) && "Qty" in out) out.Quantity = out.Qty;
  if (!("Packaging Type" in out) && "Pkg Type" in out) out["Packaging Type"] = out["Pkg Type"];
  return out;
}

function parseViewPlanCustomer(value) {
  const display = String(value || "").trim();
  const match = display.match(/^(.*)\s+\(([^()]*)\)\s*$/);
  if (!match) return { name: display, location: null };
  return { name: match[1].trim(), location: match[2].trim() || null };
}

function classifyLine(product, pkg) {
  if ((product || "").toLowerCase() === "(discount)" || (pkg || "").toLowerCase() === "(discount)") return "discount";
  if ((pkg || "").toLowerCase() === "(credit note)") return "credit";
  if ((pkg || "").toLowerCase() === "(misc item)") return "misc";
  return "product";
}

function orderKey(row) {
  const value = row["Order No"];
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return String(value).trim();
}

function normalizeName(v) {
  return String(v || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function text(v) { if (v === null || v === undefined) return null; const s = String(v).trim(); return s || null; }
function number(v) { if (v === null || v === undefined || v === "") return null; if (typeof v === "number") return Number.isFinite(v) ? v : null; const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; }
function integer(v) { const n = number(v); return n === null ? null : Math.trunc(n); }
function money(v) { if (v === null || v === undefined || v === "") return null; if (typeof v === "number") return v; const n = Number(String(v).replace(/[£,]/g, "").trim()); return Number.isFinite(n) ? n : null; }
function percent(v) { if (v === null || v === undefined || v === "") return null; if (typeof v === "number") return Math.abs(v) <= 1 ? v * 100 : v; const s = String(v).replace("%", "").trim(); const n = Number(s); return Number.isFinite(n) ? n : null; }
function bool(v) { if (v === null || v === undefined || v === "") return null; if (typeof v === "boolean") return v; if (typeof v === "number") return v !== 0; const s = String(v).trim().toLowerCase(); if (["yes","true","1","-1"].includes(s)) return true; if (["no","false","0"].includes(s)) return false; return null; }
function dateOnly(v) { if (v === null || v === undefined || v === "") return null; const d = v instanceof Date ? v : new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }
function round2(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }
function round3(v) { return Math.round((v + Number.EPSILON) * 1000) / 1000; }
function gbp(v) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(v || 0); }
function chunk(items, size) { const out = []; for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size)); return out; }
function loadEnvFile(envPath) { if (!fs.existsSync(envPath)) return; for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) { const trimmed = line.trim(); if (!trimmed || trimmed.startsWith("#")) continue; const equals = trimmed.indexOf("="); if (equals < 1) continue; const key = trimmed.slice(0, equals).trim(); let value = trimmed.slice(equals + 1).trim(); if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1); if (!(key in process.env)) process.env[key] = value; } }
