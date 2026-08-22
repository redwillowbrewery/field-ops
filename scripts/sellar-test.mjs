import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.SELLAR_API_BASE_URL || "https://api.sellar.io";
const TOKEN = process.env.SELLAR_API_TOKEN;
const OUT_DIR = path.resolve("tmp/sellar");
const PAGE_SIZE = Number(process.env.SELLAR_TEST_PAGE_SIZE || 100);
const MAX_PAGES = Number(process.env.SELLAR_TEST_MAX_PAGES || 1000);
const PREVIEW_ROWS = Number(process.env.SELLAR_TEST_PREVIEW_ROWS || 10);

if (!TOKEN) {
  console.error("Missing SELLAR_API_TOKEN. Add it to .env.local or your shell environment.");
  process.exit(1);
}

if (!Number.isInteger(PAGE_SIZE) || PAGE_SIZE < 1) fail("SELLAR_TEST_PAGE_SIZE must be a positive integer.");
if (!Number.isInteger(MAX_PAGES) || MAX_PAGES < 1) fail("SELLAR_TEST_MAX_PAGES must be a positive integer.");

const command = process.argv[2] || "summary";
const id = process.argv[3];

await fs.mkdir(OUT_DIR, { recursive: true });

switch (command) {
  case "products":
    await runProducts();
    break;
  case "product":
    if (!id) fail("Usage: npm run sellar:test -- product <id>");
    await runSingle("product", `/products/${id}`, summarizeProductResponse);
    break;
  case "retailers":
    await runRetailers();
    break;
  case "orders":
    await runOrders();
    break;
  case "order":
    if (!id) fail("Usage: npm run sellar:test -- order <id>");
    await runSingle("order", `/orders/${id}`, summarizeOrderResponse);
    break;
  case "summary":
    await runSummary();
    break;
  default:
    fail(`Unknown command: ${command}\nCommands: summary, products, product <id>, retailers, orders, order <id>`);
}

async function runSummary() {
  console.log(`Sellar read-only test against ${BASE_URL}`);
  console.log("GET endpoints only. No product/order/webhook writes are implemented.");
  console.log(`Pagination: ${PAGE_SIZE} records/page, up to ${MAX_PAGES} pages.\n`);
  await runProducts();
  console.log("\n---\n");
  await runRetailers();
  console.log("\n---\n");
  await runOrders();
}

async function runProducts() {
  const result = await getAllPages("/products");
  await saveRaw("products", result);
  const rows = result.data;

  console.log(`Products returned: ${rows.length} across ${result.pages} page${result.pages === 1 ? "" : "s"}`);
  for (const product of rows.slice(0, PREVIEW_ROWS)) {
    const parent = product.Parent || product.parent || null;
    console.log([
      `#${product.id ?? "?"}`,
      product.sku || "no-sku",
      product.name || parent?.name || "Unnamed",
      product.containerType || product.displayUnit || "",
      product.packQuantity ? `pack ${product.packQuantity}` : "",
      product.volume ? `vol ${product.volume}` : "",
      numberPart("stock", product.stock),
      numberPart("available", product.availableStock),
      parent?.abv != null ? `${parent.abv}% ABV` : product.abv != null ? `${product.abv}% ABV` : "",
      imageFlag(product, parent),
    ].filter(Boolean).join(" | "));

    const description = parent?.description || product.description;
    if (description) console.log(`  description: ${truncate(description, 140)}`);
    const props = summarizeProperties(product.Properties || parent?.Properties || []);
    if (props) console.log(`  properties: ${props}`);
  }
  if (rows.length > PREVIEW_ROWS) console.log(`  … ${rows.length - PREVIEW_ROWS} more products saved to raw JSON`);
  printPaginationDiagnostics(result);
  console.log(`Raw JSON: ${path.relative(process.cwd(), path.join(OUT_DIR, "products.json"))}`);
}

