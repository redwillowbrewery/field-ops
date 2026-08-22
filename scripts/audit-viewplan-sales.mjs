import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const fileArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!fileArg) {
  console.error("Usage: npm run sales:audit -- <ViewPlan sales export.xlsx>");
  process.exit(1);
}

const filePath = path.resolve(fileArg);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

loadEnvFile(path.resolve(".env.local"));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase publishable/anon key in .env.local.");
  process.exit(1);
}

const workbook = XLSX.readFile(filePath, { cellDates: true });
const sheetName = workbook.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: true });
if (!rows.length) throw new Error("Sales export contains no rows.");

const REQUIRED_COLUMNS = ["Order Date", "Customer", "Product", "Qty", "Net (Incl Discount)"];
for (const column of REQUIRED_COLUMNS) {
  if (!(column in rows[0])) throw new Error(`Expected column '${column}' was not found in the export.`);
}

const supabase = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const accounts = await fetchAllAccounts(supabase);
const accountIndexes = buildAccountIndexes(accounts);
const customerGroups = groupCustomers(rows);
const matches = matchCustomers(customerGroups, accountIndexes);
const audit = buildAudit(rows, customerGroups, matches);

printAudit(audit, filePath, accounts.length);
writeReports(audit, matches);

console.log("\nDry run only. No Supabase writes were performed.");
console.log("Detailed reports: tmp/viewplan-sales/customer-matches.csv and audit.json");

async function fetchAllAccounts(client) {
  const pageSize = 1000;
  const result = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("accounts")
      .select("id,brewery_customer_id,name,town,postcode,email,external_ref,brewery_customer_ref")
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < pageSize) return result;
  }
}

function groupCustomers(sourceRows) {
  const groups = new Map();
  for (const row of sourceRows) {
    const display = text(row.Customer) || "(blank)";
    const parsed = parseViewPlanCustomer(display);
    const key = normalizeName(parsed.name);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        sourceName: parsed.name,
        sourceLocation: parsed.location,
        displayNames: new Set(),
        postcodes: new Set(),
        rows: 0,
        orders: new Set(),
        revenue: 0,
      });
    }
    const group = groups.get(key);
    group.displayNames.add(display);
    if (text(row.Postcode)) group.postcodes.add(normalizePostcode(row.Postcode));
    group.rows += 1;
    if (orderKey(row) !== null) group.orders.add(orderKey(row));
    group.revenue += money(row["Net (Incl Discount)"]) || 0;
  }
  return [...groups.values()];
}

