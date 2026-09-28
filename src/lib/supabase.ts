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
  return (localStorage.getItem('pos_network_role') as 'server' | 'client') || 'server';
}

export function getServerIP(): string {
  return localStorage.getItem('pos_server_ip') || '192.168.1.1';
}

// Global hook: Main PC handles queries sent over LAN cable
if (typeof window !== 'undefined') {
  (window as any).__handleLanRequest = async (payload: {
    table: string;
    action: 'select' | 'insert' | 'update' | 'delete';
    filters?: any[];
    data?: any;
    order?: { col: string; ascending: boolean };
    limit?: number;
  }) => {
    const { table, action, filters = [], data, order, limit } = payload;
    let list: any[] = getLocalData(table, []);

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
    const res = await fetch(`http://${ip}:45455/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json.data;
  } catch (e) {
    console.error(`Failed to connect to Main PC at ${ip}:45455`, e);
    return null;
  }
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
