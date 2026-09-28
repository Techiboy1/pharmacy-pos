import { useState, useEffect, useMemo } from 'react';
import { 
  Users, Search, Calendar, Eye, Printer, 
  RotateCcw, ShoppingBag, Layers, Edit2
} from 'lucide-react';
import { supabase, type StoreSettings } from '@/lib/supabase';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { printThermalReceipt } from '@/lib/print';

export function CustomerHistoryScreen({ 
  settings, 
  onNavigate 
}: { 
  settings?: StoreSettings | null;
  onNavigate?: (page: any) => void;
}) {
  const [sales, setSales] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingSale, setViewingSale] = useState<any | null>(null);

  // Tab filter: 'sales' | 'returns' | 'all'
  const [billTypeFilter, setBillTypeFilter] = useState<'sales' | 'returns' | 'all'>('sales');

  // Date filters
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'month' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  useEffect(() => {
    fetchSales();
  }, []);

  async function fetchSales() {
    const { data } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .order('created_at', { ascending: false });
    setSales(data || []);
  }

  function getLocalDateString(dateInput?: string) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // 1. Date Filtered Sales (Matching SalesScreen logic)
  const dateFilteredSales = useMemo(() => {
    const now = new Date();
    const todayStr = getLocalDateString(now.toISOString());
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yestStr = getLocalDateString(yest.toISOString());
    const currentMonth = todayStr.slice(0, 7);

    return sales.filter((s) => {
      const sDate = getLocalDateString(s.created_at);
      if (dateFilter === 'today') return sDate === todayStr;
      if (dateFilter === 'yesterday') return sDate === yestStr;
      if (dateFilter === 'month') return sDate.slice(0, 7) === currentMonth;
      if (dateFilter === 'custom') return sDate === customDate;
      return true;
    });
  }, [sales, dateFilter, customDate]);

  // 2. Tab Counts strictly synced with the chosen Date
  const tabCounts = useMemo(() => {
    let salesCount = 0;
    let returnsCount = 0;

    dateFilteredSales.forEach((s) => {
      if (s.invoice_no?.startsWith('RET-') || s.payment_type === 'Refund') {
        returnsCount++;
      } else {
        salesCount++;
      }
    });

    return { salesCount, returnsCount, total: dateFilteredSales.length };
  }, [dateFilteredSales]);

  // 3. Final filtered by Tab selection + Search query
  const filteredSales = useMemo(() => {
    let list = dateFilteredSales;

    if (billTypeFilter === 'sales') {
      list = list.filter((s) => !(s.invoice_no?.startsWith('RET-') || s.payment_type === 'Refund'));
    } else if (billTypeFilter === 'returns') {
      list = list.filter((s) => s.invoice_no?.startsWith('RET-') || s.payment_type === 'Refund');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((s) => {
        const invMatch = s.invoice_no && s.invoice_no.toLowerCase().includes(q);
        const cashierMatch = s.cashier_name && s.cashier_name.toLowerCase().includes(q);
        const custMatch = s.customer_name && s.customer_name.toLowerCase().includes(q);
        const phoneMatch = s.customer_phone && s.customer_phone.includes(q);
        return invMatch || cashierMatch || custMatch || phoneMatch;
      });
    }

    return list;
  }, [dateFilteredSales, billTypeFilter, searchQuery]);

  // -------------------------------------------------------------
  // EDIT INVOICE IN CART HANDLER (SALES -> POS, RETURNS -> RETURN)
  // -------------------------------------------------------------
  function handleEditInCart(sale: any) {
    const isReturn = sale.invoice_no?.startsWith('RET-') || sale.payment_type === 'Refund';
    const fallbackDate = new Date().toISOString().split('T')[0];

    if (isReturn) {
      // 1. Load into Return Module Draft
      const returnDraft = {
        mode: 'direct',
        invoiceSearch: '',
        originalSale: null,
        customerName: (sale.customer_name || '').replace('(RETURN)', '').trim(),
        customerPhone: sale.customer_phone || '',
        returnItems: (sale.sale_items || []).map((it: any) => ({
          medicine_id: it.medicine_id,
          name: it.name,
          unit: it.unit || 'Box',
          unit_price: Math.abs(Number(it.unit_price) || 0),
          qty: Math.abs(Number(it.qty) || 1),
          line_total: Math.abs(Number(it.line_total) || 0),
          tablets_per_box: Number(it.tablets_per_box) || 1,
          tablets_per_strip: Number(it.tablets_per_strip) || 1,
        })),
      };

      localStorage.setItem('pos_return_draft', JSON.stringify(returnDraft));
      if (onNavigate) onNavigate('returns');

      // Trigger event taake ReturnScreen foran cart load kare
      setTimeout(() => {
        window.dispatchEvent(new Event('pos_load_edit_return'));
      }, 50);
    } else {
      // 2. Load into Fast Billing (POS) Cart
      const cartItemsForPos = (sale.sale_items || []).map((it: any) => ({
        medicine_id: it.medicine_id,
        name: it.name,
        unit: it.unit || 'Box',
        unit_price: Number(it.unit_price) || 0,
        qty: Number(it.qty) || 1,
        discount_percent: Number(it.discount_percent) || 0,
        line_total: Number(it.line_total) || 0,
        tablets_per_box: Number(it.tablets_per_box) || 1,
        tablets_per_strip: Number(it.tablets_per_strip) || 1,
        available_stock: 999,
        batch_no: it.batch_no || 'N/A',
        expiry_date: it.expiry_date || fallbackDate,
      }));

      localStorage.setItem('pos_cart', JSON.stringify(cartItemsForPos));
      localStorage.setItem('pos_customer_name', sale.customer_name || '');
      localStorage.setItem('pos_customer_phone', sale.customer_phone || '');
      localStorage.setItem('pos_discount_percent', String(sale.discount || 0));

      if (onNavigate) onNavigate('pos');

      // Trigger event taake PosScreen foran cart load kare
      setTimeout(() => {
        window.dispatchEvent(new Event('pos_load_edit_bill'));
      }, 50);
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 select-none overflow-y-auto p-6 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Users className="h-6 w-6 text-indigo-600" />
            Customer Invoices & Billing History
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Search customer records, edit in cart, print receipts, and track returns.
          </p>
        </div>

        {/* Date Filter Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                dateFilter === 'today' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateFilter('yesterday')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                dateFilter === 'yesterday' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => setDateFilter('month')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                dateFilter === 'month' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                dateFilter === 'all' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Records
            </button>
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-300 shadow-xs">
            <Calendar className="h-4 w-4 text-indigo-600" />
            <input
              type="date"
              value={customDate}
              onChange={(e) => {
                setCustomDate(e.target.value);
                setDateFilter('custom');
              }}
              className="text-xs font-semibold text-slate-700 bg-transparent outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* TABS & SEARCH BAR */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
          <button
            onClick={() => setBillTypeFilter('sales')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
              billTypeFilter === 'sales'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Sales Invoices</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              billTypeFilter === 'sales' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {tabCounts.salesCount}
            </span>
          </button>

          <button
            onClick={() => setBillTypeFilter('returns')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
              billTypeFilter === 'returns'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="h-4 w-4" />
            <span>Returns History</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              billTypeFilter === 'returns' ? 'bg-rose-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {tabCounts.returnsCount}
            </span>
          </button>

          <button
            onClick={() => setBillTypeFilter('all')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
              billTypeFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>All</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-300 focus-within:border-indigo-500 focus-within:bg-white flex-1 min-w-[260px] max-w-md transition-all">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by invoice #, user / cashier, customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs font-semibold text-slate-800 bg-transparent outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600 text-xs font-bold">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Invoices History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">Customer Name</th>
                <th className="px-4 py-3.5">Invoice No</th>
                <th className="px-4 py-3.5">Billed By (User)</th>
                <th className="px-4 py-3.5">Date & Time</th>
                <th className="px-4 py-3.5 text-center">Items</th>
                <th className="px-4 py-3.5 text-right">Net Payable</th>
                <th className="px-4 py-3.5 text-center">Payment</th>
                <th className="px-4 py-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                    Is filter ya search ke mutabiq koi record nahi mila.
                  </td>
                </tr>
              ) : (
                filteredSales.map((s) => {
                  const isReturn = s.invoice_no?.startsWith('RET-') || s.payment_type === 'Refund';
                  const itemsCount = s.sale_items?.length || 0;
                  const net = Number(s.net_payable ?? s.total_amount ?? 0);

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-800 flex items-center gap-2">
                        {isReturn ? (
                          <span className="text-rose-600 flex items-center gap-1.5">
                            <RotateCcw className="h-3.5 w-3.5 text-rose-500" />
                            {s.customer_name || 'Return Slip'}
                          </span>
                        ) : (
                          <span>{s.customer_name || 'Walking Customer'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-bold text-indigo-700">
                        {s.invoice_no}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[11px] font-bold">
                          {s.cashier_name || 'TECHI'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {formatDateTime(s.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-center font-bold text-slate-700">
                        {itemsCount}
                      </td>
                      <td className={`px-4 py-3.5 text-right font-black ${isReturn ? 'text-rose-600' : 'text-slate-900'}`}>
                        {isReturn ? `-${formatCurrency(Math.abs(net))}` : formatCurrency(net)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                          isReturn ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {s.payment_type || 'Cash'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* EDIT IN CART BUTTON */}
                          <button
                            onClick={() => handleEditInCart(s)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            title={isReturn ? "Edit in Return Cart" : "Edit in Fast Billing Cart"}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() => setViewingSale(s)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="View Invoice Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          <button
                            onClick={() =>
                              printThermalReceipt({
                                settings: settings || null,
                                sale: s,
                                items: s.sale_items || [],
                              })
                            }
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Print Thermal Receipt"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bill View Modal */}
      {viewingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[2px]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 text-slate-800 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="font-bold text-base text-slate-800">Invoice: #{viewingSale.invoice_no}</h3>
                <p className="text-xs text-slate-500">
                  Customer: <strong>{viewingSale.customer_name || 'Walking Customer'}</strong> | Cashier: <strong>{viewingSale.cashier_name || 'TECHI'}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const toEdit = viewingSale;
                    setViewingSale(null);
                    handleEditInCart(toEdit);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold hover:bg-amber-100 cursor-pointer"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  <span>Edit in Cart</span>
                </button>
                <button
                  onClick={() =>
                    printThermalReceipt({
                      settings: settings || null,
                      sale: viewingSale,
                      items: viewingSale.sale_items || [],
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100 cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Slip</span>
                </button>
                <button onClick={() => setViewingSale(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer font-bold px-2 py-1">
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-2 py-2 text-center">Qty</th>
                    <th className="px-2 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(viewingSale.sale_items || []).map((it: any, i: number) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-bold text-slate-800">{it.name}</td>
                      <td className="px-2 py-2 text-center">{it.qty} {it.unit}</td>
                      <td className="px-2 py-2 text-right">{formatCurrency(Number(it.unit_price))}</td>
                      <td className="px-3 py-2 text-right font-black text-indigo-700">{formatCurrency(Number(it.line_total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold shrink-0">
              <span>Net Payable Amount:</span>
              <span className="text-base text-indigo-700 font-black">
                {formatCurrency(Number(viewingSale.net_payable ?? viewingSale.total_amount ?? 0))}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}