async function runRetailers() {
  const result = await getAllPages("/supplier-retailer-connections");
  await saveRaw("retailers", result);
  const rows = result.data;

  console.log(`Retailer connections returned: ${rows.length} across ${result.pages} page${result.pages === 1 ? "" : "s"}`);
  for (const row of rows.slice(0, PREVIEW_ROWS)) {
    const retailer = row.Retailer || row.retailer || row;
    const business = retailer.Business || retailer.business || row.Business || row.business || {};
    const address = business.DeliveryAddress || business.deliveryAddress || {};
    console.log([
      `connection ${row.id ?? "?"}`,
      `retailer ${retailer.id ?? row.RetailerId ?? "?"}`,
      business.name || retailer.name || "Unnamed retailer",
      address.city || "",
      address.postalCode || "",
      business.email || "",
    ].filter(Boolean).join(" | "));
  }
  if (rows.length > PREVIEW_ROWS) console.log(`  … ${rows.length - PREVIEW_ROWS} more retailer connections saved to raw JSON`);
  printPaginationDiagnostics(result);
  console.log(`Raw JSON: ${path.relative(process.cwd(), path.join(OUT_DIR, "retailers.json"))}`);
}

async function runOrders() {
  const result = await getAllPages("/orders", { "order[]": '["updatedAt","DESC"]' });
  await saveRaw("orders", result);
  const rows = result.data;

  console.log(`Orders returned: ${rows.length} across ${result.pages} page${result.pages === 1 ? "" : "s"}`);
  for (const order of rows.slice(0, PREVIEW_ROWS)) {
    const business = order.Retailer?.Business || {};
    const items = order.OrderItems || [];
    console.log([
      `#${order.id ?? "?"}`,
      business.name || `retailer ${order.RetailerId ?? "?"}`,
      order.confirmedAt ? `confirmed ${dateOnly(order.confirmedAt)}` : "unconfirmed",
      order.deliveryPlannedAt ? `delivery ${dateOnly(order.deliveryPlannedAt)}` : "",
      order.currency && order.price != null ? `${order.currency} ${moneyMaybeMinor(order.price)}` : "",
      `${items.length} lines`,
      order.customInvoiceNumber ? `invoice ${order.customInvoiceNumber}` : "",
    ].filter(Boolean).join(" | "));
  }
  if (rows.length > PREVIEW_ROWS) console.log(`  … ${rows.length - PREVIEW_ROWS} more orders saved to raw JSON`);
  printPaginationDiagnostics(result);
  console.log(`Raw JSON: ${path.relative(process.cwd(), path.join(OUT_DIR, "orders.json"))}`);
}

async function getAllPages(endpoint, extraParams = {}) {
  const allRows = [];
  const seenIds = new Set();
  let offset = 0;
  let pages = 0;
  let duplicateIds = 0;
  let finalPageSize = 0;

  while (pages < MAX_PAGES) {
    const url = new URL(endpoint, BASE_URL);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    for (const [key, value] of Object.entries(extraParams)) url.searchParams.set(key, String(value));

    const body = await getJson(url);
    const rows = normalizeData(body);
    pages += 1;
    finalPageSize = rows.length;

    if (!rows.length) break;

    for (const row of rows) {
      if (row?.id != null) {
        const key = String(row.id);
        if (seenIds.has(key)) duplicateIds += 1;
        else seenIds.add(key);
      }
      allRows.push(row);
    }

    if (rows.length < PAGE_SIZE) break;
    offset += rows.length;
  }

  if (pages >= MAX_PAGES && finalPageSize >= PAGE_SIZE) {
    fail(`Pagination stopped at safety limit of ${MAX_PAGES} pages. Increase SELLAR_TEST_MAX_PAGES if this dataset is genuinely larger.`);
  }

  return {
    fetchedAt: new Date().toISOString(),
    endpoint,
    pageSize: PAGE_SIZE,
    pages,
    count: allRows.length,
    duplicateIds,
    data: allRows,
  };
}

