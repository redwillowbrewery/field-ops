/**
 * ViewPlan adapter evidence, never a customer-facing declaration.
 * Interpretation is deliberately separate from approval/publication.
 */
export function productLabelCandidate(row) {
 const raw=typeof row.label_text==="string"?row.label_text:null;
 const text=(raw||"").replace(/\s+/g," ").trim();
 const flags=[];
 const glutenFree=/\bgluten[ -]*free\b/i.test(text);
 const containsGluten=/\bcontains\s+gluten\b|\bgluten\s+from\b/i.test(text);
 const vegan=/\bvegan(?:s|\s+friendly)?\b/i.test(text);
 const unfined=/\bunfined\b/i.test(text);
 const negated=/\b(?:not|non|no|without)\s*[- ]?\s*(?:vegan|unfined|gluten[ -]*free)\b/i.test(text);
 const explicitlyFined=/(?:^|[^\w])fined\b/i.test(text);
 if(!text)flags.push("missing_label");
 if(text&&!/\b(?:gluten|barley|wheat|oats?|milk|lactose|oysters?|spelt|allergen)\b/i.test(text))flags.push("no_allergen_wording");
 if(glutenFree)flags.push("gluten_free_is_not_complete_allergens");
 if(negated||(glutenFree&&containsGluten)||(explicitlyFined&&(unfined||vegan)))flags.push("ambiguous_claims");
 if(vegan&&row.is_vegan===false)flags.push("vegan_flag_disagrees_with_label");
 if(!vegan&&row.is_vegan===true)flags.push("vegan_flag_without_label_claim");
 if(vegan&&/\b(?:milk|lactose|oysters?|honey)\b/i.test(text))flags.push("vegan_ingredient_conflict");
 // Preserve full text; stripping clauses here could discard an allergen or qualifier.
 return {source_product_id:String(row.brew_type_id),source_name:row.brew_product_name,raw_label:raw,
  source_vegan:typeof row.is_vegan==="boolean"?row.is_vegan:null,
  proposed_allergens:containsGluten?text.slice(text.search(/\b(?:contains\s+gluten|gluten\s+from)\b/i)).split(/\b(?:unfined|vegan|suitable for vegans|naturally hazy)\b/i)[0].replace(/[\s,;(.&-]+$/g,"").trim():null,
  proposed_gluten_free:negated||glutenFree&&containsGluten?null:glutenFree?true:containsGluten?false:null,
  proposed_cask_fining:negated||explicitlyFined&&(unfined||vegan)?null:unfined||vegan?"unfined":"fined",
  proposed_cask_vegan:vegan&&!negated&&!flags.includes("vegan_ingredient_conflict")?true:null,
  fining_basis:unfined||vegan?"label":"import_default",
  review_flags:flags,approved:false};
}
