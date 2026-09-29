// Pure Offline Local & LAN Shared Database Layer

export type Medicine = {
  id: string;
  name: string;
  batch_no: string;
  expiry_date: string;
  cost_price: number;
  sale_price: number;
  strip_sale_price?: number;
  tablet_sale_price?: number;
  stock_quantity: number;
  tablets_per_strip?: number;
  strips_per_box?: number;
  created_at?: string;
  updated_at?: string;
};

export type CartItem = {
  medicine_id: string;
  name: string;
  batch_no: string;
  expiry_date: string;
  unit_price: number;
  qty: number;
  discount_percent: number;
  available_stock: number;
  unit: SaleUnit;
  tablets_per_box: number;
  tablets_per_strip: number;
};

export type SaleUnit = 'Box' | 'Strip' | 'Tablet';

export type Sale = {
  id: string;
  invoice_no: string;
  total_amount: number;
  discount: number;
  round_off: number;
  net_payable: number;
  cash_received: number;
  change_return: number;
  payment_type: string;
  customer_name?: string;
  customer_phone?: string;
  created_at?: string;
  sale_items?: SaleItem[];
};

export type SaleItem = {
  id?: string;
  sale_id: string;
  medicine_id: string;
  name: string;
  batch_no: string;
  expiry_date: string;
  unit_price: number;
  qty: number;
  discount_percent: number;
  line_total: number;
  unit: SaleUnit;
};

export type StoreSettings = {
  id: string;
  name: string;
  address: string;
  phone: string;
  tax_licence: string;
  updated_at?: string;
};

// Local storage management
function getLocalData<T>(key: string, defaultVal: T): T {
  try {
    const data = localStorage.getItem(`pos_db_${key}`);
    if (!data) {
      localStorage.setItem(`pos_db_${key}`, JSON.stringify(defaultVal));
      return defaultVal;
    }
    return JSON.parse(data);
  } catch {
    return defaultVal;
  }
}

function setLocalData<T>(key: string, val: T): void {
  try {
    localStorage.setItem(`pos_db_${key}`, JSON.stringify(val));
  } catch (e) {
    console.error('Storage quota exceeded or error:', e);
  }
}

// Network Helpers
export function getNetworkRole(): 'server' | 'client' {
  const deviceRole = localStorage.getItem('pos_device_role');
  if (deviceRole === 'counter') return 'client';
  if (deviceRole === 'server') return 'server';
  const configured = localStorage.getItem('pos_network_role');
  if (configured === 'server' || configured === 'client') return configured;
  return 'server';
}

const SYNCABLE_LOCAL_RECORD_KEYS = new Set([
  'pos_purchases', 'pos_vendors', 'pos_batches', 'pos_customer_history',
  'pos_customer_ledger', 'pos_returns', 'pos_return_items', 'pos_purchase_items',
]);

export function getServerIP(): string {
  return localStorage.getItem('pos_server_ip') || '192.168.1.50';
}

function getServerPort(): string {
  return localStorage.getItem('pos_server_port') || '45455';
}

