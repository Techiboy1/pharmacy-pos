import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Minus, Printer, AlertCircle, CheckCircle2, X, User, PauseCircle, PlayCircle, Clock } from 'lucide-react';
import { supabase, type Medicine, type CartItem, type Sale, type SaleItem, type StoreSettings, type SaleUnit } from '@/lib/supabase';
import { formatCurrency, formatDate, lineTotal, generateInvoiceNo, daysUntilExpiry, priceForUnit, tabletsForQty, maxQtyForUnit, tabletsPerBox } from '@/lib/utils';
import { printThermalReceipt } from '@/lib/print';

type HeldBill = {
  id: string;
  time: string;
  customerName: string;
  customerPhone: string;
  cart: CartItem[];
  billDiscount: string;
  roundOff: string;
  paymentType: string;
};

function deductFifoBatches(medicineId: string, unitsToDeduct: number) {
  try {
    const raw = localStorage.getItem('pos_batches');
    if (!raw) return;
    let batches = JSON.parse(raw);

    const medBatches = batches
      .filter((b: any) => b.medicine_id === medicineId && Number(b.remaining_qty) > 0)
      .sort((a: any, b: any) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());

    let remToDeduct = unitsToDeduct;
    for (const batch of medBatches) {
      if (remToDeduct <= 0) break;
      const curQty = Number(batch.remaining_qty || 0);
      if (curQty <= remToDeduct) {
        remToDeduct -= curQty;
        batch.remaining_qty = 0;
      } else {
        batch.remaining_qty = curQty - remToDeduct;
        remToDeduct = 0;
      }
    }

    localStorage.setItem('pos_batches', JSON.stringify(batches));
  } catch (e) {
    console.warn('FIFO deduction error:', e);
  }
}