async function runSingle(prefix, endpoint, summarizer) {
  const body = await getJson(endpoint);
  await saveRaw(`${prefix}-${id}`, body);
  summarizer(body);
  console.log(`Raw JSON: ${path.relative(process.cwd(), path.join(OUT_DIR, `${prefix}-${id}.json`))}`);
}

function summarizeProductResponse(body) {
  const product = unwrapSingle(body);
  console.dir({
    id: product?.id,
    sku: product?.sku,
    name: product?.name,
    containerType: product?.containerType,
    packQuantity: product?.packQuantity,
    volume: product?.volume,
    stock: product?.stock,
    committedStock: product?.committedStock,
    availableStock: product?.availableStock,
    imageUrl: product?.imageUrl,
    heroImageUrl: product?.heroImageUrl,
    parent: product?.Parent ? {
      id: product.Parent.id,
      name: product.Parent.name,
      description: product.Parent.description,
      abv: product.Parent.abv,
      imageUrl: product.Parent.imageUrl,
      heroImageUrl: product.Parent.heroImageUrl,
      glutenFree: product.Parent.glutenFree,
      vegan: product.Parent.vegan,
      lactoseFree: product.Parent.lactoseFree,
      properties: product.Parent.Properties,
    } : null,
    properties: product?.Properties,
  }, { depth: 6, colors: true });
}

function summarizeOrderResponse(body) {
  const order = unwrapSingle(body);
  console.dir({
    id: order?.id,
    retailerId: order?.RetailerId,
    retailer: order?.Retailer?.Business?.name,
    deliveryAddress: order?.DeliveryAddress,
    price: order?.price,
    currency: order?.currency,
    confirmedAt: order?.confirmedAt,
    deliveryPlannedAt: order?.deliveryPlannedAt,
    purchaseOrderNumber: order?.purchaseOrderNumber,
    items: (order?.OrderItems || []).map((item) => ({
      productId: item.ProductId,
      quantity: item.quantity,
      price: item.price,
      fullPrice: item.fullPrice,
      sku: item.Product?.sku,
      name: item.Product?.name,
      parentName: item.Product?.Parent?.name,
    })),
  }, { depth: 6, colors: true });
}

async function getJson(endpoint) {
  const url = endpoint instanceof URL ? endpoint : new URL(endpoint, BASE_URL);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json",
      "User-Agent": "RedWillow-FieldOps-Sellar-Test/1.0",
    },
  });

  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; }
  catch { body = { raw: text }; }

  if (!response.ok) {
    console.error(`Sellar GET ${url.pathname}${url.search} failed: ${response.status} ${response.statusText}`);
    console.dir(body, { depth: 4 });
    process.exit(1);
  }
  return body;
}

async function saveRaw(name, body) {
  await fs.writeFile(path.join(OUT_DIR, `${name}.json`), `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

function normalizeData(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.rows)) return body.data.rows;
  if (Array.isArray(body?.rows)) return body.rows;
  return [];
}

function unwrapSingle(body) {
  if (body && typeof body === "object" && "data" in body) return body.data;
  return body;
}

function printPaginationDiagnostics(result) {
  if (result.duplicateIds) console.log(`WARNING: ${result.duplicateIds} duplicate record id${result.duplicateIds === 1 ? "" : "s"} encountered across pages.`);
  else console.log("Pagination check: no duplicate IDs encountered.");
}

function summarizeProperties(properties) {
  if (!Array.isArray(properties) || !properties.length) return "";
  return properties.slice(0, 8).map((p) => `${p.key ?? "?"}=${truncate(String(p.value ?? ""), 40)}`).join(", ");
}

function imageFlag(product, parent) {
  const image = product.imageUrl || parent?.imageUrl;
  const hero = product.heroImageUrl || parent?.heroImageUrl;
  if (image && hero) return "image+hero";
  if (hero) return "hero";
  if (image) return "image";
  return "no-image";
}

function numberPart(label, value) {
  return value == null ? "" : `${label} ${value}`;
}

function truncate(value, max) {
  const clean = String(value).replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function dateOnly(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}

function moneyMaybeMinor(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return (number / 100).toFixed(2);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
