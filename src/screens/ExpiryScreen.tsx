import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, CheckCircle2, RotateCcw, PackageX, CalendarClock } from 'lucide-react';
import { supabase, type Medicine } from '@/lib/supabase';
import { formatDate } from '@/lib/utils';

export function ExpiryScreen() {
  const [meds, setMeds] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetchInventory();
  }, []);

  async function fetchInventory() {
    setLoading(true);
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .order('expiry_date', { ascending: true });

    if (!error && data) {
      setMeds(data as Medicine[]);
    }
    setLoading(false);
  }

  // Filter medicines based on their own configured alert months
  const expiringMeds = useMemo(() => {
    const today = new Date();

    return meds.filter((m) => {
      if (!m.expiry_date) return false;
      const expDate = new Date(m.expiry_date);

      // Har item ka apna alert months limit (by default 3)
      const itemAlertMonths = Number((m as any).expiry_alert_months) || 3;
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() + itemAlertMonths);

      const isDue = expDate <= cutoffDate;
      if (!isDue) return false;

      if (!query.trim()) return true;
      const q = query.toLowerCase().trim();
      return m.name.toLowerCase().includes(q) || m.batch_no.toLowerCase().includes(q);
    });
  }, [meds, query]);

  async function handleReturnOrDispose(item: Medicine) {
    const confirmed = confirm(
      `Confirm Return / Dispose for "${item.name}" (Batch: ${item.batch_no})?\nThis medicine will be completely removed from active inventory.`
    );
    if (!confirmed) return;

    setProcessingId(item.id);
    setNotification(null);

    const { error } = await supabase.from('medicines').delete().eq('id', item.id);

    if (error) {
      setNotification({ kind: 'err', text: `Failed to remove ${item.name} from inventory.` });
    } else {
      setNotification({ kind: 'ok', text: `"${item.name}" marked Returned/Disposed and cleared from inventory.` });
      setMeds((prev) => prev.filter((m) => m.id !== item.id));
    }
    setProcessingId(null);
  }

  function getDaysLeft(dateStr: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(dateStr);
    exp.setHours(0, 0, 0, 0);
    return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-800">Expiry Tracker & Returns</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
              {expiringMeds.length} Items Due
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Automated monitoring for expired and near-expiry medicines based on each item's alert settings.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {notification && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm border shadow-sm ${
              notification.kind === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {notification.kind === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            )}
            <span>{notification.text}</span>
            <button className="ml-auto font-bold text-xs" onClick={() => setNotification(null)}>
              Dismiss
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search expiring medicine or batch..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          />
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Checking expiry records…</div>
        ) : expiringMeds.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-16 text-center text-slate-500 text-sm shadow-sm">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            No near-expiry or expired medicines currently due.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3">Medicine</th>
                    <th className="text-left px-4 py-3">Batch</th>
                    <th className="text-left px-4 py-3">Expiry Date</th>
                    <th className="text-center px-4 py-3">Remaining Time</th>
                    <th className="text-center px-4 py-3">Stock Units</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expiringMeds.map((m) => {
                    const daysLeft = getDaysLeft(m.expiry_date);
                    const isPast = daysLeft <= 0;

                    return (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-800">{m.name}</td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">{m.batch_no}</td>
                        <td className="px-4 py-3 text-slate-600 font-medium">
                          {formatDate(m.expiry_date)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isPast ? (
                            <span className="text-xs font-bold text-red-600">
                              Expired ({Math.abs(daysLeft)} days ago)
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-amber-600">
                              {daysLeft} days remaining
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-bold text-slate-800 px-2 py-0.5 bg-slate-100 rounded text-xs">
                            {m.stock_quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isPast ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700">
                              <PackageX className="h-3 w-3" /> Expired
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              <CalendarClock className="h-3 w-3" /> Near Expiry
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={processingId === m.id}
                            onClick={() => handleReturnOrDispose(m)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200 text-xs font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {processingId === m.id ? 'Processing...' : 'Returned / Dispose'}
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
    </div>
  );
}