/** Verify that shared local data is reachable before creating a backup/export from a Counter PC. */
export async function isMainServerReachable(): Promise<boolean> {
  if (getNetworkRole() === 'server') return true;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`http://${getServerIP()}:${getServerPort()}/api/ping`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

// Global hook: Main PC handles queries sent over LAN cable
if (typeof window !== 'undefined') {
  (window as any).__handleLanRequest = async (payload: {
    table: string;
    action: 'select' | 'insert' | 'update' | 'delete' | 'replace' | 'storage_replace';
    filters?: any[];
    data?: any;
    order?: { col: string; ascending: boolean };
    limit?: number;
  }) => {
    const { table, action, filters = [], data, order, limit } = payload;

    if (action === 'storage_replace') {
      if (!data || !SYNCABLE_LOCAL_RECORD_KEYS.has(data.key)) throw new Error('This local record cannot be restored over LAN.');
      localStorage.setItem(data.key, JSON.stringify(data.value));
      window.dispatchEvent(new CustomEvent('pos-local-data-changed', { detail: { key: data.key } }));
      return true;
    }

    let list: any[] = getLocalData(table, []);

    if (action === 'replace') {
      if (!Array.isArray(data)) throw new Error('Replacement data must be an array.');
      localStorage.setItem(`pos_db_${table}`, JSON.stringify(data));
      window.dispatchEvent(new CustomEvent('pos-local-data-changed', { detail: { table } }));
      return data;
    }

    if (action === 'select') {
      for (const f of filters) {
        if (f.op === 'eq') list = list.filter((item) => String(item[f.col]) === String(f.val));
        if (f.op === 'neq') list = list.filter((item) => String(item[f.col]) !== String(f.val));
        if (f.op === 'like' || f.op === 'ilike') {
          const clean = f.val.replace(/%/g, '').toLowerCase();
          list = list.filter((item) => String(item[f.col] || '').toLowerCase().includes(clean));
        }
      }
      if (order) {
        list.sort((a, b) => {
          const valA = a[order.col] ?? '';
          const valB = b[order.col] ?? '';
          if (valA < valB) return order.ascending ? -1 : 1;
          if (valA > valB) return order.ascending ? 1 : -1;
          return 0;
        });
      }
      if (limit) list = list.slice(0, limit);

      if (table === 'sales') {
        const allSaleItems: SaleItem[] = getLocalData('sale_items', []);
        list = list.map((sale) => ({
          ...sale,
          sale_items: allSaleItems.filter((it) => it.sale_id === sale.id),
        }));
      }
      return list;
    }

    if (action === 'insert') {
      const items = Array.isArray(data) ? data : [data];
      const newItems = items.map((item) => ({
        ...item,
        id: item.id || `loc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        created_at: item.created_at || new Date().toISOString(),
      }));
      setLocalData(table, [...list, ...newItems]);
      return newItems;
    }

    if (action === 'update') {
      let updatedRow: any = null;
      const updatedList = list.map((item) => {
        const match = filters.every((f) => String(item[f.col]) === String(f.val));
        if (match) {
          updatedRow = { ...item, ...data, updated_at: new Date().toISOString() };
          return updatedRow;
        }
        return item;
      });
      setLocalData(table, updatedList);
      return updatedRow;
    }

    if (action === 'delete') {
      const updatedList = list.filter((item) => {
        return !filters.every((f) => String(item[f.col]) === String(f.val));
      });
      setLocalData(table, updatedList);
      return true;
    }
  };
}

// Client helper: Counter PCs send data over LAN
async function sendLanQuery(payload: any): Promise<any> {
  const ip = getServerIP();
  try {
    const res = await fetch(`http://${ip}:${getServerPort()}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error || `LAN request failed (${res.status}).`);
    return json.data;
  } catch (e) {
    console.error(`Failed to connect to Main PC at ${ip}:${getServerPort()}`, e);
    return null;
  }
}

/** Replace a local adapter table, forwarding the operation to the Main PC over LAN on Counter PCs. */
export async function replaceLocalTable(table: string, rows: unknown[]): Promise<void> {
  if (!Array.isArray(rows)) throw new Error(`Invalid data for ${table}.`);

  if (getNetworkRole() === 'client') {
    const result = await sendLanQuery({ table, action: 'replace', data: rows });
    if (!Array.isArray(result)) throw new Error(`Main Server did not confirm saving ${table}.`);
    return;
  }

  try {
    localStorage.setItem(`pos_db_${table}`, JSON.stringify(rows));
  } catch (error) {
    throw new Error(`Could not save ${table} to local storage: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pos-local-data-changed', { detail: { table } }));
  }
}

/** Restore an allowlisted app-local record on this PC or the Main PC over the local LAN. */
export async function replaceLocalRecord(key: string, value: unknown): Promise<void> {
  if (!SYNCABLE_LOCAL_RECORD_KEYS.has(key)) throw new Error(`Local record ${key} cannot be restored.`);
  if (getNetworkRole() === 'client') {
    const result = await sendLanQuery({ table: '', action: 'storage_replace', data: { key, value } });
    if (result !== true) throw new Error(`Main Server did not confirm restoring ${key}.`);
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('pos-local-data-changed', { detail: { key } }));
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('pos-local-data-changed', { detail: { key } }));
}

export const supabase = {
  from: (table: string) => {
    const isClient = getNetworkRole() === 'client';
    const filters: { col: string; op: string; val: any }[] = [];
    let sortOrder: { col: string; ascending: boolean } | undefined;
    let limitCount: number | undefined;

    let list: any[] = isClient ? [] : JSON.parse(JSON.stringify(getLocalData(table, [])));

    const builder: any = {
      select: () => builder,
      order: (col: string, opts = { ascending: true }) => {
        sortOrder = { col, ascending: opts.ascending };
        if (!isClient) {
          list.sort((a, b) => {
            const valA = a[col] ?? '';
            const valB = b[col] ?? '';
            if (valA < valB) return opts.ascending ? -1 : 1;
            if (valA > valB) return opts.ascending ? 1 : -1;
            return 0;
          });
        }
        return builder;
      },
      limit: (n: number) => {
        limitCount = n;
        if (!isClient) list = list.slice(0, n);
        return builder;
      },
      eq: (col: string, val: any) => {
        filters.push({ col, op: 'eq', val });
        if (!isClient) list = list.filter((item) => String(item[col]) === String(val));
        return builder;
      },
      neq: (col: string, val: any) => {
        filters.push({ col, op: 'neq', val });
        if (!isClient) list = list.filter((item) => String(item[col]) !== String(val));
        return builder;
      },
      like: (col: string, pattern: string) => {
        filters.push({ col, op: 'like', val: pattern });
        if (!isClient) {
          const clean = pattern.replace(/%/g, '').toLowerCase();
          list = list.filter((item) => String(item[col] || '').toLowerCase().includes(clean));
        }
        return builder;
      },
      ilike: (col: string, pattern: string) => {
        filters.push({ col, op: 'ilike', val: pattern });
        if (!isClient) {
          const clean = pattern.replace(/%/g, '').toLowerCase();
          list = list.filter((item) => String(item[col] || '').toLowerCase().includes(clean));
        }
        return builder;
      },

      _executeSelect: async () => {
        if (isClient) {
          const remoteData = await sendLanQuery({
            table,
            action: 'select',
            filters,
            order: sortOrder,
            limit: limitCount,
          });
          return remoteData || [];
        }

        let result = [...list];
        if (table === 'sales') {
          const allSaleItems: SaleItem[] = getLocalData('sale_items', []);
          result = result.map((sale) => ({
            ...sale,
            sale_items: allSaleItems.filter((it) => it.sale_id === sale.id),
          }));
        }
        return result;
      },

      maybeSingle: async () => {
        const res = await builder._executeSelect();
        return { data: res[0] || null, error: null };
      },

      single: async () => {
        const res = await builder._executeSelect();
        return { data: res[0] || null, error: null };
      },

      then: (resolve: any, reject?: any) => {
        return builder._executeSelect().then((data: any) => resolve({ data, error: null })).catch(reject);
      },

      insert: (payload: any) => {
        const execInsert = async () => {
          if (isClient) {
            const res = await sendLanQuery({ table, action: 'insert', data: payload });
            return Array.isArray(res) ? res : [res];
          }
          const currentData: any[] = getLocalData(table, []);
          const items = Array.isArray(payload) ? payload : [payload];
          const newItems = items.map((item) => ({
            ...item,
            id: item.id || `loc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            created_at: item.created_at || new Date().toISOString(),
          }));
          setLocalData(table, [...currentData, ...newItems]);
          return newItems;
        };

        return {
          select: () => ({
            single: async () => {
              const res = await execInsert();
              return { data: res[0], error: null };
            },
            maybeSingle: async () => {
              const res = await execInsert();
              return { data: res[0], error: null };
            },
            then: (res: any, rej?: any) => execInsert().then((data) => res({ data, error: null })).catch(rej),
          }),
          then: (res: any, rej?: any) => execInsert().then((data) => res({ data, error: null })).catch(rej),
        };
      },

      update: (updates: any) => {
        return {
          eq: (col: string, val: any) => {
            filters.push({ col, op: 'eq', val });
            const execUpdate = async () => {
              if (isClient) {
                return await sendLanQuery({ table, action: 'update', data: updates, filters });
              }
              const currentData: any[] = getLocalData(table, []);
              let updatedRow: any = null;
              const updatedList = currentData.map((item) => {
                if (String(item[col]) === String(val)) {
                  updatedRow = { ...item, ...updates, updated_at: new Date().toISOString() };
                  return updatedRow;
                }
                return item;
              });
              setLocalData(table, updatedList);
              return updatedRow;
            };

            return {
              select: () => ({
                maybeSingle: async () => {
                  const data = await execUpdate();
                  return { data, error: null };
                },
                single: async () => {
                  const data = await execUpdate();
                  return { data, error: null };
                },
                then: (res: any, rej?: any) => execUpdate().then((data) => res({ data, error: null })).catch(rej),
              }),
              then: (res: any, rej?: any) => execUpdate().then((data) => res({ data, error: null })).catch(rej),
            };
          },
        };
      },

      delete: () => {
        return {
          eq: async (col: string, val: any) => {
            filters.push({ col, op: 'eq', val });
            if (isClient) {
              await sendLanQuery({ table, action: 'delete', filters });
              return { data: null, error: null };
            }
            const currentData: any[] = getLocalData(table, []);
            const updatedList = currentData.filter((item) => String(item[col]) !== String(val));
            setLocalData(table, updatedList);
            return { data: null, error: null };
          },
        };
      },
    };

    return builder;
  },
};
