import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

loadEnvFile(path.resolve(".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SELLAR_BASE = process.env.SELLAR_API_BASE_URL || "https://api.sellar.io";
const SELLAR_TOKEN = process.env.SELLAR_API_TOKEN;

if (!SUPABASE_URL || !SERVICE_KEY) fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local / environment.");
if (!SELLAR_TOKEN) fail("Missing SELLAR_API_TOKEN in .env.local / environment.");

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["Amarillo Porter", "Columbus the Dank", "Dreaming of El Dorado"];

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("Brewery Ops - Sellar / ViewPlan mapping audit");
console.log("-------------------------------------------");
console.log("READ ONLY");
console.log(`Targets: ${targets.join(", ")}\n`);

const sellarProducts = await fetchSellarProducts();
const canonicalProducts = await fetchCanonicalProducts();

let totalSellar = 0;
let totalMapped = 0;
let totalMissing = 0;
let totalWrong = 0;

for (const target of targets) {
  console.log(`=== ${target} ===`);
  const targetNorm = normBeer(target);

  const canonicalMatches = canonicalProducts.filter((p) => beerMatch(targetNorm, normBeer(p.name)));
  if (!canonicalMatches.length) {
    console.log("ViewPlan / Brewery Ops: NO MATCHING CANONICAL PRODUCT\n");
    continue;
  }

  const canonicalIds = canonicalMatches.map((p) => p.id);
  const variants = await fetchVariants(canonicalIds);
  const variantsById = new Map(variants.map((v) => [v.id, v]));

  console.log("ViewPlan / Brewery Ops variants:");
  for (const v of variants.sort(sortVariant)) {
    console.log(`  ${v.package_type || "?"} | variant=${v.id} | format=${v.broad_format || "?"} | allow_sale=${v.allow_sale}`);
  }

  const sellarMatches = sellarProducts.filter((p) => sellarNames(p).some((n) => beerMatch(targetNorm, normBeer(n))));
  console.log("\nSellar live variants:");
  if (!sellarMatches.length) console.log("  NONE");
  for (const p of sellarMatches.sort(sortSellar)) {
    totalSellar += 1;
    console.log(`  id=${p.id} | ${displayName(p)} | ${formatSellarVariant(p)} | available=${Number(p.availableStock ?? p.stock ?? 0)}`);
  }

  const sellarIds = sellarMatches.map((p) => String(p.id));
  const mappings = await fetchMappings(sellarIds);
  const mappingBySellarId = new Map(mappings.map((m) => [String(m.external_id), m]));

  console.log("\nExact mappings:");
  if (!sellarMatches.length) console.log("  No live Sellar variants to map.");
  for (const p of sellarMatches) {
    const mapping = mappingBySellarId.get(String(p.id));
    if (!mapping) {
      totalMissing += 1;
      console.log(`  Sellar ${p.id} (${formatSellarVariant(p)}) -> MISSING`);
      continue;
    }
    const variant = variantsById.get(mapping.product_variant_id);
    if (!variant) {
      totalWrong += 1;
      const { data: mappedVariant } = await supabase.from("product_variants").select("id,package_type,broad_format,allow_sale,product:products(name)").eq("id", mapping.product_variant_id).maybeSingle();
      const mappedName = single(mappedVariant?.product)?.name || "unknown product";
      console.log(`  Sellar ${p.id} (${formatSellarVariant(p)}) -> ${mapping.product_variant_id} WRONG TARGET (${mappedName} · ${mappedVariant?.package_type || "?"})`);
      continue;
    }
    totalMapped += 1;
    console.log(`  Sellar ${p.id} (${formatSellarVariant(p)}) -> ${variant.id} OK (${variant.package_type})`);
  }

  const mappedSellarIdsForCanonical = await fetchMappingsForVariants(variants.map((v) => v.id));
  const liveIdSet = new Set(sellarIds);
  const stale = mappedSellarIdsForCanonical.filter((m) => !liveIdSet.has(String(m.external_id)));
  if (stale.length) {
    console.log("\nMappings to non-live Sellar variants:");
    for (const m of stale) {
      const v = variantsById.get(m.product_variant_id);
      console.log(`  Sellar ${m.external_id} -> ${m.product_variant_id} (${v?.package_type || "?"})`);
    }
  }

  console.log("");
}

console.log("Summary");
console.log("-------");
console.log(`Live Sellar variants checked: ${totalSellar}`);
console.log(`Correct exact mappings:       ${totalMapped}`);
console.log(`Missing mappings:             ${totalMissing}`);
console.log(`Wrong-target mappings:        ${totalWrong}`);
console.log("\nIf mappings are missing/wrong, do not repair them manually yet; use this output to fix the product mapping sync.");

async function fetchCanonicalProducts() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("products").select("id,name").range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

async function fetchVariants(productIds) {
  if (!productIds.length) return [];
  const { data, error } = await supabase.from("product_variants")
    .select("id,product_id,package_type,broad_format,allow_sale,volume_litres,pack_quantity")
    .in("product_id", productIds);
  if (error) throw error;
  return data || [];
}

async function fetchMappings(sellarIds) {
  if (!sellarIds.length) return [];
  const { data, error } = await supabase.from("product_variant_external_ids")
    .select("external_id,product_variant_id,system")
    .eq("system", "sellar")
    .in("external_id", sellarIds);
  if (error) throw error;
  return data || [];
}

async function fetchMappingsForVariants(variantIds) {
  if (!variantIds.length) return [];
  const { data, error } = await supabase.from("product_variant_external_ids")
    .select("external_id,product_variant_id,system")
    .eq("system", "sellar")
    .in("product_variant_id", variantIds);
  if (error) throw error;
  return data || [];
}

async function fetchSellarProducts() {
  const all = [];
  const pageSize = 100;
  for (let offset = 0, pages = 0; pages < 1000; pages += 1) {
    const url = new URL("/products", SELLAR_BASE);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${SELLAR_TOKEN}`,
        Accept: "application/json",
        "User-Agent": "RedWillow-BreweryOps-Mapping-Audit/1.0",
      },
    });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!response.ok) fail(`Sellar GET /products failed: ${response.status} ${response.statusText}\n${text}`);
    const rows = normalizeRows(body);
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += rows.length;
  }
  return all.filter((p) => Number(p.availableStock ?? p.stock ?? 0) > 0);
}

function normalizeRows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.rows)) return body.data.rows;
  if (Array.isArray(body?.rows)) return body.rows;
  return [];
}

function sellarNames(p) { return [p?.Parent?.name, variantBaseName(p?.name), p?.name].filter(Boolean).map(String); }
function displayName(p) { return String(p?.Parent?.name || variantBaseName(p?.name) || p?.name || "Unnamed"); }
function variantBaseName(v) { return String(v || "").split("•")[0].trim().replace(/\s+-\s+(?:\d+\s*[lL]|\d+x\s*\d+\s*ml).*$/i, "").trim(); }
function formatSellarVariant(p) {
  const c = String(p.containerType || "");
  const pack = Number(p.packQuantity || 0);
  const vol = Number(p.volume || 0);
  return [pack > 1 ? `${pack}x` : null, vol ? `${vol}${c.toLowerCase() === "can" ? "ml" : "L"}` : null, c || null].filter(Boolean).join(" ") || p.name || "Product";
}
function normBeer(v) { return String(v || "").toLowerCase().replace(/^f\d+\s*-\s*/i, "").replace(/\b\d+(?:\.\d+)?\s*%\s*(?:abv)?\b/g, "").replace(/\(\s*(?:gf|ve|vegan|gluten\s*free)\s*\)/g, "").replace(/\b20\d{2}\b/g, "").replace(/\b(?:\d+\s*x\s*\d+\s*ml|\d+\s*l(?:itre)?|e[- ]?cask|e[- ]?keg|firkin|pin|key\s*keg|sankey\s*keg|cans?)\b/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function beerMatch(a, b) { return Boolean(a && b && (a === b || (a.length > 4 && b.length > 4 && (a.includes(b) || b.includes(a))))); }
function single(v) { return Array.isArray(v) ? v[0] || null : v || null; }
function sortVariant(a, b) { return String(a.broad_format || "").localeCompare(String(b.broad_format || "")) || String(a.package_type || "").localeCompare(String(b.package_type || "")); }
function sortSellar(a, b) { return formatSellarVariant(a).localeCompare(formatSellarVariant(b)); }

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

function fail(message) { console.error(message); process.exit(1); }
