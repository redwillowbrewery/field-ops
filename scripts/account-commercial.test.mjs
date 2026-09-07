import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commercialStatus, commercialFreshness, commercialAmount, getAccountCommercialSnapshot } from '../src/lib/account-commercial.ts';

const now = Date.parse('2026-09-07T12:00:00Z');
const snapshot = { balance: 500, credit_limit: 1000, currency: 'GBP', order_blocked: true, dispatch_blocked: null, source_status: 'Held', source: 'viewplan', observed_at: '2026-09-07T02:00:00Z' };
test('explicit holds are independent of amounts', () => {
  assert.equal(commercialStatus(snapshot.order_blocked, false), 'Stop — ordering blocked');
  assert.equal(commercialStatus({ ...snapshot, balance: 5000, order_blocked: false }.order_blocked, false), 'Ordering and dispatch allowed');
  assert.equal(commercialStatus(null, null), 'Order status unknown — verify in ViewPlan');
  assert.equal(commercialStatus(false, false, true), 'Status out of date — verify before promising delivery');
  assert.equal(commercialStatus(false, true), 'Can order — payment required before dispatch');
  assert.equal(commercialStatus(false, null), 'Can order — dispatch status unknown');
});
test('failed refresh retains facts and original timestamp, never looks fresh', () => {
  const result = commercialFreshness(snapshot, true, now);
  assert.equal(result.snapshot, snapshot);
  assert.equal(result.freshness, 'stale');
  assert.equal(result.reason, 'refresh_failed');
  assert.equal(commercialFreshness(snapshot, false, now).freshness, 'current');
  assert.equal(commercialFreshness(snapshot, false, now + 48 * 3600000).freshness, 'stale');
});
test('missing values are not replaced by zero or clearance', () => {
  assert.equal(commercialAmount(null, 'GBP'), 'Unavailable');
  assert.equal(commercialAmount(0, 'GBP'), '£0.00');
  assert.equal(commercialAmount(-15.25, 'GBP'), '-£15.25');
  assert.equal(commercialAmount('NaN', 'GBP'), 'Unavailable');
  assert.equal(commercialFreshness(null, false, now).freshness, 'unavailable');
});
test('unmapped prospects do not query commercial tables', async () => {
  const db = { from() { throw new Error('Must not query'); } };
  assert.equal((await getAccountCommercialSnapshot(db, 'prospect', null)).reason, 'unmapped');
});
test('missing migration or connection failure leaves CRM usable', async () => {
  const db = { from() { throw new Error('Connection failed'); } };
  assert.equal((await getAccountCommercialSnapshot(db, 'account', 42)).reason, 'read_failed');
});
