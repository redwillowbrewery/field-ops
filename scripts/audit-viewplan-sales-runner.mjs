import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import XLSX from "xlsx";

const fileArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!fileArg) {
  console.error("Usage: npm run sales:audit -- <ViewPlan sales export.xlsx>");
  process.exit(1);
}

const sourcePath = path.resolve(fileArg);
if (!fs.existsSync(sourcePath)) {
  console.error(`File not found: ${sourcePath}`);
  process.exit(1);
}

const workbook = XLSX.readFile(sourcePath, { cellDates: true });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
if (!rows.length) throw new Error("Sales export contains no rows.");

// ViewPlan report labels have changed over time. The core audit script uses
// the older labels, so normalise known aliases here without changing source data.
const aliases = {
  Quantity: "Qty",
  "Packaging Type": "Pkg Type",
  "Duty Suspension": "Duty Suspended",
};

const normalisedRows = rows.map((row) => {
  const next = { ...row };
  for (const [current, legacy] of Object.entries(aliases)) {
    if (!(legacy in next) && current in next) next[legacy] = next[current];
  }
  return next;
});

const tempBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(tempBook, XLSX.utils.json_to_sheet(normalisedRows), "Sales");
const tempPath = path.join(os.tmpdir(), `field-ops-viewplan-sales-${process.pid}.xlsx`);
XLSX.writeFile(tempBook, tempPath);

const originalArgs = [...process.argv];
process.argv = [process.argv[0], process.argv[1], tempPath];

try {
  await import("./audit-viewplan-sales.mjs");
} finally {
  process.argv = originalArgs;
  try { fs.unlinkSync(tempPath); } catch {}
}
