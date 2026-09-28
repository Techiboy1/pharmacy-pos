/*
# Pharmacy POS & Inventory schema (single-tenant, no auth)

1. New Tables
- `medicines`: product catalog with batch tracking and stock.
  - id (uuid pk), name, batch_no, expiry_date, purchase_price, sale_price, stock_quantity, created_at, updated_at.
- `sales`: completed invoices header.
  - id (uuid pk), invoice_no (unique), total_amount, discount, round_off, net_payable, cash_received, change_return, payment_type, created_at.
- `sale_items`: line items per invoice, with snapshot of medicine at time of sale.
  - id (uuid pk), sale_id (fk -> sales), medicine_id (fk -> medicines), name, batch_no, expiry_date, unit_price, qty, discount_percent, line_total, created_at.
- `store_settings`: single-row store profile used on receipts.
  - id (uuid pk, default fixed), name, address, phone, tax_licence, created_at, updated_at.

2. Security
- RLS enabled on all tables.
- Single-tenant (no sign-in): all policies use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)` because the data is intentionally shared/public for this POS terminal.

3. Notes
- `invoice_no` generated as INV-YYYYMMDD-NNNN via a sequence-like pattern using a stored default is avoided; the frontend generates it. A unique constraint guards duplicates.
- `sale_items.medicine_id` is nullable-safe with ON DELETE SET NULL so historical receipts survive even if a medicine is deleted, while still deducting stock at sale time.
- Stock deduction happens in the frontend by updating `medicines.stock_quantity` after a sale completes.
*/

CREATE TABLE IF NOT EXISTS medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  batch_no text NOT NULL,
  expiry_date date NOT NULL,
  purchase_price numeric(12,2) NOT NULL DEFAULT 0,
  sale_price numeric(12,2) NOT NULL DEFAULT 0,
  stock_quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_medicines" ON medicines;
CREATE POLICY "anon_select_medicines" ON medicines FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_medicines" ON medicines;
CREATE POLICY "anon_insert_medicines" ON medicines FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_medicines" ON medicines;
CREATE POLICY "anon_update_medicines" ON medicines FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_medicines" ON medicines;
CREATE POLICY "anon_delete_medicines" ON medicines FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_medicines_name_lower ON medicines (lower(name));
CREATE INDEX IF NOT EXISTS idx_medicines_batch ON medicines (batch_no);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text UNIQUE NOT NULL,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  round_off numeric(12,2) NOT NULL DEFAULT 0,
  net_payable numeric(12,2) NOT NULL DEFAULT 0,
  cash_received numeric(12,2) NOT NULL DEFAULT 0,
  change_return numeric(12,2) NOT NULL DEFAULT 0,
  payment_type text NOT NULL DEFAULT 'Cash',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sales" ON sales;
CREATE POLICY "anon_select_sales" ON sales FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sales" ON sales;
CREATE POLICY "anon_insert_sales" ON sales FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sales" ON sales;
CREATE POLICY "anon_update_sales" ON sales FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sales" ON sales;
CREATE POLICY "anon_delete_sales" ON sales FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales (created_at DESC);

CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  medicine_id uuid REFERENCES medicines(id) ON DELETE SET NULL,
  name text NOT NULL,
  batch_no text NOT NULL,
  expiry_date date,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  qty integer NOT NULL DEFAULT 1,
  discount_percent numeric(5,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sale_items" ON sale_items;
CREATE POLICY "anon_select_sale_items" ON sale_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sale_items" ON sale_items;
CREATE POLICY "anon_insert_sale_items" ON sale_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sale_items" ON sale_items;
CREATE POLICY "anon_update_sale_items" ON sale_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sale_items" ON sale_items;
CREATE POLICY "anon_delete_sale_items" ON sale_items FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items (sale_id);

CREATE TABLE IF NOT EXISTS store_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Al-Shifa Pharmacy',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  tax_licence text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_store_settings" ON store_settings;
CREATE POLICY "anon_select_store_settings" ON store_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_store_settings" ON store_settings;
CREATE POLICY "anon_insert_store_settings" ON store_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_store_settings" ON store_settings;
CREATE POLICY "anon_update_store_settings" ON store_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_store_settings" ON store_settings;
CREATE POLICY "anon_delete_store_settings" ON store_settings FOR DELETE
  TO anon, authenticated USING (true);

-- Seed a single settings row if none exists.
INSERT INTO store_settings (name, address, phone, tax_licence)
SELECT 'Al-Shifa Pharmacy', '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM store_settings);
