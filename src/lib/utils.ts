import type { Medicine, SaleUnit } from '@/lib/supabase';

export const LOW_STOCK_THRESHOLD = 10;
export const NEAR_EXPIRY_DAYS = 60;

export function daysUntilExpiry(expiryDate: string): number {
  const expiry = new Date(expiryDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = expiry.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function isLowStock(m: Pick<Medicine, 'stock_quantity'>): boolean {
  return m.stock_quantity < LOW_STOCK_THRESHOLD;
}

export function isNearExpiry(m: Pick<Medicine, 'expiry_date'>): boolean {
  const d = daysUntilExpiry(m.expiry_date);
  return d >= 0 && d < NEAR_EXPIRY_DAYS;
}

export function isExpired(m: Pick<Medicine, 'expiry_date'>): boolean {
  return daysUntilExpiry(m.expiry_date) < 0;
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function lineTotal(unitPrice: number, qty: number, discountPercent: number): number {
  const gross = unitPrice * qty;
  return gross - (gross * (discountPercent || 0)) / 100;
}

export function generateInvoiceNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${ymd}-${rand}`;
}

export function tabletsPerBox(m: Pick<Medicine, 'strips_per_box' | 'tablets_per_strip'>): number {
  return Math.max(1, (m.strips_per_box || 1) * (m.tablets_per_strip || 1));
}

export function priceForUnit(m: Medicine, unit: SaleUnit): number {
  switch (unit) {
    case 'Box':
      return Number(m.sale_price) || 0;
    case 'Strip':
      return Number(m.strip_sale_price) || 0;
    case 'Tablet':
      return Number(m.tablet_sale_price) || 0;
  }
}

/** Loose-tablet deduction for a sale of `qty` in `unit`. */
export function tabletsForQty(qty: number, unit: SaleUnit, m: UnitPack): number {
  const tpb = 'tablets_per_box' in m ? m.tablets_per_box : tabletsPerBox(m);
  switch (unit) {
    case 'Box':
      return qty * Math.max(1, tpb || 1);
    case 'Strip':
      return qty * Math.max(1, m.tablets_per_strip || 1);
    case 'Tablet':
      return qty;
  }
}

/** Max sellable qty in `unit` given loose-tablet stock. */
export function maxQtyForUnit(availableStock: number, unit: SaleUnit, m: UnitPack): number {
  const tpb = 'tablets_per_box' in m ? m.tablets_per_box : tabletsPerBox(m);
  switch (unit) {
    case 'Box':
      return Math.floor(availableStock / Math.max(1, tpb || 1));
    case 'Strip':
      return Math.floor(availableStock / Math.max(1, m.tablets_per_strip || 1));
    case 'Tablet':
      return availableStock;
  }
}

type UnitPack =
  | { tablets_per_box: number; tablets_per_strip: number }
  | Pick<Medicine, 'strips_per_box' | 'tablets_per_strip'>;

export function unitShortLabel(unit: SaleUnit): string {
  return unit;
}
