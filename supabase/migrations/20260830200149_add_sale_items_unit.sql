/*
# Add unit column to sale_items

1. Modified Tables
- `sale_items`: add `unit` (text, default 'Tablet') to record which unit
  (Box / Strip / Tablet) each line was sold in.

2. Security
- No policy changes; existing CRUD policies cover the new column.

3. Notes
- Non-destructive ADD COLUMN only. Existing rows default to 'Tablet'.
*/

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'Tablet';
