import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

function index(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const id = row[key];
    if (id === null || id === undefined || id === '' || result.has(id)) throw new Error(`Invalid/duplicate ${key}`);
    result.set(id, row);
  }
  return result;
}
const round = n => Math.round(n * 1000) / 1000;
const numeric = n => typeof n === 'number' && Number.isFinite(n);

// Offline discovery only. Never mutates source/application data or infers physical completion.
export function reviewFulfilmentAudit(audit) {
  if (audit.audit !== 'ViewPlan fulfilment detail - read only' || audit.data_reads_complete !== true) throw new Error('Incomplete or unsupported audit');
  const r = audit.rows;
  for (const key of ['orders','lines','sub_lines','customers','packages','vehicles','config']) {
    if (!Array.isArray(r?.[key])) throw new Error(`Missing ${key}`);
  }
  const orders = index(r.orders, 'order_id');
  index(r.lines, 'order_item_id');
  const customers = index(r.customers, 'customer_id');
  const packages = index(r.packages, 'packaging_type');
  index(r.vehicles, 'vehicle_id');
  const lines = new Map();
  for (const line of r.lines) {
    if (!orders.has(line.order_id)) throw new Error('Orphan order line');
    if (!lines.has(line.order_id)) lines.set(line.order_id, []);
    lines.get(line.order_id).push(line);
  }
  const summaries = r.orders.map(order => {
    const customer = customers.get(order.customer_id);
    const reasons = [];
    let knownWeight = 0;
    let activeLines = 0;
    for (const line of lines.get(order.order_id) || []) {
      if (line.is_deleted === true || line.is_cancelled === true) continue;
      activeLines++;
      const pkg = packages.get(line.packaging_type);
      // Financial/system lines and miscellaneous services need reviewed classification;
      // a zero source weight alone does not prove the absence of a physical load.
      if (!numeric(line.quantity) || line.quantity < 0) reasons.push(`line:${line.order_item_id}:quantity_review`);
      else if (line.packaging_type === '(misc item)') reasons.push(`line:${line.order_item_id}:misc_item:${line.misc_item_id}:review`);
      else if (!pkg || !numeric(pkg.packaging_weight_full_kg) || pkg.packaging_weight_full_kg <= 0) reasons.push(`line:${line.order_item_id}:weight_or_classification_review`);
      else knownWeight += line.quantity * pkg.packaging_weight_full_kg;
    }
    if (!activeLines) reasons.push('no_active_lines');
    if (!customer) reasons.push('missing_customer');
    return {
      source_order_id: order.order_id,
      delivery_date: order.delivery_date,
      source_vehicle_id: order.delivery_vehicle_id,
      source_type: order.order_type,
      source_cancelled: order.is_cancelled,
      source_deleted: order.is_deleted,
      source_pre_order: order.is_pre_order,
      source_dispatched: order.is_dispatched,
      source_delivered: order.is_delivered,
      physical_completion: 'unknown',
      source_schedule_excluded: order.order_exclude_from_dlv_sched === true || customer?.customer_exclude_from_dlv_sched === true,
      uses_delivery_address_override: Boolean(customer?.delivery_address?.trim()),
      stored_weight_kg: order.order_gross_weight_kg,
      known_line_weight_kg: round(knownWeight),
      candidate_total_weight_kg: reasons.length ? null : round(knownWeight),
      review_reasons: reasons,
    };
  });
  return {
    purpose: 'Offline mapping review; not an operational import, complete open-order feed or validated route',
    observed_at: audit.observed_at,
    counts: {orders:r.orders.length,lines:r.lines.length,sub_lines:r.sub_lines.length,
      stored_weights_missing:r.orders.filter(o=>o.order_gross_weight_kg == null).length,
      pre_orders:r.orders.filter(o=>o.is_pre_order === true).length,
      orders_requiring_weight_review:summaries.filter(o=>o.review_reasons.length).length},
    source_auto_sets_delivered:r.config.some(c=>c.is_default === true && c.set_delivered_on_dispatch === true),
    vehicles:r.vehicles.map(v=>({source_id:v.vehicle_id,name:v.vehicle_name,source_max_load_kg:v.vehicle_max_load_kg,source_available:v.is_available})),
    orders:summaries,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: node scripts/review-fulfilment-audit.mjs input.json output.json');
  const result = reviewFulfilmentAudit(JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, '')));
  writeFileSync(process.argv[3], JSON.stringify(result,null,2)+'\n', {flag:'wx'});
  console.log(JSON.stringify(result.counts));
}
