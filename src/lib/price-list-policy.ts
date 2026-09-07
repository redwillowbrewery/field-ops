export function validPriceListToken(token: string) {
  return /^[a-f0-9]{64}$/.test(token);
}
export function priceListPath(token: string) {
  if (!validPriceListToken(token)) throw new Error("Invalid price list token");
  return `/price-list/${token}`;
}
export function allowedPriceListImage(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