function buildAccountIndexes(accounts) {
  const byName = new Map();
  for (const account of accounts) {
    const key = normalizeName(account.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(account);
  }
  return { byName };
}

function matchCustomers(groups, indexes) {
  return groups.map((group) => {
    const exact = indexes.byName.get(group.key) || [];
    if (exact.length === 1) {
      return makeMatch(group, exact[0], "exact_name", "high", locationCheck(group, exact[0]));
    }
    if (exact.length > 1) {
      const narrowed = exact.filter((account) => locationSupports(group, account));
      if (narrowed.length === 1) return makeMatch(group, narrowed[0], "name_plus_location", "high", "location confirmed");
      return makeUnmatched(group, "ambiguous_name", exact.map((a) => `${a.name} [${a.town || ""} ${a.postcode || ""}]`).join(" | "));
    }

    const candidates = nearestNameCandidates(group.sourceName, [...indexes.byName.values()].flat());
    const strong = candidates.filter((candidate) => candidate.score >= 0.90 && locationSupports(group, candidate.account));
    if (strong.length === 1) return makeMatch(group, strong[0].account, "probable_name_location", "medium", `name similarity ${strong[0].score.toFixed(2)}`);

    return makeUnmatched(
      group,
      "no_exact_match",
      candidates.slice(0, 3).map((c) => `${c.account.name} (${c.score.toFixed(2)})`).join(" | ")
    );
  });
}

function makeMatch(group, account, method, confidence, note) {
  return {
    sourceName: group.sourceName,
    sourceLocation: group.sourceLocation || "",
    displayNames: [...group.displayNames].join(" | "),
    rows: group.rows,
    orders: group.orders.size,
    revenue: round2(group.revenue),
    status: "matched",
    method,
    confidence,
    accountId: account.id,
    breweryCustomerId: account.brewery_customer_id,
    accountName: account.name,
    accountTown: account.town || "",
    accountPostcode: account.postcode || "",
    note: note || "",
  };
}

function makeUnmatched(group, method, note) {
  return {
    sourceName: group.sourceName,
    sourceLocation: group.sourceLocation || "",
    displayNames: [...group.displayNames].join(" | "),
    rows: group.rows,
    orders: group.orders.size,
    revenue: round2(group.revenue),
    status: "review",
    method,
    confidence: "none",
    accountId: "",
    breweryCustomerId: "",
    accountName: "",
    accountTown: "",
    accountPostcode: "",
    note: note || "",
  };
}

function buildAudit(sourceRows, customerGroups, matches) {
  const validOrderRows = sourceRows.filter((r) => orderKey(r) !== null);
  const orders = new Map();
  const salesChannels = new Map();
  const packageTypes = new Map();
  const products = new Set();
  let netAfterDiscount = 0;
  let totalLitres = 0;
  let zeroValueRows = 0;
  let negativeRows = 0;
  let discountRows = 0;
  let missingOrderRows = 0;
  let sellarRows = 0;
  const dates = [];

  for (const row of sourceRows) {
    const order = orderKey(row);
    if (order === null) missingOrderRows += 1;
    else {
      if (!orders.has(order)) orders.set(order, { customer: text(row.Customer), rows: 0, revenue: 0 });
      const o = orders.get(order);
      o.rows += 1;
      o.revenue += money(row["Net (Incl Discount)"]) || 0;
    }

    const net = money(row["Net (Incl Discount)"]) || 0;
    netAfterDiscount += net;
    totalLitres += number(row["Total Litres"]) || 0;
    if (net === 0) zeroValueRows += 1;
    if (net < 0) negativeRows += 1;
    if ((text(row.Product) || "").toLowerCase() === "(discount)") discountRows += 1;
    if ((text(row["Sales Channel"]) || "").toLowerCase() === "sellar") sellarRows += 1;

    increment(salesChannels, text(row["Sales Channel"]) || "(blank)");
    increment(packageTypes, text(row["Pkg Type"]) || "(blank)");
    if (text(row.Product) && text(row.Product) !== "(discount)") products.add(text(row.Product));
    const d = dateOnly(row["Order Date"]);
    if (d) dates.push(d);
  }

  const matched = matches.filter((m) => m.status === "matched");
  const review = matches.filter((m) => m.status !== "matched");
  const matchedRevenue = matched.reduce((sum, m) => sum + m.revenue, 0);
  const reviewRevenue = review.reduce((sum, m) => sum + m.revenue, 0);
  const orderCustomerCollisions = [...orders.entries()].filter(([, value]) => {
    const names = new Set(validOrderRows.filter((r) => orderKey(r) === arguments[0]).map((r) => text(r.Customer)));
    return names.size > 1;
  });

  return {
    sourceRows: sourceRows.length,
    uniqueOrders: orders.size,
    uniqueCustomers: customerGroups.length,
    uniqueProducts: products.size,
    missingOrderRows,
    discountRows,
    zeroValueRows,
    negativeRows,
    sellarRows,
    netAfterDiscount: round2(netAfterDiscount),
    totalLitres: round2(totalLitres),
    firstOrderDate: dates.sort()[0] || null,
    lastOrderDate: dates.sort().at(-1) || null,
    matchedCustomers: matched.length,
    reviewCustomers: review.length,
    matchedRevenue: round2(matchedRevenue),
    reviewRevenue: round2(reviewRevenue),
    matchRate: customerGroups.length ? matched.length / customerGroups.length : 0,
    salesChannels: sortedCounts(salesChannels),
    packageTypes: sortedCounts(packageTypes),
    matches,
    orderCustomerCollisions: orderCustomerCollisions.length,
  };
}

function printAudit(audit, file, accountCount) {
  console.log("Field Ops - ViewPlan sales history audit\n----------------------------------------");
  console.log(`Mode:                 DRY RUN`);
  console.log(`File:                 ${file}`);
  console.log(`Field Ops accounts:   ${accountCount}`);
  console.log(`Source line rows:      ${audit.sourceRows}`);
  console.log(`Unique orders:         ${audit.uniqueOrders}`);
  console.log(`Unique customers:      ${audit.uniqueCustomers}`);
  console.log(`Unique products:       ${audit.uniqueProducts}`);
  console.log(`Order date range:      ${audit.firstOrderDate || "—"} to ${audit.lastOrderDate || "—"}`);
  console.log(`Net incl discounts:    ${gbp(audit.netAfterDiscount)}`);
  console.log(`Total litres:          ${audit.totalLitres.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`);
  console.log(`Rows without order no: ${audit.missingOrderRows}`);
  console.log(`Discount rows:         ${audit.discountRows}`);
  console.log(`Zero-value rows:       ${audit.zeroValueRows}`);
  console.log(`Negative-value rows:   ${audit.negativeRows}`);
  console.log(`Sellar channel rows:   ${audit.sellarRows}`);
  console.log(`Order/customer clashes:${audit.orderCustomerCollisions}`);

  console.log("\nCustomer matching");
  console.log(`Matched:               ${audit.matchedCustomers}/${audit.uniqueCustomers} (${(audit.matchRate * 100).toFixed(1)}%)`);
  console.log(`Needs review:          ${audit.reviewCustomers}`);
  console.log(`Matched revenue:       ${gbp(audit.matchedRevenue)}`);
  console.log(`Review revenue:        ${gbp(audit.reviewRevenue)}`);

  const review = audit.matches.filter((m) => m.status !== "matched");
  if (review.length) {
    console.log("\nCustomers requiring review:");
    for (const match of review.slice(0, 30)) {
      console.log(`  ${match.sourceName}${match.sourceLocation ? ` (${match.sourceLocation})` : ""} | ${gbp(match.revenue)} | ${match.method}${match.note ? ` | candidates: ${match.note}` : ""}`);
    }
    if (review.length > 30) console.log(`  … ${review.length - 30} more in customer-matches.csv`);
  }

  console.log("\nSales channels:");
  printCounts(audit.salesChannels, 10);
  console.log("\nTop package types:");
  printCounts(audit.packageTypes, 15);
}

function writeReports(audit, matches) {
  const outDir = path.resolve("tmp/viewplan-sales");
  fs.mkdirSync(outDir, { recursive: true });
  const csvColumns = [
    "sourceName", "sourceLocation", "status", "method", "confidence", "breweryCustomerId",
    "accountName", "accountTown", "accountPostcode", "rows", "orders", "revenue", "note",
  ];
  const csv = [csvColumns.join(","), ...matches.map((row) => csvColumns.map((key) => csvCell(row[key])).join(","))].join("\n");
  fs.writeFileSync(path.join(outDir, "customer-matches.csv"), `${csv}\n`, "utf8");
  const { matches: _omit, ...auditSummary } = audit;
  fs.writeFileSync(path.join(outDir, "audit.json"), `${JSON.stringify({ ...auditSummary, customerMatches: matches }, null, 2)}\n`, "utf8");
}

function parseViewPlanCustomer(value) {
  const display = String(value || "").trim();
  const match = display.match(/^(.*)\s+\(([^()]*)\)\s*$/);
  if (!match) return { name: display, location: null };
  return { name: match[1].trim(), location: match[2].trim() || null };
}

function locationCheck(group, account) {
  if (!group.sourceLocation) return "name matched; no source location";
  if (normalizeName(group.sourceLocation) === normalizeName(account.town)) return "town confirmed";
  return account.town ? `name matched; source location '${group.sourceLocation}', CRM town '${account.town}'` : "name matched; CRM town blank";
}

function locationSupports(group, account) {
  if (!group.sourceLocation) return true;
  const source = normalizeName(group.sourceLocation);
  const town = normalizeName(account.town);
  if (source && town && (source === town || source.includes(town) || town.includes(source))) return true;
  if (group.postcodes.size && account.postcode && group.postcodes.has(normalizePostcode(account.postcode))) return true;
  return false;
}

function nearestNameCandidates(sourceName, accounts) {
  const target = normalizeName(sourceName);
  return accounts
    .map((account) => ({ account, score: similarity(target, normalizeName(account.name)) }))
    .filter((item) => item.score >= 0.65)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return dp[b.length];
}

function orderKey(row) {
  const value = row["Order No"];
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return String(value).trim();
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePostcode(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "").trim();
}

function money(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[£,$\s]/g, "").replace(/[()]/g, (m) => (m === "(" ? "-" : ""));
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function text(value) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function increment(map, key) { map.set(key, (map.get(key) || 0) + 1); }
function sortedCounts(map) { return [...map.entries()].sort((a, b) => b[1] - a[1]); }
function printCounts(entries, limit) { entries.slice(0, limit).forEach(([key, count]) => console.log(`  ${key}: ${count}`)); }
function round2(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function gbp(value) { return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value || 0); }
function csvCell(value) { const s = String(value ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
