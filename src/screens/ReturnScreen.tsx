import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  RotateCcw, Search, Trash2, Printer, 
  Receipt, Plus, Minus, Calendar, CheckCircle2, AlertCircle, X
} from 'lucide-react';
import { supabase, type Medicine, type StoreSettings, type SaleUnit } from '@/lib/supabase';
import { formatCurrency, priceForUnit, tabletsForQty, tabletsPerBox } from '@/lib/utils';
import { printThermalReceipt } from '@/lib/print';

export interface ReturnItem {
  medicine_id: string;
  name: string;
  unit: SaleUnit;
  unit_price: number;
  qty: number;
  line_total: number;
  tablets_per_box: number;
  tablets_per_strip: number;
  batch_no?: string;
  expiry_date?: string;
  category?: string;
}

export function ReturnScreen({ settings }: { settings?: StoreSettings | null }) {
  // Load saved draft if user navigated away or closed software
  const savedReturnDraft = useMemo(() => {
    try {
      const raw = localStorage.getItem('pos_return_draft');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  // Mode Selection: 'direct' or 'with_bill'
  const [mode, setMode] = useState<'with_bill' | 'direct'>(() => savedReturnDraft?.mode || 'direct');

  // Date Filter State
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'month' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Invoice Search state for 'with_bill' mode
  const [invoiceSearch, setInvoiceSearch] = useState(() => savedReturnDraft?.invoiceSearch || '');
  const [matchingSales, setMatchingSales] = useState<any[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const [customerName, setCustomerName] = useState(() => savedReturnDraft?.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(() => savedReturnDraft?.customerPhone || '');
  const [returnItems, setReturnItems] = useState<ReturnItem[]>(() => savedReturnDraft?.returnItems || []);

  // Summary adjustments
  const [returnDiscount, setReturnDiscount] = useState(() => savedReturnDraft?.returnDiscount || '0');
  const [roundOff, setRoundOff] = useState(() => savedReturnDraft?.roundOff || '0');

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Sequential Refs
  const inlineSearchRef = useRef<HTMLInputElement>(null);
  const billSearchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const discRef = useRef<HTMLInputElement>(null);
  const roundOffRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetchMedicines();
    setTimeout(() => {
      if (mode === 'direct') {
        inlineSearchRef.current?.focus();
      } else {
        billSearchInputRef.current?.focus();
      }
    }, 150);
  }, [mode]);

  async function fetchMedicines() {
    const { data } = await supabase.from('medicines').select('*').order('name');
    setMedicines(data || []);
  }

  // Smart Category / Type detection (Panadol Syrup vs Injection vs Tablet)
  function getItemType(m: any): 'tablet' | 'injection' | 'general' {
    const spb = Number(m.strips_per_box) || 1;
    const tps = Number(m.tablets_per_strip) || 1;
    const nameLower = (m.name || '').toLowerCase();
    const categoryLower = (m.category || '').toLowerCase();

    if (
      categoryLower === 'injection' ||
      nameLower.includes('inj') ||
      nameLower.includes('amp') ||
      nameLower.includes('vial') ||
      categoryLower.includes('inj')
    ) {
      return 'injection';
    }

    if (
      categoryLower === 'syrup' ||
      categoryLower === 'cream' ||
      categoryLower === 'suspension' ||
      categoryLower === 'drops' ||
      categoryLower === 'general' ||
      nameLower.includes('syp') ||
      nameLower.includes('syrup') ||
      nameLower.includes('susp') ||
      (spb === 1 && tps === 1 && !nameLower.includes('tab') && !nameLower.includes('cap'))
    ) {
      return 'general';
    }

    return 'tablet';
  }

  // AUTO LOAD EDIT RETURN FROM CUSTOMER HISTORY (LIVE EVENT)
  useEffect(() => {
    function loadEditedReturnDraft() {
      try {
        const raw = localStorage.getItem('pos_return_draft');
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft) {
            setMode(draft.mode || 'direct');
            setCustomerName(draft.customerName || '');
            setCustomerPhone(draft.customerPhone || '');
            if (Array.isArray(draft.returnItems) && draft.returnItems.length > 0) {
              setReturnItems(draft.returnItems);
            }
          }
        }
      } catch (e) {
        console.error('Error loading return draft:', e);
      }
    }

    loadEditedReturnDraft();
    window.addEventListener('pos_load_edit_return', loadEditedReturnDraft);
    return () => window.removeEventListener('pos_load_edit_return', loadEditedReturnDraft);
  }, []);

  // REAL-TIME AUTO-PERSIST DRAFT
  useEffect(() => {
    if (returnItems.length > 0 || customerName.trim() || customerPhone.trim() || invoiceSearch.trim()) {
      const draft = {
        mode,
        invoiceSearch,
        customerName,
        customerPhone,
        returnItems,
        returnDiscount,
        roundOff,
      };
      localStorage.setItem('pos_return_draft', JSON.stringify(draft));
    } else {
      localStorage.removeItem('pos_return_draft');
    }
  }, [mode, invoiceSearch, customerName, customerPhone, returnItems, returnDiscount, roundOff]);

  function clearReturnDraft() {
    setReturnItems([]);
    setCustomerName('');
    setCustomerPhone('');
    setInvoiceSearch('');
    setReturnDiscount('0');
    setRoundOff('0');
    localStorage.removeItem('pos_return_draft');
    if (mode === 'direct') {
      inlineSearchRef.current?.focus();
    } else {
      billSearchInputRef.current?.focus();
    }
  }

  // Global ESC listener to jump to Return Summary
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowItemDropdown(false);
        discRef.current?.focus();
        discRef.current?.select();
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowItemDropdown(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // -------------------------------------------------------------
  // MULTI-FIELD SEARCH FOR 'RETURN AGAINST INVOICE'
  // -------------------------------------------------------------
  async function searchSalesMultiField(term: string) {
    setInvoiceSearch(term);
    if (!term.trim()) {
      setMatchingSales([]);
      setShowSearchDropdown(false);
      return;
    }

    const q = term.trim().toLowerCase();
    const { data } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .order('created_at', { ascending: false })
      .limit(80);

    if (data) {
      const matched = data.filter((s: any) => {
        const inv = (s.invoice_no || '').toLowerCase();
        const cust = (s.customer_name || '').toLowerCase();
        const cash = (s.cashier_name || '').toLowerCase();
        const ph = (s.customer_phone || '');
        return inv.includes(q) || cust.includes(q) || cash.includes(q) || ph.includes(q);
      }).slice(0, 6);

      setMatchingSales(matched);
      setShowSearchDropdown(matched.length > 0);
    }
  }

  function selectSaleForReturn(sale: any) {
    setCustomerName((sale.customer_name || 'Walking Customer').replace('(RETURN)', '').trim());
    setCustomerPhone(sale.customer_phone || '');
    setInvoiceSearch(sale.invoice_no || '');
    setShowSearchDropdown(false);

    const itemsFromBill: ReturnItem[] = (sale.sale_items || []).map((it: any) => ({
      medicine_id: it.medicine_id,
      name: it.name,
      unit: it.unit || 'Box',
      unit_price: Math.abs(Number(it.unit_price) || 0),
      qty: Math.abs(Number(it.qty) || 1),
      line_total: Math.abs(Number(it.line_total) || 0),
      tablets_per_box: Number(it.tablets_per_box) || 1,
      tablets_per_strip: Number(it.tablets_per_strip) || 1,
      batch_no: it.batch_no || 'N/A',
      expiry_date: it.expiry_date || new Date().toISOString().split('T')[0],
      category: it.category,
    }));

    setReturnItems(itemsFromBill);
  }

  // -------------------------------------------------------------
  // DIRECT RETURN INLINE SEARCH
  // -------------------------------------------------------------
  const itemMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return medicines
      .filter((m) => m.name.toLowerCase().includes(q) || (m.batch_no && m.batch_no.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [medicines, searchQuery]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [itemMatches]);

  function addMedicineToReturn(med: Medicine) {
    const existing = returnItems.find((r) => r.medicine_id === med.id);
    const medId = med.id;
    const itType = getItemType(med);
    const defaultUnit: SaleUnit = itType === 'general' ? 'Box' : 'Tablet';

    if (existing) {
      updateQty(medId, existing.qty + 1);
    } else {
      const price = priceForUnit(med, defaultUnit);

      setReturnItems((prev) => [
        ...prev,
        {
          medicine_id: med.id,
          name: med.name,
          unit: defaultUnit,
          unit_price: price,
          qty: 1,
          line_total: price,
          tablets_per_box: tabletsPerBox(med),
          tablets_per_strip: Math.max(1, med.tablets_per_strip || 1),
          batch_no: (med as any).batch_no || 'N/A',
          expiry_date: (med as any).expiry_date || new Date().toISOString().split('T')[0],
          category: (med as any).category,
        },
      ]);
    }

    setSearchQuery('');
    setShowItemDropdown(false);

    // Sequential focus: Pehle Unit Select (agar tablet/inj ho) warna seedha Qty
    setTimeout(() => {
      const unitEl = document.getElementById(`ret-unit-${medId}`) as HTMLSelectElement;
      if (unitEl && itType !== 'general') {
        unitEl.focus();
      } else {
        const qtyEl = document.getElementById(`ret-qty-${medId}`) as HTMLInputElement;
        qtyEl?.focus();
        qtyEl?.select();
      }
    }, 60);
  }

  function updateQty(medicineId: string, newQty: number) {
    setReturnItems((prev) =>
      prev.map((it) => (it.medicine_id === medicineId ? { ...it, qty: newQty, line_total: it.unit_price * newQty } : it))
    );
  }

  function updateUnit(medicineId: string, unit: SaleUnit) {
    const med = medicines.find((m) => m.id === medicineId);
    if (!med) return;
    const price = priceForUnit(med, unit);

    setReturnItems((prev) =>
      prev.map((it) =>
        it.medicine_id === medicineId
          ? { ...it, unit, unit_price: price, line_total: price * it.qty }
          : it
      )
    );
  }

  function removeItem(medicineId: string) {
    setReturnItems((prev) => prev.filter((r) => r.medicine_id !== medicineId));
    if (mode === 'direct') {
      inlineSearchRef.current?.focus();
    }
  }

  // Summary Calculations
  const grossRefundSubtotal = useMemo(() => {
    return returnItems.reduce((sum, it) => sum + (it.line_total || 0), 0);
  }, [returnItems]);

  const discPercent = Number(returnDiscount) || 0;
  const discAmt = (grossRefundSubtotal * discPercent) / 100;
  const roundAdj = Number(roundOff) || 0;
  const netRefundPayable = Math.max(0, grossRefundSubtotal - discAmt + roundAdj);

  // Execute Restock and Complete Return Slip
  async function handleConfirmRefund() {
    if (returnItems.length === 0) {
      alert('Return karne ke liye pehle items add karein.');
      return;
    }

    const returnInvoiceNo = `RET-${Date.now().toString().slice(-6)}`;
    const cashierName = localStorage.getItem('pos_active_user') || 'TECHI';

    // 1. Restock to master medicines table
    try {
      await Promise.all(
        returnItems.map(async (it) => {
          const med = medicines.find((m) => m.id === it.medicine_id);
          if (med) {
            const addedStock = tabletsForQty(Math.max(1, it.qty), it.unit, it);
            const newStock = Number(med.stock_quantity || 0) + addedStock;
            return supabase
              .from('medicines')
              .update({ stock_quantity: newStock, updated_at: new Date().toISOString() })
              .eq('id', it.medicine_id);
          }
        })
      );
    } catch (e) {
      console.warn('Offline mode: Medicines restocked locally');
    }

    // 2. Restock batches locally for FIFO availability
    try {
      const existingBatches = JSON.parse(localStorage.getItem('pos_batches') || '[]');
      returnItems.forEach((it) => {
        const matching = existingBatches.find((b: any) => b.medicine_id === it.medicine_id);
        if (matching) {
          matching.remaining_qty = Number(matching.remaining_qty || 0) + tabletsForQty(Math.max(1, it.qty), it.unit, it);
        }
      });
      localStorage.setItem('pos_batches', JSON.stringify(existingBatches));
    } catch (err) {
      console.warn('Batch restock fallback skipped');
    }

    // 3. Save Refund Record in Supabase Sales table as Return slip
    const returnRecord = {
      invoice_no: returnInvoiceNo,
      customer_name: customerName.trim() ? `${customerName.trim()} (RETURN)` : 'Walking Customer (RETURN)',
      customer_phone: customerPhone.trim() || null,
      cashier_name: cashierName,
      total_amount: -grossRefundSubtotal,
      discount: discAmt,
      round_off: roundAdj,
      net_payable: -netRefundPayable,
      cash_received: 0,
      change_return: 0,
      payment_type: 'Refund',
      created_at: new Date().toISOString(),
    };

    const { data: insertedSale, error: saleErr } = await supabase
      .from('sales')
      .insert([returnRecord])
      .select()
      .single();

    if (!saleErr && insertedSale) {
      const itemsPayload = returnItems.map((it) => ({
        sale_id: insertedSale.id,
        medicine_id: it.medicine_id,
        name: it.name,
        unit: it.unit,
        unit_price: it.unit_price,
        qty: Math.max(1, it.qty),
        line_total: it.line_total,
      }));
      await supabase.from('sale_items').insert(itemsPayload);
    }

    // 4. Print Thermal Sales Return Slip
    printThermalReceipt({
      settings: settings || null,
      sale: returnRecord,
      items: returnItems,
    });

    // Clear Draft on Success
    clearReturnDraft();
    fetchMedicines();
    alert(`Return invoice #${returnInvoiceNo} ban chuki hai aur stock wapas inventory me add ho gaya hai!`);
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 select-none overflow-y-auto p-4 sm:p-6 space-y-4">
      {/* Top Header: Mode Switcher & Date Filter Together */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 shrink-0">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">Sales Return & Restock</h1>
            <p className="text-xs text-slate-500">Auto-restock, customer refund slips & adjustments</p>
          </div>
        </div>

        {/* Dual Mode Switcher Buttons */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setMode('direct');
              setTimeout(() => inlineSearchRef.current?.focus(), 60);
            }}
            className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
              mode === 'direct' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Direct Return (Without Bill)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('with_bill');
              setTimeout(() => billSearchInputRef.current?.focus(), 60);
            }}
            className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
              mode === 'with_bill' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Return Against Invoice #
          </button>
        </div>

        {/* Date Filter Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setDateFilter('today')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                dateFilter === 'today' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('yesterday')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                dateFilter === 'yesterday' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('month')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                dateFilter === 'month' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                dateFilter === 'all' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-xl border border-slate-300 shadow-xs">
            <Calendar className="h-3.5 w-3.5 text-rose-600" />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols */}
        <div className="lg:col-span-2 space-y-4">
          {/* SEARCH BAR ONLY IN 'RETURN AGAINST INVOICE' MODE */}
          {mode === 'with_bill' && (
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs relative">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Search Invoice by Bill #, Customer Name, or Cashier / User ID:
              </label>
              <div className="flex items-center gap-2.5 border border-slate-300 rounded-lg px-3 py-1.5 focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/20">
                <Receipt className="h-4 w-4 text-rose-600 shrink-0" />
                <input
                  ref={billSearchInputRef}
                  type="text"
                  placeholder="e.g. INV-20260927-3919, Walking Customer, or counter man..."
                  value={invoiceSearch}
                  onChange={(e) => searchSalesMultiField(e.target.value)}
                  className="flex-1 text-xs font-semibold text-slate-800 outline-none"
                />
              </div>

              {/* Multi-match live dropdown */}
              {showSearchDropdown && matchingSales.length > 0 && (
                <div className="absolute left-3.5 right-3.5 top-full mt-1 bg-white border border-slate-300 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto">
                  {matchingSales.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => selectSaleForReturn(s)}
                      className="p-3 border-b border-slate-100 hover:bg-rose-50 cursor-pointer flex items-center justify-between transition-colors"
                    >
                      <div>
                        <div className="font-mono font-bold text-indigo-700 text-xs">{s.invoice_no}</div>
                        <div className="text-[11px] text-slate-500">
                          Customer: <strong>{s.customer_name || 'Walking Customer'}</strong> | Cashier: <strong className="text-emerald-700">{s.cashier_name || 'TECHI'}</strong>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black text-slate-800">
                          {formatCurrency(Math.abs(Number(s.net_payable ?? s.total_amount ?? 0)))}
                        </div>
                        <div className="text-[10px] text-rose-600 font-bold">Click to load bill</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Customer Meta Details */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Customer Name (Optional)</label>
              <input
                type="text"
                placeholder="Walking / Ali"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Customer Phone (Optional)</label>
              <input
                type="text"
                placeholder="0300-1234567"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500 font-mono"
              />
            </div>
          </div>

          {/* Table Cart With Built-In Inline Search Row (Fast Billing Style) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-visible">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase">
                Return Items Cart ({returnItems.length})
              </span>
              {returnItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Kya aap waqai is return draft ko clear karna chahte hain?')) {
                      clearReturnDraft();
                    }
                  }}
                  className="text-xs text-rose-600 font-bold hover:underline cursor-pointer"
                >
                  Clear Cart
                </button>
              )}
            </div>

            <div className="overflow-visible">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100/75 text-slate-600 font-semibold uppercase border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5">Item Name</th>
                    <th className="px-3 py-2.5 text-center">Unit</th>
                    <th className="px-3 py-2.5 text-center">Return Qty</th>
                    <th className="px-3 py-2.5 text-right">Unit Rate</th>
                    <th className="px-4 py-2.5 text-right">Refund Total</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {returnItems.map((it, idx) => {
                    const originalMed = medicines.find((m) => m.id === it.medicine_id);
                    const itType = originalMed ? getItemType(originalMed) : getItemType(it);

                    return (
                      <tr key={it.medicine_id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-bold text-slate-800">{it.name}</td>
                        
                        {/* SMART CATEGORY UNIT DISPLAY: Panadol Syp = Pcs / Bot! */}
                        <td className="px-3 py-2 text-center">
                          {itType === 'general' ? (
                            <span className="inline-block text-xs font-bold px-2 py-1 rounded bg-slate-100 text-slate-700">
                              Pcs / Bot
                            </span>
                          ) : itType === 'injection' ? (
                            <select
                              id={`ret-unit-${it.medicine_id}`}
                              value={it.unit === 'Box' ? 'Box' : 'Tablet'}
                              onChange={(e) => updateUnit(it.medicine_id, e.target.value as SaleUnit)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const qtyEl = document.getElementById(`ret-qty-${it.medicine_id}`) as HTMLInputElement;
                                  qtyEl?.focus();
                                  qtyEl?.select();
                                }
                              }}
                              className="text-xs border border-blue-400 rounded px-2 py-1 bg-blue-50 text-blue-900 font-bold outline-none cursor-pointer"
                            >
                              <option value="Tablet">Inj / Amp</option>
                              <option value="Box">Box</option>
                            </select>
                          ) : (
                            <select
                              id={`ret-unit-${it.medicine_id}`}
                              value={it.unit}
                              onChange={(e) => updateUnit(it.medicine_id, e.target.value as SaleUnit)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const qtyEl = document.getElementById(`ret-qty-${it.medicine_id}`) as HTMLInputElement;
                                  qtyEl?.focus();
                                  qtyEl?.select();
                                }
                              }}
                              className="text-xs border border-rose-300 rounded px-2 py-1 bg-rose-50 text-rose-900 font-semibold outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                            >
                              <option value="Tablet">Tablet</option>
                              <option value="Strip">Strip</option>
                              <option value="Box">Box</option>
                            </select>
                          )}
                        </td>

                        {/* Return Qty with Backspace clearing and Enter Flow */}
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => updateQty(it.medicine_id, Math.max(1, (it.qty || 1) - 1))}
                              className="grid place-items-center h-6 w-6 rounded border border-slate-300 hover:bg-slate-100 text-slate-600"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              id={`ret-qty-${it.medicine_id}`}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={it.qty === 0 ? '' : it.qty}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                  updateQty(it.medicine_id, 0);
                                } else {
                                  const num = parseInt(val.replace(/\D/g, ''), 10);
                                  if (!isNaN(num)) {
                                    updateQty(it.medicine_id, num);
                                  }
                                }
                              }}
                              onBlur={() => {
                                if (!it.qty || it.qty < 1) {
                                  updateQty(it.medicine_id, 1);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const next = returnItems[idx + 1];
                                  if (next) {
                                    const nextUnit = document.getElementById(`ret-unit-${next.medicine_id}`) as HTMLSelectElement;
                                    if (nextUnit) {
                                      nextUnit.focus();
                                    } else {
                                      const nextQty = document.getElementById(`ret-qty-${next.medicine_id}`) as HTMLInputElement;
                                      nextQty?.focus();
                                      nextQty?.select();
                                    }
                                  } else {
                                    if (mode === 'direct') {
                                      inlineSearchRef.current?.focus();
                                    } else {
                                      discRef.current?.focus();
                                      discRef.current?.select();
                                    }
                                  }
                                } else if (e.key === 'Backspace' && (it.qty === 0 || !it.qty)) {
                                  e.preventDefault();
                                  removeItem(it.medicine_id);
                                }
                              }}
                              className="w-12 text-center border border-slate-300 rounded py-0.5 text-xs font-bold outline-none focus:ring-2 focus:ring-rose-500"
                            />
                            <button
                              type="button"
                              onClick={() => updateQty(it.medicine_id, (it.qty || 0) + 1)}
                              className="grid place-items-center h-6 w-6 rounded border border-slate-300 hover:bg-slate-100 text-slate-600"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </td>

                        <td className="px-3 py-2 text-right font-semibold text-slate-700">
                          {formatCurrency(it.unit_price)}
                        </td>
                        <td className="px-4 py-2 text-right font-black text-rose-600">
                          {formatCurrency(it.line_total)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(it.medicine_id)}
                            className="text-slate-400 hover:text-rose-600 cursor-pointer p-1"
                            title="Delete item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {/* FAST BILLING STYLE INLINE SEARCH ROW (ONLY IN DIRECT RETURN MODE) */}
                  {mode === 'direct' && (
                    <tr className="bg-rose-50/40 border-t-2 border-rose-400">
                      <td colSpan={2} className="p-2 relative overflow-visible">
                        <div className="relative" ref={dropdownRef}>
                          <input
                            ref={inlineSearchRef}
                            type="text"
                            value={searchQuery}
                            placeholder="Type medicine name or batch to return... (Press ↓ / ↑ & Enter)"
                            onChange={(e) => {
                              setSearchQuery(e.target.value);
                              setShowItemDropdown(true);
                            }}
                            onFocus={() => setShowItemDropdown(true)}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                if (itemMatches.length > 0) {
                                  setHighlightedIndex((prev) => (prev + 1) % itemMatches.length);
                                }
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                if (itemMatches.length > 0) {
                                  setHighlightedIndex((prev) => (prev - 1 + itemMatches.length) % itemMatches.length);
                                }
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                if (itemMatches.length > 0 && itemMatches[highlightedIndex]) {
                                  addMedicineToReturn(itemMatches[highlightedIndex]);
                                } else if (!searchQuery.trim()) {
                                  discRef.current?.focus();
                                  discRef.current?.select();
                                }
                              }
                            }}
                            className="w-full bg-white border border-rose-400 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500 shadow-sm"
                          />

                          {showItemDropdown && itemMatches.length > 0 && (
                            <div 
                              className="absolute left-0 top-full mt-1 w-[440px] bg-white border border-slate-300 rounded-lg shadow-2xl max-h-64 overflow-y-auto z-[9999]"
                              style={{ zIndex: 9999 }}
                            >
                              {itemMatches.map((m, idx) => (
                                <div
                                  key={m.id}
                                  onClick={() => addMedicineToReturn(m)}
                                  className={`px-3 py-2 border-b border-slate-100 last:border-0 cursor-pointer flex items-center justify-between ${
                                    highlightedIndex === idx ? 'bg-rose-100/80 text-rose-900 font-semibold' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="text-xs truncate font-bold text-slate-800">{m.name}</div>
                                    <div className="text-[11px] text-slate-500">Batch: {m.batch_no || 'N/A'} · Current Stock: {m.stock_quantity}</div>
                                  </div>
                                  <div className="text-right ml-2 shrink-0">
                                    <div className="text-xs font-bold text-rose-600">
                                      {formatCurrency(Number(m.sale_price))}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td colSpan={4} className="px-3 py-2 text-xs text-slate-500 italic">
                        Press <kbd className="px-1 py-0.5 bg-white border rounded font-mono text-[10px] font-bold">Esc</kbd> to jump straight to Return Summary
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Summary Card (No cash/card method, round-off enter jumps to confirm) */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3 sticky top-4">
            <h3 className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-2 flex items-center justify-between">
              <span>Return Slip Summary</span>
              <span className="text-[10px] text-rose-600 font-bold uppercase">Auto-Draft Safe</span>
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Customer:</span>
                <strong className="text-slate-800">{customerName.trim() || 'Walking Customer'}</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Cashier / User:</span>
                <strong className="text-slate-800">{localStorage.getItem('pos_active_user') || 'TECHI'}</strong>
              </div>

              <div className="border-t border-slate-100 pt-2 flex justify-between">
                <span className="text-slate-500 font-medium">Gross Refund Subtotal:</span>
                <span className="font-bold text-slate-800">{formatCurrency(grossRefundSubtotal)}</span>
              </div>

              {/* Deduction / Disc (%) */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-medium">Return Deduction (%)</span>
                <div className="flex items-center gap-1.5">
                  <input
                    ref={discRef}
                    type="number"
                    min={0}
                    max={100}
                    value={returnDiscount}
                    onChange={(e) => setReturnDiscount(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        roundOffRef.current?.focus();
                        roundOffRef.current?.select();
                      }
                    }}
                    placeholder="0"
                    className="w-16 text-right border border-amber-300 bg-amber-50/40 font-semibold rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-xs font-bold text-slate-500">%</span>
                </div>
              </div>

              {/* Round-off Adjustment: Enter dabane se seedha Submit Button par */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-medium">Round-off / Adjustment</span>
                <input
                  ref={roundOffRef}
                  type="number"
                  value={roundOff}
                  onChange={(e) => setRoundOff(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmBtnRef.current?.focus();
                    }
                  }}
                  placeholder="0"
                  className="w-20 text-right border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                />
              </div>
            </div>

            {/* Total Refund Highlight Box */}
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-center">
              <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">
                TOTAL REFUND CASH TO RETURN
              </span>
              <span className="text-2xl font-black text-rose-700 block mt-1">
                {formatCurrency(netRefundPayable)}
              </span>
              <span className="text-[10px] text-rose-500 mt-1 block font-medium">
                Stock will be added back automatically
              </span>
            </div>

            <button
              ref={confirmBtnRef}
              type="button"
              onClick={handleConfirmRefund}
              disabled={returnItems.length === 0}
              className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow cursor-pointer transition-colors focus:ring-2 focus:ring-rose-500 outline-none"
            >
              <Printer className="h-4 w-4" />
              <span>Confirm Refund & Print Slip</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}