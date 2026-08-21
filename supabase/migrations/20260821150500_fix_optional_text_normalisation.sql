-- ============================================================
-- FIELD OPS - CORRECT BMS OPTIONAL TEXT NORMALISATION
-- ============================================================
-- The source workbook was re-checked directly. Empty optional cells are
-- exported as blanks/NULLs; the previously assumed literal '119' sentinel
-- does not apply to this customer export. Preserve a genuine value of 119.

create or replace function normalise_bms_optional_text(value text)
returns text
language sql
immutable
as $$
  select nullif(btrim(value), '');
$$;

comment on function normalise_bms_optional_text(text) is
  'Trims optional BMS text fields and converts blank strings to NULL.';
