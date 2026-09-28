import { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, AlertTriangle, Check, PackagePlus } from 'lucide-react';
import { supabase, type Medicine } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';

export function DemandScreen() {
  const [items, setItems] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [restockModal, setRestockModal] = useState<Medicine | null>(null);
  const [newQty, setNewQty] = useState<string>('');
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetchDemandItems();
  }, []);

  async function fetchDemandItems() {
    setLoading(true);
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .order('stock_quantity', { ascending: true });

    if (!error && data) {
      setItems(data as Medicine[]);
    }
    setLoading(false);
  }

  // Filter items jo unki apni set ki hui alert limit par pohanch chuke hain
  const lowStockItems = useMemo(() => {
    return items.filter((m) => {
      const alertLimit = Number((m as any).min_stock_alert) || 5;
      const isLow = Number(m.stock_quantity || 0) <= alertLimit;
      if (!isLow) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        m.batch_no.toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleRestock(e: React.FormEvent) {
    e.preventDefault();
    if (!restockModal) return;

    const added = parseInt(newQty, 10);
    if (isNaN(added) || added <= 0) return;

    setUpdating(true);
    const totalNewStock = Number(restockModal.stock_quantity || 0) + added;

    const { error } = await supabase
      .from('medicines')
      .update({
        stock_quantity: totalNewStock,
        updated_at: new Date().toISOString(),
      })
      .eq('id', restockModal.id);

    setUpdating(false);
    if (!error) {
      showToast(`${restockModal.name} restocked! Moved back to Inventory.`);
      setRestockModal(null);
      setNewQty('');
      fetchDemandItems();
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-800">Demand / Restocking List</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
              {lowStockItems.length} Urgent Items
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Items that reached their custom min-stock alert limit. Restock to move them back to inventory.
          </p>
        </div>

        <button
          onClick={fetchDemandItems}
          className="p-2 border border-slate-300 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
          title="Refresh list"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {toast && (
          <div className="mb-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Check className="h-4 w-4" /> {toast}
          </div>
        )}

        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search urgent item name or batch…"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
          />
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Checking demand stock…</div>
        ) : lowStockItems.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-16 text-center text-slate-500 text-sm shadow-sm">
            <Check className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
            <div className="font-semibold text-slate-700 text-base">Sab Gud Hai! No Shortage.</div>
            <p className="text-slate-400 mt-1">All items are above their configured alert limits.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-amber-50/50 text-slate-600 text-xs uppercase border-b border-amber-100">
                  <tr>
                    <th className="text-left px-4 py-3">Medicine / Item Name</th>
                    <th className="text-left px-4 py-3">Batch & Expiry</th>
                    <th className="text-right px-4 py-3">Sale Price</th>
                    <th className="text-center px-4 py-3">Remaining Stock</th>
                    <th className="text-center px-4 py-3">Alert Threshold</th>
                    <th className="text-center px-4 py-3">Urgency Status</th>
                    <th className="text-right px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStockItems.map((m) => {
                    const isZero = Number(m.stock_quantity) <= 0;
                    return (
                      <tr key={m.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800">{m.name}</td>
                        <td className="px-4 py-3 text-slate-500">
                          {m.batch_no}
                          <br />
                          <span className="text-xs">Exp: {formatDate(m.expiry_date)}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {formatCurrency(Number(m.sale_price))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-block font-bold text-base px-2.5 py-0.5 rounded-md ${
                              isZero ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {m.stock_quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-semibold text-slate-600">
                          {(m as any).min_stock_alert || 5} units
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                              isZero ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {isZero ? 'Out of Stock' : 'Low Stock Demand'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setRestockModal(m);
                              setNewQty('20');
                            }}
                            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3 py-1.5 rounded-lg shadow-sm cursor-pointer transition-colors"
                          >
                            <PackagePlus className="h-3.5 w-3.5" />
                            Restock Now
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {restockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="font-semibold text-slate-800 text-base flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-emerald-600" />
              Restock Item
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Adding new received units for <strong className="text-slate-700">{restockModal.name}</strong>.
            </p>

            <form onSubmit={handleRestock} className="mt-4 space-y-3">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs flex justify-between">
                <span className="text-slate-500">Current Stock:</span>
                <span className="font-bold text-slate-800">{restockModal.stock_quantity} units</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Kitni nayi quantity add karni hai?
                </label>
                <input
                  type="number"
                  min="1"
                  autoFocus
                  required
                  placeholder="e.g. 20"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="text-xs text-emerald-700 font-medium pt-1">
                New Total Stock:{' '}
                <strong>
                  {Number(restockModal.stock_quantity || 0) + (parseInt(newQty, 10) || 0)}
                </strong>{' '}
                units
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setRestockModal(null)}
                  className="px-3.5 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-xs hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating || !newQty}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold disabled:bg-slate-300 cursor-pointer"
                >
                  {updating ? 'Updating…' : 'Add to Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}