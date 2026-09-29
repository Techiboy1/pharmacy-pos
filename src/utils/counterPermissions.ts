import type { Page } from '@/components/Sidebar';

export type CounterPermissions = Partial<Record<Page, boolean>>;

export const COUNTER_MODULES: { page: Page; label: string }[] = [
  { page: 'sales', label: 'Sales & Reports' },
  { page: 'fast-moving', label: 'Top Selling' },
  { page: 'purchases', label: 'Purchases' },
  { page: 'inventory', label: 'Inventory' },
  { page: 'demand', label: 'Demand' },
  { page: 'expiry', label: 'Expiry' },
  { page: 'settings', label: 'Settings' },
];

export const DEFAULT_COUNTER_PERMISSIONS: Record<Page, boolean> = {
  pos: true,
  inventory: true,
  demand: true,
  expiry: true,
  sales: false,
  'customer-history': true,
  settings: true,
  'fast-moving': false,
  returns: true,
  purchases: true,
  network: true,
};

export const COUNTER_PERMISSION_RECORD_ID = 'default';
export const COUNTER_PERMISSION_CACHE_KEY = 'pos_counter_module_access';

export function normalizeCounterPermissions(value: unknown): Record<Page, boolean> {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const normalized = { ...DEFAULT_COUNTER_PERMISSIONS };
  for (const { page } of COUNTER_MODULES) {
    if (typeof candidate[page] === 'boolean') normalized[page] = candidate[page] as boolean;
  }
  return normalized;
}

export function readCachedCounterPermissions(): Record<Page, boolean> {
  try {
    const raw = localStorage.getItem(COUNTER_PERMISSION_CACHE_KEY);
    return normalizeCounterPermissions(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_COUNTER_PERMISSIONS };
  }
}

export function isCounterModuleRestricted(page: Page, permissions: CounterPermissions): boolean {
  return COUNTER_MODULES.some((module) => module.page === page && permissions[module.page] === false);
}
