/*
# Add unit-conversion columns to medicines (Box / Strip / Tablet)

1. Modified Tables
- `medicines`: add columns to support selling in boxes, strips, or loose tablets.
  - `strips_per_box` (integer, default 1) — how many strips make one box.
  - `tablets_per_strip` (integer, default 1) — how many loose tablets make one strip.
  - `strip_sale_price` (numeric, default 0) — sale price per strip (auto-derived, user-overrideable).
  - `tablet_sale_price` (numeric, default 0) — sale price per loose tablet (auto-derived, user-overrideable).
- Existing `purchase_price` and `sale_price` columns are reused as the BOX-level purchase and sale prices (no rename, no data loss).
- Existing `stock_quantity` is reinterpreted as the total count of LOOSE TABLETS in stock (the base unit). No values change.
- Total tablets per box = strips_per_box * tablets_per_strip (computed in app, not stored).

2. Data backfill
- For existing rows, derive strip_sale_price = sale_price / strips_per_box and
  tablet_sale_price = sale_price / (strips_per_box * tablets_per_strip) so old
  medicines are immediately sellable per-strip / per-tablet.

3. Security
- No policy changes; existing anon/authenticated CRUD policies already cover the new columns.

4. Notes
- Non-destructive: only ADD COLUMN + UPDATE backfill. No drops, no type changes, no renames.
*/

ALTER TABLE medicines
  ADD COLUMN IF NOT EXISTS strips_per_box integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tablets_per_strip integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS strip_sale_price numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tablet_sale_price numeric(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  UPDATE medicines
  SET strip_sale_price = CASE
    WHEN strips_per_box > 0 THEN ROUND((sale_price / strips_per_box)::numeric, 2)
    ELSE 0
  END,
  tablet_sale_price = CASE
    WHEN strips_per_box * tablets_per_strip > 0
      THEN ROUND((sale_price / (strips_per_box * tablets_per_strip))::numeric, 2)
    ELSE 0
  END
  WHERE strip_sale_price = 0 AND tablet_sale_price = 0;
END $$;
