import test from 'node:test';
import assert from 'node:assert/strict';
import {productLabelCandidate as candidate} from '../src/lib/product-label-candidates.mjs';
const row=(label,is_vegan=false)=>({brew_type_id:123,brew_product_name:'Beer',label_text:label,is_vegan});
test('preserves all allergen wording and does not equate haze with unfined',()=>{
 const r=candidate(row('Contains Gluten (barley) Contains Oysters, naturally hazy'));
 assert.equal(r.raw_label,'Contains Gluten (barley) Contains Oysters, naturally hazy');
 assert.equal(r.proposed_cask_fining,'fined');assert.equal(r.proposed_gluten_free,false);
 assert.equal(r.proposed_cask_vegan,null);assert.equal(r.approved,false);
});
test('recognises audited cask exceptions while surfacing source flag disagreement',()=>{
 for(const label of ['Contains Gluten [barley] - Unfined Vegan Friendly','Contains Gluten [barley] (Unfined, Vegan)','Contains Gluten [barley] Suitable for Vegans']){
  const r=candidate(row(label));assert.equal(r.proposed_cask_fining,'unfined');assert.equal(r.proposed_cask_vegan,true);assert.ok(r.review_flags.includes('vegan_flag_disagrees_with_label'));
 }
});
test('blank, descriptive and gluten-free-only labels do not establish complete allergens',()=>{
 assert.ok(candidate(row(null)).review_flags.includes('missing_label'));
 assert.ok(candidate(row('New Zealand Pale Ale')).review_flags.includes('no_allergen_wording'));
 const r=candidate(row('Gluten Free (<20 ppm)'));assert.equal(r.proposed_gluten_free,true);assert.ok(r.review_flags.includes('gluten_free_is_not_complete_allergens'));
});
test('negation, contradictory fining and composition are sent to review',()=>{
 for(const label of ['Not gluten free','Non-vegan','Not unfined','Fined, Vegan Friendly']){
  const r=candidate(row(label));assert.ok(r.review_flags.includes('ambiguous_claims'));assert.equal(r.proposed_cask_fining,null);
 }
 const r=candidate(row('Contains Lactose [Milk], vegan'));assert.equal(r.proposed_cask_vegan,null);assert.ok(r.review_flags.includes('vegan_ingredient_conflict'));
});
test('source vegan flag alone is not sufficient to overwrite cask fining',()=>{
 const r=candidate(row('Contains Gluten [barley]',true));assert.ok(r.review_flags.includes('vegan_flag_without_label_claim'));assert.equal(r.proposed_cask_vegan,null);
});
