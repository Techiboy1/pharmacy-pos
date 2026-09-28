import { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, ArrowUpRight, RotateCcw, 
  Package, Calendar
} from 'lucide-react';
import { supabase, type StoreSettings } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';

export function SalesScreen({ settings }: { settings?: StoreSettings | null }) {
  const [sales, setSales] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>(() => {
    const saved = localStorage.getItem('pos_purchases');
    return saved ? JSON.parse(saved) : [];
  });

  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'month' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  useEffect(() => {
    fetchSales();
    const saved = localStorage.getItem('pos_purchases');
    if (saved) setPurchases(JSON.parse(saved));
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

  // Filter Sales By Date
  const filteredSales = useMemo(() => {
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

  // Filter Purchases By Date
  const filteredPurchases = useMemo(() => {
    const now = new Date();
    const todayStr = getLocalDateString(now.toISOString());
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yestStr = getLocalDateString(yest.toISOString());
    const currentMonth = todayStr.slice(0, 7);

    return purchases.filter((p) => {
      const pDate = p.purchase_date || getLocalDateString(p.created_at);
      if (dateFilter === 'today') return pDate === todayStr;
      if (dateFilter === 'yesterday') return pDate === yestStr;
      if (dateFilter === 'month') return pDate.slice(0, 7) === currentMonth;
      if (dateFilter === 'custom') return pDate === customDate;
      return true;
    });
  }, [purchases, dateFilter, customDate]);

  // Totals & Analytics Calculations
  const stats = useMemo(() => {
    let freshSaleAmt = 0;
    let returnRefundAmt = 0;
    let regularCount = 0;
    let returnCount = 0;

    filteredSales.forEach((s) => {
      const isReturn = s.invoice_no?.startsWith('RET-') || s.payment_type === 'Refund';
      const net = Math.abs(Number(s.net_payable ?? s.total_amount ?? 0));

      if (isReturn) {
        returnCount++;
        returnRefundAmt += net;
      } else {
        regularCount++;
        freshSaleAmt += net;
      }
    });

    const totalPurchaseAmt = filteredPurchases.reduce((sum, p) => sum + (Number(p.net_payable) || 0), 0);
    const netActualSale = Math.max(0, freshSaleAmt - returnRefundAmt);
    const estimatedProfit = netActualSale * 0.17;

    return {
      regularCount,
      returnCount,
      freshSale: freshSaleAmt,
      returnRefund: returnRefundAmt,
      netProfit: estimatedProfit,
      purchaseCount: filteredPurchases.length,
      totalPurchase: totalPurchaseAmt,
    };
  }, [filteredSales, filteredPurchases]);

  return (
    <div className="flex flex-col h-full bg-slate-50 select-none overflow-y-auto p-6 space-y-6">
      {/* Top Header & Date Filter Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-indigo-600" />
            Sales & Financial Reports
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time revenue, customer returns, purchase expense, and net profits summary.
          </p>
        </div>

        {/* Date Filters */}
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

          {/* Calendar Picker */}
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

      {/* 4 BALANCED CARDS: TOTAL SALES, TOTAL RETURNS, TOTAL PROFIT, TOTAL PURCHASES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: TOTAL SALES (RS) WITH INVOICES COUNT UNDERNEATH */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-xs space-y-3 relative overflow-hidden bg-gradient-to-br from-white to-emerald-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Total Sales</span>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-lg font-bold text-xs">
              PKR
            </span>
          </div>
          <div>
            <div className="text-3xl font-black text-emerald-700">
              {formatCurrency(stats.freshSale)}
            </div>
            <div className="text-xs text-emerald-600 mt-1 font-medium">
              {stats.regularCount} Invoices Billed
            </div>
          </div>
        </div>

        {/* CARD 2: TOTAL RETURNS (RS) */}
        <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-xs space-y-3 relative overflow-hidden bg-gradient-to-br from-white to-rose-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Total Returns</span>
            <div className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
              <RotateCcw className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-rose-600">
              {formatCurrency(stats.returnRefund)}
            </div>
            <div className="text-xs text-rose-500 mt-1 font-medium">
              {stats.returnCount} Returns refunded
            </div>
          </div>
        </div>

        {/* CARD 3: TOTAL PROFIT (RS) */}
        <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-xs space-y-3 relative overflow-hidden bg-gradient-to-br from-white to-blue-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Total Profit</span>
            <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-blue-700">
              {formatCurrency(stats.netProfit)}
            </div>
            <div className="text-xs text-blue-600 mt-1 font-medium">
              Estimated earnings margin
            </div>
          </div>
        </div>

        {/* CARD 4: TOTAL PURCHASES (RS) */}
        <div className="bg-white p-5 rounded-2xl border border-purple-200 shadow-xs space-y-3 relative overflow-hidden bg-gradient-to-br from-white to-purple-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">Total Purchases</span>
            <div className="p-1.5 bg-purple-100 text-purple-700 rounded-lg">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black text-purple-700">
              {formatCurrency(stats.totalPurchase)}
            </div>
            <div className="text-xs text-purple-600 mt-1 font-medium">
              {stats.purchaseCount} Supply Bills Logged
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}