export function PosScreen({ settings }: { settings: StoreSettings | null }) {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Cart & Bill State (Safe initial state)
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const editCart = localStorage.getItem('pos_cart');
      if (editCart) {
        const parsed = JSON.parse(editCart);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      const saved = localStorage.getItem('pos_active_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [customerName, setCustomerName] = useState(() => {
    return localStorage.getItem('pos_customer_name') || localStorage.getItem('pos_active_cname') || '';
  });

  const [customerPhone, setCustomerPhone] = useState(() => {
    return localStorage.getItem('pos_customer_phone') || localStorage.getItem('pos_active_cphone') || '';
  });

  const [billDiscount, setBillDiscount] = useState(() => {
    return localStorage.getItem('pos_discount_percent') || localStorage.getItem('pos_active_bdisc') || '';
  });

  const [roundOff, setRoundOff] = useState(() => localStorage.getItem('pos_active_round') || '');
  const [cashReceived, setCashReceived] = useState('');
  const [paymentType, setPaymentType] = useState('Cash');

  // Held Bills Feature
  const [heldBills, setHeldBills] = useState<HeldBill[]>(() => {
    try {
      const saved = localStorage.getItem('pos_held_bills');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showHeldModal, setShowHeldModal] = useState(false);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [loadingMeds, setLoadingMeds] = useState(true);

  // Refs for Navigation
  const inlineSearchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const custNameRef = useRef<HTMLInputElement>(null);
  const custPhoneRef = useRef<HTMLInputElement>(null);
  const billDiscRef = useRef<HTMLInputElement>(null);
  const roundOffRef = useRef<HTMLInputElement>(null);
  const cashInputRef = useRef<HTMLInputElement>(null);
  const paymentRef = useRef<HTMLSelectElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);

  // AUTO-LOAD EDITED BILL LISTENER (CRASH-PROOF FALLBACK)
  useEffect(() => {
    function loadEditedBillFromHistory() {
      const savedCart = localStorage.getItem('pos_cart');
      if (savedCart) {
        try {
          const parsed = JSON.parse(savedCart);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Har item ko safe fallback dena taake expiry missing hone par crash na ho
            const safeParsed = parsed.map((it: any) => ({
              ...it,
              batch_no: it.batch_no || 'N/A',
              expiry_date: it.expiry_date || new Date().toISOString().split('T')[0],
            }));

            setCart(safeParsed);
            const cName = localStorage.getItem('pos_customer_name') || '';
            const cPhone = localStorage.getItem('pos_customer_phone') || '';
            const cDisc = localStorage.getItem('pos_discount_percent') || '';

            setCustomerName(cName);
            setCustomerPhone(cPhone);
            setBillDiscount(cDisc);

            localStorage.removeItem('pos_cart');
            localStorage.removeItem('pos_customer_name');
            localStorage.removeItem('pos_customer_phone');
            localStorage.removeItem('pos_discount_percent');

            showToast('ok', `Loaded ${safeParsed.length} items from previous invoice for editing!`);
          }
        } catch (e) {
          console.error('Error parsing edited cart:', e);
        }
      }
    }

    loadEditedBillFromHistory();
    window.addEventListener('pos_load_edit_bill', loadEditedBillFromHistory);
    return () => window.removeEventListener('pos_load_edit_bill', loadEditedBillFromHistory);
  }, []);

  // Auto persistent draft
  useEffect(() => {
    localStorage.setItem('pos_active_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('pos_active_cname', customerName);
  }, [customerName]);

  useEffect(() => {
    localStorage.setItem('pos_active_cphone', customerPhone);
  }, [customerPhone]);

  useEffect(() => {
    localStorage.setItem('pos_active_bdisc', billDiscount);
  }, [billDiscount]);

  useEffect(() => {
    localStorage.setItem('pos_active_round', roundOff);
  }, [roundOff]);

  useEffect(() => {
    localStorage.setItem('pos_held_bills', JSON.stringify(heldBills));
  }, [heldBills]);

  useEffect(() => {
    fetchMedicines();
    setTimeout(() => inlineSearchRef.current?.focus(), 150);
  }, []);

  // Escape key listener to jump to Bill Summary
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowDropdown(false);
        custNameRef.current?.focus();
        custNameRef.current?.select();
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function fetchMedicines() {
    setLoadingMeds(true);
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      showToast('err', 'Failed to load medicines');
    } else {
      setMedicines((data as Medicine[]) || []);
    }
    setLoadingMeds(false);
  }

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3200);
  }

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return medicines
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) || (m.batch_no && m.batch_no.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [query, medicines]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [matches]);

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
      categoryLower === 'general' ||
      (spb === 1 && tps === 1 && !nameLower.includes('tab') && !nameLower.includes('cap'))
    ) {
      return 'general';
    }

    return 'tablet';
  }

  function addToCartDirect(m: Medicine) {
    if (m.stock_quantity <= 0) {
      showToast('err', `${m.name} is out of stock`);
      return;
    }

    const itType = getItemType(m);
    const defaultUnit: SaleUnit = itType === 'general' ? 'Box' : 'Tablet';
    const max = maxQtyForUnit(m.stock_quantity, defaultUnit, m);

    if (max <= 0) {
      showToast('err', `Not enough stock for ${m.name}`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((c) => c.medicine_id === m.id);
      if (existing) {
        const itemMax = maxQtyForUnit(existing.available_stock, existing.unit, existing);
        if (existing.qty >= itemMax) {
          showToast('err', `Maximum available stock reached`);
          return prev;
        }
        return prev.map((c) =>
          c.medicine_id === m.id ? { ...c, qty: c.qty + 1 } : c
        );
      }
      return [
        ...prev,
        {
          medicine_id: m.id,
          name: m.name,
          batch_no: m.batch_no || 'N/A',
          expiry_date: m.expiry_date || new Date().toISOString().split('T')[0],
          unit_price: priceForUnit(m, defaultUnit),
          qty: 1,
          discount_percent: 0,
          available_stock: m.stock_quantity,
          unit: defaultUnit,
          tablets_per_box: tabletsPerBox(m),
          tablets_per_strip: Math.max(1, m.tablets_per_strip || 1),
          category: (m as any).category,
        } as any,
      ];
    });

    setQuery('');
    setShowDropdown(false);

    setTimeout(() => {
      const unitSelect = document.getElementById(`unit-select-${m.id}`) as HTMLSelectElement;
      if (unitSelect) {
        unitSelect.focus();
      } else {
        const qtyInput = document.getElementById(`qty-input-${m.id}`) as HTMLInputElement;
        if (qtyInput) {
          qtyInput.focus();
          qtyInput.select();
        }
      }
    }, 60);
  }

  function changeUnit(medicineId: string, newUnit: SaleUnit) {
    const originalMed = medicines.find((m) => m.id === medicineId);
    if (!originalMed) return;

    const newPrice = priceForUnit(originalMed, newUnit);
    const maxPossible = maxQtyForUnit(originalMed.stock_quantity, newUnit, originalMed);

    setCart((prev) =>
      prev.map((c) => {
        if (c.medicine_id !== medicineId) return c;
        const validQty = Math.max(1, Math.min(c.qty, maxPossible || 1));
        return {
          ...c,
          unit: newUnit,
          unit_price: newPrice,
          qty: validQty,
        };
      })
    );
  }

  function updateQty(id: string, qty: number) {
    setCart((prev) =>
      prev.map((c) => {
        if (c.medicine_id !== id) return c;
        if (qty === 0) {
          return { ...c, qty: 0 };
        }
        const max = maxQtyForUnit(c.available_stock, c.unit, c);
        const clamped = Math.max(1, Math.min(qty, max));
        return { ...c, qty: clamped };
      })
    );
  }

  function updateDiscount(id: string, disc: number) {
    setCart((prev) =>
      prev.map((c) =>
        c.medicine_id === id
          ? { ...c, discount_percent: Math.max(0, Math.min(100, disc)) }
          : c
      )
    );
  }

  function removeItem(id: string) {
    setCart((prev) => prev.filter((c) => c.medicine_id !== id));
    inlineSearchRef.current?.focus();
  }

  function clearCart() {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setBillDiscount('');
    setRoundOff('');
    setCashReceived('');
    localStorage.removeItem('pos_active_cart');
    localStorage.removeItem('pos_active_cname');
    localStorage.removeItem('pos_active_cphone');
    localStorage.removeItem('pos_active_bdisc');
    localStorage.removeItem('pos_active_round');
    inlineSearchRef.current?.focus();
  }

  function holdCurrentBill() {
    if (cart.length === 0) {
      showToast('err', 'Cannot hold an empty cart');
      return;
    }

    const newHold: HeldBill = {
      id: Date.now().toString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      customerName: customerName.trim() || 'Walking Customer',
      customerPhone: customerPhone.trim(),
      cart: [...cart],
      billDiscount,
      roundOff,
      paymentType,
    };

    setHeldBills((prev) => [newHold, ...prev]);
    clearCart();
    showToast('ok', `Bill for "${newHold.customerName}" held safely!`);
  }

  function resumeHeldBill(bill: HeldBill) {
    if (cart.length > 0) {
      if (!confirm('Active cart has items. Resume will overwrite current cart. Continue?')) {
        return;
      }
    }

    setCart(bill.cart);
    setCustomerName(bill.customerName === 'Walking Customer' ? '' : bill.customerName);
    setCustomerPhone(bill.customerPhone);
    setBillDiscount(bill.billDiscount);
    setRoundOff(bill.roundOff);
    setPaymentType(bill.paymentType || 'Cash');

    setHeldBills((prev) => prev.filter((b) => b.id !== bill.id));
    setShowHeldModal(false);
    showToast('ok', `Resumed bill for ${bill.customerName}`);
    inlineSearchRef.current?.focus();
  }

  function deleteHeldBill(id: string) {
    setHeldBills((prev) => prev.filter((b) => b.id !== id));
    showToast('ok', 'Held bill removed');
  }

  const grossSubtotal = useMemo(
    () => cart.reduce((s, c) => s + (c.unit_price * c.qty), 0),
    [cart]
  );

  const itemLevelSubtotal = useMemo(
    () => cart.reduce((s, c) => s + lineTotal(c.unit_price, c.qty, c.discount_percent), 0),
    [cart]
  );

  const overallDiscPercent = Number(billDiscount) || 0;
  const overallDiscAmt = (itemLevelSubtotal * overallDiscPercent) / 100;
  const totalDiscount = (grossSubtotal - itemLevelSubtotal) + overallDiscAmt;

  const roundValue = Number(roundOff) || 0;
  const grandTotal = Math.max(0, itemLevelSubtotal - overallDiscAmt + roundValue);
  const cash = Number(cashReceived) || 0;
  const change = cash - grandTotal;

  async function completeSale() {
    if (cart.length === 0) {
      showToast('err', 'Cart is empty');
      return;
    }
    if (cash < grandTotal) {
      showToast('err', 'Cash received is less than the net payable');
      return;
    }
    setBusy(true);
    const invoiceNo = generateInvoiceNo();
    const currentCashier = localStorage.getItem('pos_active_user') || 'TECHI';

    const saleRow = {
      invoice_no: invoiceNo,
      total_amount: grossSubtotal,
      discount: totalDiscount,
      round_off: roundValue,
      net_payable: grandTotal,
      cash_received: cash,
      change_return: change,
      payment_type: paymentType,
      customer_name: customerName.trim() || 'Walking Customer',
      customer_phone: customerPhone.trim() || '',
      cashier_name: currentCashier,
    };

    const { data: saleData, error: saleErr } = await supabase
      .from('sales')
      .insert(saleRow)
      .select()
      .single();

    if (saleErr || !saleData) {
      showToast('err', 'Failed to record sale');
      setBusy(false);
      return;
    }

    const saleId = (saleData as Sale).id;
    const itemRows = cart.map((c) => {
      const itType = getItemType(c);
      let printableUnit = c.unit;
      if (itType === 'injection') {
        printableUnit = (c.unit === 'Box' ? 'Box' : 'Tablet') as SaleUnit;
      } else if (itType === 'general') {
        printableUnit = 'Box' as SaleUnit;
      }

      return {
        sale_id: saleId,
        medicine_id: c.medicine_id,
        name: c.name,
        batch_no: c.batch_no || 'N/A',
        expiry_date: c.expiry_date || new Date().toISOString().split('T')[0],
        unit_price: c.unit_price,
        qty: Math.max(1, c.qty),
        discount_percent: c.discount_percent,
        line_total: lineTotal(c.unit_price, Math.max(1, c.qty), c.discount_percent),
        unit: printableUnit,
      };
    });

    const { error: itemsErr } = await supabase.from('sale_items').insert(itemRows);
    if (itemsErr) {
      showToast('err', 'Sale recorded but items failed — check inventory');
      setBusy(false);
      return;
    }

    await Promise.all(
      cart.map((c) => {
        const deduct = tabletsForQty(Math.max(1, c.qty), c.unit, c);
        deductFifoBatches(c.medicine_id, deduct);
        return supabase
          .from('medicines')
          .update({
            stock_quantity: Math.max(0, c.available_stock - deduct),
            updated_at: new Date().toISOString(),
          })
          .eq('id', c.medicine_id);
      })
    );

    const [saleRes, itemsRes] = await Promise.all([
      supabase.from('sales').select('*').eq('id', saleId).maybeSingle(),
      supabase.from('sale_items').select('*').eq('sale_id', saleId),
    ]);

    const saleWithCustomer = {
      ...(saleRes.data as Sale),
      total_amount: grossSubtotal,
      discount: totalDiscount,
      customer_name: customerName.trim() || 'Walking Customer',
      customer_phone: customerPhone.trim() || '',
      cashier_name: currentCashier,
    };

    printThermalReceipt({
      settings,
      sale: saleWithCustomer,
      items: (itemsRes.data as SaleItem[]) || [],
    });

    showToast('ok', `Sale ${invoiceNo} completed by ${currentCashier}`);
    clearCart();
    setBusy(false);
    fetchMedicines();
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (matches.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % matches.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (matches.length > 0) {
        setHighlightedIndex((prev) => (prev - 1 + matches.length) % matches.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches.length > 0 && matches[highlightedIndex]) {
        addToCartDirect(matches[highlightedIndex]);
      } else if (!query.trim()) {
        custNameRef.current?.focus();
        custNameRef.current?.select();
      }
    }
  }

  return (
    <div className="flex flex-col h-full select-none">
      <div className="px-4 sm:px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-800 leading-tight">Fast Billing</h1>
          <p className="text-xs text-slate-500">Press Enter to cycle fields · Esc to jump to Bill Summary</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={holdCurrentBill}
            disabled={cart.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold disabled:opacity-50 cursor-pointer transition-colors shadow-sm"
          >
            <PauseCircle className="h-4 w-4 text-amber-600" />
            Hold Bill
          </button>

          <button
            type="button"
            onClick={() => setShowHeldModal(true)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer transition-colors shadow-sm"
          >
            <Clock className="h-4 w-4 text-slate-500" />
            Held Bills
            {heldBills.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-emerald-600 text-white text-[10px] font-bold rounded-full">
                {heldBills.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50">
        {toast && (
          <div
            className={`mb-3 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
              toast.kind === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {toast.kind === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {toast.msg}
            <button className="ml-auto" onClick={() => setToast(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-visible">
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-sm text-slate-800">Cart Items</h2>
                  <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                    {cart.length}
                  </span>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-xs text-red-600 hover:underline cursor-pointer font-medium"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="overflow-visible">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100/75 text-slate-600 text-xs font-semibold uppercase border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3 py-2.5">Item Name</th>
                      <th className="text-left px-3 py-2.5">Batch / Expiry</th>
                      <th className="text-center px-3 py-2.5">Unit</th>
                      <th className="text-center px-3 py-2.5">Avail</th>
                      <th className="text-right px-3 py-2.5">Price</th>
                      <th className="text-center px-3 py-2.5">Qty</th>
                      <th className="text-center px-3 py-2.5">Disc %</th>
                      <th className="text-right px-3 py-2.5">Total</th>
                      <th className="px-2 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cart.map((c) => {
                      const max = maxQtyForUnit(c.available_stock, c.unit, c);
                      const itType = getItemType(c);

                      return (
                        <tr key={c.medicine_id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3 py-2 font-semibold text-slate-800">{c.name}</td>
                          <td className="px-3 py-2 text-slate-500 text-xs">
                            <span className="font-medium text-slate-700">{c.batch_no || 'N/A'}</span>
                            <br />
                            {/* CRASH-PROOF EXPIRY RENDER */}
                            <span>
                              Exp {c.expiry_date ? formatDate(c.expiry_date) : 'N/A'}
                            </span>
                          </td>

                          <td className="px-3 py-2 text-center">
                            {itType === 'injection' ? (
                              <select
                                id={`unit-select-${c.medicine_id}`}
                                value={c.unit === 'Box' ? 'Box' : 'Tablet'}
                                onChange={(e) => changeUnit(c.medicine_id, e.target.value as SaleUnit)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const qtyInput = document.getElementById(`qty-input-${c.medicine_id}`) as HTMLInputElement;
                                    qtyInput?.focus();
                                    qtyInput?.select();
                                  }
                                }}
                                className="text-xs border border-blue-400 rounded px-2 py-1 bg-blue-50 text-blue-900 font-bold outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                              >
                                <option value="Tablet">Inj / Amp</option>
                                <option value="Box">Box</option>
                              </select>
                            ) : itType === 'general' ? (
                              <span className="inline-block text-xs font-semibold px-2 py-1 rounded bg-slate-100 text-slate-700">
                                Pcs / Bot
                              </span>
                            ) : (
                              <select
                                id={`unit-select-${c.medicine_id}`}
                                value={c.unit}
                                onChange={(e) => changeUnit(c.medicine_id, e.target.value as SaleUnit)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const qtyInput = document.getElementById(`qty-input-${c.medicine_id}`) as HTMLInputElement;
                                    qtyInput?.focus();
                                    qtyInput?.select();
                                  }
                                }}
                                className="text-xs border border-emerald-300 rounded px-1.5 py-1 bg-emerald-50 text-emerald-800 font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
                              >
                                <option value="Tablet">Tablet</option>
                                <option value="Strip">Strip</option>
                                <option value="Box">Box</option>
                              </select>
                            )}
                          </td>

                          <td className="px-3 py-2 text-center text-xs font-semibold text-slate-600">{max}</td>
                          <td className="px-3 py-2 text-right text-slate-700 text-xs font-medium">
                            {formatCurrency(c.unit_price)}
                          </td>

                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateQty(c.medicine_id, (c.qty || 1) - 1)}
                                className="grid place-items-center h-6 w-6 rounded border border-slate-300 hover:bg-slate-100"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <input
                                id={`qty-input-${c.medicine_id}`}
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={c.qty === 0 ? '' : c.qty}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const discInput = document.getElementById(`disc-input-${c.medicine_id}`) as HTMLInputElement;
                                    discInput?.focus();
                                    discInput?.select();
                                  }
                                }}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '') {
                                    updateQty(c.medicine_id, 0);
                                  } else {
                                    const num = parseInt(val.replace(/\D/g, ''), 10);
                                    if (!isNaN(num)) {
                                      updateQty(c.medicine_id, num);
                                    }
                                  }
                                }}
                                onBlur={() => {
                                  if (!c.qty || c.qty < 1) {
                                    updateQty(c.medicine_id, 1);
                                  }
                                }}
                                className="w-12 text-center border border-slate-300 rounded py-0.5 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                              <button
                                type="button"
                                onClick={() => updateQty(c.medicine_id, (c.qty || 0) + 1)}
                                className="grid place-items-center h-6 w-6 rounded border border-slate-300 hover:bg-slate-100"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </td>

                          <td className="px-3 py-2 text-center">
                            <input
                              id={`disc-input-${c.medicine_id}`}
                              type="number"
                              min={0}
                              max={100}
                              value={c.discount_percent}
                              onFocus={(e) => e.target.select()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  inlineSearchRef.current?.focus();
                                  inlineSearchRef.current?.select();
                                }
                              }}
                              onChange={(e) =>
                                updateDiscount(c.medicine_id, Number(e.target.value))
                              }
                              className="w-12 text-center border border-slate-300 rounded py-0.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                            />
                          </td>

                          <td className="px-3 py-2 text-right font-bold text-slate-800 text-xs">
                            {formatCurrency(lineTotal(c.unit_price, Math.max(1, c.qty), c.discount_percent))}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => removeItem(c.medicine_id)}
                              className="text-slate-400 hover:text-red-600 cursor-pointer p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    <tr className="bg-emerald-50/40 border-t-2 border-emerald-400">
                      <td colSpan={2} className="p-2 relative overflow-visible">
                        <div className="relative" ref={dropdownRef}>
                          <input
                            ref={inlineSearchRef}
                            type="text"
                            value={query}
                            placeholder="Type medicine name or batch... (Press ↓ / ↑ & Enter)"
                            onChange={(e) => {
                              setQuery(e.target.value);
                              setShowDropdown(true);
                            }}
                            onFocus={() => setShowDropdown(true)}
                            onKeyDown={handleSearchKeyDown}
                            className="w-full bg-white border border-emerald-400 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                          />

                          {showDropdown && matches.length > 0 && (
                            <div 
                              className="absolute left-0 top-full mt-1 w-[460px] bg-white border border-slate-300 rounded-lg shadow-2xl max-h-72 overflow-y-auto z-[9999]"
                              style={{ zIndex: 9999 }}
                            >
                              {matches.map((m, idx) => {
                                const d = daysUntilExpiry(m.expiry_date);
                                const isHighlighted = idx === highlightedIndex;
                                return (
                                  <div
                                    key={m.id}
                                    onClick={() => addToCartDirect(m)}
                                    className={`px-3.5 py-2.5 border-b border-slate-100 last:border-0 cursor-pointer transition-colors flex items-center justify-between ${
                                      isHighlighted ? 'bg-emerald-100/80 text-emerald-900 font-semibold' : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="text-xs truncate">{m.name}</div>
                                      <div className="text-[11px] text-slate-500 font-normal">
                                        Batch: {m.batch_no || 'N/A'} · Exp: {m.expiry_date ? formatDate(m.expiry_date) : 'N/A'}
                                        {d < 0 && <span className="text-red-600 font-bold"> (Expired)</span>}
                                      </div>
                                    </div>
                                    <div className="text-right ml-3 shrink-0">
                                      <div className="text-xs font-bold text-emerald-700">
                                        {formatCurrency(Number(m.sale_price))}
                                      </div>
                                      <div className="text-[10px] text-slate-500 font-normal">
                                        Stock: {m.stock_quantity}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                      <td colSpan={7} className="px-3 py-2 text-xs text-slate-500 italic">
                        Press <kbd className="px-1 py-0.5 bg-white border rounded font-mono text-[10px] font-bold">Esc</kbd> to jump straight to Customer Summary
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-slate-200 p-4 sticky top-4 shadow-sm">
              <h2 className="font-bold text-slate-800 mb-3 text-sm flex items-center justify-between">
                <span>Bill Summary</span>
                <span className="text-[11px] font-normal text-slate-400">Esc to focus here</span>
              </h2>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-3 space-y-2">
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-slate-500" />
                  Customer Details (Optional)
                </span>
                <input
                  ref={custNameRef}
                  type="text"
                  placeholder="Customer Name (e.g. Walking / Ali)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      custPhoneRef.current?.focus();
                      custPhoneRef.current?.select();
                    }
                  }}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <input
                  ref={custPhoneRef}
                  type="text"
                  placeholder="Phone No (Optional)"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      billDiscRef.current?.focus();
                      billDiscRef.current?.select();
                    }
                  }}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Gross Subtotal (Actual)</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(grossSubtotal)}</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 font-medium">Bill Discount (%)</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={billDiscRef}
                      type="number"
                      min={0}
                      max={100}
                      value={billDiscount}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          roundOffRef.current?.focus();
                          roundOffRef.current?.select();
                        }
                      }}
                      onChange={(e) => setBillDiscount(e.target.value)}
                      placeholder="0"
                      className="w-20 text-right border border-amber-300 bg-amber-50/40 font-semibold rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                </div>

                {totalDiscount > 0 && (
                  <div className="flex justify-between text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                    <span>Total Discount Saved:</span>
                    <span className="font-bold">-{formatCurrency(totalDiscount)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 font-medium">Round-off / Adjustment</span>
                  <input
                    ref={roundOffRef}
                    type="number"
                    value={roundOff}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        cashInputRef.current?.focus();
                        cashInputRef.current?.select();
                      }
                    }}
                    onChange={(e) => setRoundOff(e.target.value)}
                    placeholder="0"
                    className="w-20 text-right border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>

                <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                  <span className="font-bold text-slate-800">Grand Net Payable</span>
                  <span className="text-lg font-black text-emerald-700">
                    {formatCurrency(grandTotal)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 font-medium">Cash Received</span>
                  <input
                    ref={cashInputRef}
                    type="number"
                    value={cashReceived}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        paymentRef.current?.focus();
                      }
                    }}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder="0"
                    className="w-24 text-right border border-emerald-300 bg-emerald-50/20 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                  />
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Change Return</span>
                  <span
                    className={`font-bold ${
                      change >= 0 ? 'text-slate-800' : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(change)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-slate-500 font-medium">Payment Method</span>
                  <select
                    ref={paymentRef}
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitBtnRef.current?.focus();
                      }
                    }}
                    className="border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  >
                    <option>Cash</option>
                    <option>Card</option>
                    <option>Mobile</option>
                  </select>
                </div>
              </div>

              <button
                ref={submitBtnRef}
                onClick={completeSale}
                disabled={busy || cart.length === 0}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-2.5 rounded-lg transition-colors cursor-pointer text-xs focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500"
              >
                <Printer className="h-4 w-4" />
                {busy ? 'Processing…' : 'Complete Sale & Print Thermal Bill'}
              </button>

              {cash > 0 && change < 0 && (
                <p className="mt-2 text-[11px] text-red-600 text-center font-medium">
                  Cash received is less than the net payable.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {showHeldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-emerald-600" />
                <h2 className="font-semibold text-slate-800 text-sm">Held / Saved Bills ({heldBills.length})</h2>
              </div>
              <button onClick={() => setShowHeldModal(false)}>
                <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {heldBills.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  Koi bill hold nahi hai. Fast Billing me "Hold Bill" dabayein to yahan save hoga.
                </div>
              ) : (
                heldBills.map((b) => {
                  const itemsCount = b.cart.reduce((acc, it) => acc + it.qty, 0);
                  const approxTotal = b.cart.reduce(
                    (acc, it) => acc + lineTotal(it.unit_price, it.qty, it.discount_percent),
                    0
                  );

                  return (
                    <div
                      key={b.id}
                      className="border border-slate-200 rounded-lg p-3 hover:border-emerald-400 transition-colors bg-white shadow-sm flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-semibold text-slate-800 text-xs">{b.customerName}</div>
                        <div className="text-[11px] text-slate-500">
                          {b.time} · {b.cart.length} medicines ({itemsCount} units)
                        </div>
                        <div className="text-xs font-bold text-emerald-700 mt-1">
                          Approx: {formatCurrency(approxTotal)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => resumeHeldBill(b)}
                          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          <PlayCircle className="h-3.5 w-3.5" />
                          Resume
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteHeldBill(b.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Discard held bill"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}