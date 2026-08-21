import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

loadEnvFile(path.resolve(".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const accounts = await fetchAccounts();
const pending = accounts.filter((a) => a.postcode && (a.latitude == null || a.longitude == null));
const byPostcode = new Map();
for (const account of pending) {
  const key = normalisePostcode(account.postcode);
  if (!key) continue;
  const list = byPostcode.get(key) || [];
  list.push(account);
  byPostcode.set(key, list);
}

console.log(`Accounts needing coordinates: ${pending.length}`);
console.log(`Unique postcodes to look up:    ${byPostcode.size}`);

let geocodedAccounts = 0;
let failedPostcodes = 0;
const entries = [...byPostcode.entries()];
for (let i = 0; i < entries.length; i += 100) {
  const chunk = entries.slice(i, i + 100);
  const response = await fetch("https://api.postcodes.io/postcodes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ postcodes: chunk.map(([postcode]) => postcode) }),
  });
  if (!response.ok) throw new Error(`Postcodes.io returned HTTP ${response.status}`);
  const payload = await response.json();
  for (const item of payload.result || []) {
    const postcode = normalisePostcode(item.query);
    const matching = byPostcode.get(postcode) || [];
    if (!item.result?.latitude || !item.result?.longitude) {
      failedPostcodes += 1;
      continue;
    }
    await runLimited(matching, 10, async (account) => {
      const { error } = await supabase.from("accounts").update({
        latitude: item.result.latitude,
        longitude: item.result.longitude,
        geocoded_at: new Date().toISOString(),
      }).eq("id", account.id);
      if (error) throw error;
      geocodedAccounts += 1;
    });
  }
  console.log(`Processed ${Math.min(i + 100, entries.length)} / ${entries.length} postcodes...`);
}

console.log("\nGeocoding complete");
console.log(`Accounts geocoded: ${geocodedAccounts}`);
console.log(`Postcodes not found: ${failedPostcodes}`);

async function fetchAccounts() {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("accounts").select("id,postcode,latitude,longitude").range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

async function runLimited(items, limit, fn) {
  for (let i = 0; i < items.length; i += limit) await Promise.all(items.slice(i, i + limit).map(fn));
}

function normalisePostcode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
