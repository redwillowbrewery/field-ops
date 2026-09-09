# Sprint 4 — ViewPlan product label audit review

Reviewed the supplied product-label-audit.json observed 9 September 2026 at 15:50:47 UTC. This is source evidence, not an approved product declaration or deployed import.

## Findings

- tblBrew_Type.label_text exists as DAO type 10 (text), alongside brew_type_id and brew_product_name. Use exact brew_type_id mappings, never names.
- The base product sample contains 40 observations of 29 distinct IDs. It is unordered and bounded; it does not establish current-catalogue coverage.
- Headless (201): "Contains Gluten [malted barley and wheat]".
- Mirthless (205): "Contains Gluten (malted barley and wheat), naturally hazy". Appearance wording is not a fining declaration.
- Fathomless (236): "Contains Gluten (malted barley and wheat) Contains Oysters". Preserve the additional declaration, not just the first bracketed phrase.
- Hitchhiker (732): "New Zealand Pale Ale". Label Text is mixed-purpose; non-empty text is not proof of an allergen statement.
- Guileless (296) has is_vegan=true but label_text only says "Contains Gluten [malted barley]". The independent source flag needs meaning/coverage review; false is not automatically a confirmed non-vegan declaration, and true must not silently bypass Cask review.
- Some actual beer rows have null lud. A populated lud elsewhere does not prove label edits advance it. Use a full product-label observation refresh, independent of incremental high-water, and retain old successful observations on failure.
- No unfined/vegan-friendly or gluten-free label examples appear in the base product sample. This is a sampling limitation, not evidence that none exist.
- No dedicated gluten field appears in the supplied tblBrew_Type schema. Preserve Not confirmed where no reviewed declaration exists.
- The broad discovery included print label caches, inflating the file. Those are not the canonical product-profile source and must not supply product declarations.

## Mapping decisions and remaining evidence

Follow the [Sprint 4 model](./sprint-4-product-foundation.md): preserve raw label evidence, stage reviewed Beer allergens/gluten and Beer-family claims, keep Keg & Can unfined by business policy, and preserve existing confirmed local values. Never treat "naturally hazy" as unfined, absence of a gluten statement as gluten-free, or absence of a vegan claim as non-vegan. Cask fined default is an explicitly identified import policy, not an observed source fact. Conflicting is_vegan evidence goes to review before applying the default.

The [focused product export](../scripts/audit-viewplan-product-label-detail.ps1) reads only the audited base table and narrow fields, including blank labels and source variant/system/lifecycle observations. It reads all rows up to a 10,000-row ceiling and fails rather than writing a truncated report. This supplies current and historical exceptions without collecting print caches. No source writes or database changes.

Next: review product-label-detail.json for actual unfined/gluten-free wording and source flag contradictions; stage candidates against exact canonical mappings. Refresh behavior is deliberately full-read, so no source edit is required merely to test timestamps. Application implementation and publication remain outstanding.


## Focused export follow-up

The complete 1,257-row export was received and staged. Against the 309 current canonical own-beer Products, all exact mappings resolve; 253 labels contain allergen/gluten wording and 56 are blank. Sixteen contain gluten-free wording and 24 contain vegan wording despite a false source vegan flag. Current-catalogue membership includes older/working records and is not equivalent to current stock. See [implementation review](./sprint-4-implementation-review.md) for adoption, validation and outstanding business review.
