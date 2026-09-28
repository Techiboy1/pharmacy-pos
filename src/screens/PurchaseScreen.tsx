import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Truck, Plus, Search, Building2, Phone, Calendar, 
  Trash2, CheckCircle2, ChevronRight, ArrowLeft, 
  PackageCheck, X, Eye, Edit2, Printer
} from 'lucide-react';
import { supabase, type Medicine, type StoreSettings, type SaleUnit } from '@/lib/supabase';
import { formatCurrency, priceForUnit, tabletsForQty, tabletsPerBox } from '@/lib/utils';
import { printPurchaseReceipt } from '@/lib/print';

export interface Vendor {
  id: string;
  company_name: string;
  booker_name?: string;
  booker_phone?: string;
  supplier_phone?: string;
  manager_phone?: string;
  supervisor_phone?: string;
  created_at: string;
}

export interface PurchaseItem {
  medicine_id: string;
  name: string;
  batch_no: string;
  expiry_date: string;
  unit: SaleUnit;
  qty: number | string;
  bonus_qty: number | string;
  mrp: number | string;
  disc_percent: number | string;
  disc_amt: number | string;
  gst_percent: number | string;
  gst_amt: number | string;
  further_tax_percent: number | string;
  further_tax_amt: number | string;
  adv_tax_percent: number | string;
  adv_tax_amt: number | string;
  charge_percent: number | string;
  charge_amt: number | string;
  tablets_per_box: number;
  tablets_per_strip: number;
  category?: string;
}

export interface PurchaseInvoiceRecord {
  id: string;
  invoice_no: string;
  vendor_id: string;
  vendor_name: string;
  purchase_date: string;
  items: PurchaseItem[];
  items_subtotal: number;
  total_discount: number;
  gst_percent?: number | string;
  gst_amt?: number;
  adv_tax_percent?: number | string;
  adv_tax_amt?: number;
  further_tax_percent?: number | string;
  further_tax_amt?: number;
  net_payable: number;
  overall_discount_percent?: number | string;
  overall_discount_amt?: number | string;
  created_at: string;
}

export function PurchaseScreen({ settings }: { settings?: StoreSettings | null }) {
  // Load saved draft if user navigated away or closed software
  const savedPurchaseDraft = useMemo(() => {
    try {
      const raw = localStorage.getItem('pos_purchase_draft');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const [vendors, setVendors] = useState<Vendor[]>(() => {
    const saved = localStorage.getItem('pos_vendors');
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(() => {
    if (savedPurchaseDraft?.selectedVendor) return savedPurchaseDraft.selectedVendor;
    return null;
  });

  const [view, setView] = useState<'directory' | 'vendor_ledger' | 'entry'>(() => {
    if (savedPurchaseDraft && savedPurchaseDraft.cartItems?.length > 0) return 'entry';
    return 'directory';
  });

  const [invoices, setInvoices] = useState<PurchaseInvoiceRecord[]>(() => {
    const saved = localStorage.getItem('pos_purchases');
    return saved ? JSON.parse(saved) : [];
  });

  // Modal: Add Vendor State with Draft Recovery
  const [showAddVendorModal, setShowAddVendorModal] = useState(false);
  const [newVendorName, setNewVendorName] = useState(() => localStorage.getItem('pos_vendor_draft_name') || '');
  const [newBookerName, setNewBookerName] = useState(() => localStorage.getItem('pos_vendor_draft_booker') || '');
  const [newBookerPhone, setNewBookerPhone] = useState(() => localStorage.getItem('pos_vendor_draft_bphone') || '');
  const [newSupplierPhone, setNewSupplierPhone] = useState(() => localStorage.getItem('pos_vendor_draft_sphone') || '');
  const [newManagerPhone, setNewManagerPhone] = useState(() => localStorage.getItem('pos_vendor_draft_mphone') || '');
  const [newSupervisorPhone, setNewSupervisorPhone] = useState(() => localStorage.getItem('pos_vendor_draft_supphone') || '');

  // Auto-sync vendor modal fields to localStorage
  useEffect(() => {
    localStorage.setItem('pos_vendor_draft_name', newVendorName);
    localStorage.setItem('pos_vendor_draft_booker', newBookerName);
    localStorage.setItem('pos_vendor_draft_bphone', newBookerPhone);
    localStorage.setItem('pos_vendor_draft_sphone', newSupplierPhone);
    localStorage.setItem('pos_vendor_draft_mphone', newManagerPhone);
    localStorage.setItem('pos_vendor_draft_supphone', newSupervisorPhone);
  }, [newVendorName, newBookerName, newBookerPhone, newSupplierPhone, newManagerPhone, newSupervisorPhone]);

  function clearVendorModalDraft() {
    setNewVendorName('');
    setNewBookerName('');
    setNewBookerPhone('');
    setNewSupplierPhone('');
    setNewManagerPhone('');
    setNewSupervisorPhone('');
    localStorage.removeItem('pos_vendor_draft_name');
    localStorage.removeItem('pos_vendor_draft_booker');
    localStorage.removeItem('pos_vendor_draft_bphone');
    localStorage.removeItem('pos_vendor_draft_sphone');
    localStorage.removeItem('pos_vendor_draft_mphone');
    localStorage.removeItem('pos_vendor_draft_supphone');
  }

  // Date Filter & Search for Vendor History
  const [historySearch, setHistorySearch] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState<'all' | 'today' | 'yesterday' | 'month' | 'custom'>('all');
  const [customHistoryDate, setCustomHistoryDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // View Bill Modal
  const [viewingInvoice, setViewingInvoice] = useState<PurchaseInvoiceRecord | null>(null);

  // Editing state
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(() => savedPurchaseDraft?.editingInvoiceId || null);

  // Add Vendor Keyboard Refs
  const vendorNameRef = useRef<HTMLInputElement>(null);
  const supplierPhoneRef = useRef<HTMLInputElement>(null);
  const bookerNameRef = useRef<HTMLInputElement>(null);
  const bookerPhoneRef = useRef<HTMLInputElement>(null);
  const supervisorPhoneRef = useRef<HTMLInputElement>(null);
  const managerPhoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddVendorModal) {
      setTimeout(() => {
        vendorNameRef.current?.focus();
        vendorNameRef.current?.select();
      }, 50);
    }
  }, [showAddVendorModal]);

  // Medicines List for Search
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [itemQuery, setItemQuery] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [highlightedItemIndex, setHighlightedItemIndex] = useState(0);

  // Supply Entry Cart Form (State restored from draft if exists)
  const [invoiceNo, setInvoiceNo] = useState(() => savedPurchaseDraft?.invoiceNo || '');
  const [purchaseDate, setPurchaseDate] = useState(() => {
    if (savedPurchaseDraft?.purchaseDate) return savedPurchaseDraft.purchaseDate;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [cartItems, setCartItems] = useState<PurchaseItem[]>(() => savedPurchaseDraft?.cartItems || []);
  
  // Overall Summary Controls
  const [overallDiscountPercent, setOverallDiscountPercent] = useState(() => savedPurchaseDraft?.overallDiscountPercent || '0');
  const [overallDiscountAmt, setOverallDiscountAmt] = useState(() => savedPurchaseDraft?.overallDiscountAmt || '0');
  const [overallGstPercent, setOverallGstPercent] = useState(() => savedPurchaseDraft?.overallGstPercent || '0');
  const [overallGstAmt, setOverallGstAmt] = useState(() => savedPurchaseDraft?.overallGstAmt || '0');
  const [overallAdvTaxPercent, setOverallAdvTaxPercent] = useState(() => savedPurchaseDraft?.overallAdvTaxPercent || '0');
  const [overallAdvTaxAmt, setOverallAdvTaxAmt] = useState(() => savedPurchaseDraft?.overallAdvTaxAmt || '0');
  const [overallFurtherTaxPercent, setOverallFurtherTaxPercent] = useState(() => savedPurchaseDraft?.overallFurtherTaxPercent || '0');
  const [overallFurtherTaxAmt, setOverallFurtherTaxAmt] = useState(() => savedPurchaseDraft?.overallFurtherTaxAmt || '0');

  // Input Focus Refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const vSearchInputRef = useRef<HTMLInputElement>(null);
  const invoiceNoInputRef = useRef<HTMLInputElement>(null);
  const [vendorSearch, setVendorSearch] = useState('');

  // Summary Inputs Refs for ESC jump
  const sumDiscPercentRef = useRef<HTMLInputElement>(null);
  const sumGstPercentRef = useRef<HTMLInputElement>(null);
  const sumAdvPercentRef = useRef<HTMLInputElement>(null);
  const sumFurtherPercentRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // -------------------------------------------------------------
  // REAL-TIME AUTO-PERSIST DRAFT: Saves current invoice in progress
  // -------------------------------------------------------------
  useEffect(() => {
    if (cartItems.length > 0 || invoiceNo.trim() || selectedVendor) {
      const draft = {
        selectedVendor,
        editingInvoiceId,
        invoiceNo,
        purchaseDate,
        cartItems,
        overallDiscountPercent,
        overallDiscountAmt,
        overallGstPercent,
        overallGstAmt,
        overallAdvTaxPercent,
        overallAdvTaxAmt,
        overallFurtherTaxPercent,
        overallFurtherTaxAmt,
      };
      localStorage.setItem('pos_purchase_draft', JSON.stringify(draft));
    } else {
      localStorage.removeItem('pos_purchase_draft');
    }
  }, [
    selectedVendor,
    editingInvoiceId,
    invoiceNo,
    purchaseDate,
    cartItems,
    overallDiscountPercent,
    overallDiscountAmt,
    overallGstPercent,
    overallGstAmt,
    overallAdvTaxPercent,
    overallAdvTaxAmt,
    overallFurtherTaxPercent,
    overallFurtherTaxAmt,
  ]);

  function clearPurchaseDraft() {
    setCartItems([]);
    setInvoiceNo('');
    setEditingInvoiceId(null);
    setOverallDiscountPercent('0');
    setOverallDiscountAmt('0');
    setOverallGstPercent('0');
    setOverallGstAmt('0');
    setOverallAdvTaxPercent('0');
    setOverallAdvTaxAmt('0');
    setOverallFurtherTaxPercent('0');
    setOverallFurtherTaxAmt('0');
    localStorage.removeItem('pos_purchase_draft');
  }

  useEffect(() => {
    fetchMedicines();
  }, []);

  // Global ESC key to focus summary
  useEffect(() => {
    function handleEscKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && view === 'entry') {
        e.preventDefault();
        setShowItemDropdown(false);
        sumDiscPercentRef.current?.focus();
        sumDiscPercentRef.current?.select();
      }
    }
    window.addEventListener('keydown', handleEscKey);
    return () => window.removeEventListener('keydown', handleEscKey);
  }, [view]);

  async function fetchMedicines() {
    const { data } = await supabase.from('medicines').select('*').order('name');
    setMedicines(data || []);
  }

  function saveVendorsToStorage(list: Vendor[]) {
    setVendors(list);
    localStorage.setItem('pos_vendors', JSON.stringify(list));
  }

  function saveInvoicesToStorage(list: PurchaseInvoiceRecord[]) {
    setInvoices(list);
    localStorage.setItem('pos_purchases', JSON.stringify(list));
  }

  function handleCreateVendor() {
    if (!newVendorName.trim()) {
      alert('Vendor Name likhna zaroori hai.');
      vendorNameRef.current?.focus();
      return;
    }

    const newV: Vendor = {
      id: `v_${Date.now()}`,
      company_name: newVendorName.trim(),
      booker_name: newBookerName.trim() || undefined,
      booker_phone: newBookerPhone.trim() || undefined,
      supplier_phone: newSupplierPhone.trim() || undefined,
      manager_phone: newManagerPhone.trim() || undefined,
      supervisor_phone: newSupervisorPhone.trim() || undefined,
      created_at: new Date().toISOString(),
    };

    const updated = [newV, ...vendors];
    saveVendorsToStorage(updated);
    clearVendorModalDraft();
    setShowAddVendorModal(false);
  }

  const filteredVendors = useMemo(() => {
    if (!vendorSearch.trim()) return vendors;
    const q = vendorSearch.trim().toLowerCase();
    return vendors.filter(
      (v) =>
        v.company_name.toLowerCase().includes(q) ||
        (v.booker_name && v.booker_name.toLowerCase().includes(q)) ||
        (v.booker_phone && v.booker_phone.includes(q)) ||
        (v.supplier_phone && v.supplier_phone.includes(q))
    );
  }, [vendors, vendorSearch]);

  function getLocalDateString(dInput?: string) {
    if (!dInput) return '';
    const d = new Date(dInput);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const filteredVendorInvoices = useMemo(() => {
    if (!selectedVendor) return [];
    let list = invoices.filter((i) => i.vendor_id === selectedVendor.id);

    const now = new Date();
    const todayStr = getLocalDateString(now.toISOString());
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yestStr = getLocalDateString(yest.toISOString());
    const currentYearMonth = todayStr.slice(0, 7);

    if (dateFilterMode === 'today') {
      list = list.filter((i) => (i.purchase_date || getLocalDateString(i.created_at)) === todayStr);
    } else if (dateFilterMode === 'yesterday') {
      list = list.filter((i) => (i.purchase_date || getLocalDateString(i.created_at)) === yestStr);
    } else if (dateFilterMode === 'month') {
      list = list.filter((i) => (i.purchase_date || getLocalDateString(i.created_at)).slice(0, 7) === currentYearMonth);
    } else if (dateFilterMode === 'custom') {
      list = list.filter((i) => (i.purchase_date || getLocalDateString(i.created_at)) === customHistoryDate);
    }

    if (historySearch.trim()) {
      const q = historySearch.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.invoice_no.toLowerCase().includes(q) ||
          i.items.some((it) => it.name.toLowerCase().includes(q))
      );
    }

    return list;
  }, [invoices, selectedVendor, dateFilterMode, customHistoryDate, historySearch]);

  const itemMatches = useMemo(() => {
    if (!itemQuery.trim()) return [];
    const q = itemQuery.trim().toLowerCase();
    return medicines.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [medicines, itemQuery]);

  function getItemType(m: any): 'tablet' | 'injection' | 'general' {
    const spb = Number(m.strips_per_box) || 1;
    const tps = Number(m.tablets_per_strip) || 1;
    const nameLower = (m.name || '').toLowerCase();
    const categoryLower = (m.category || '').toLowerCase();

    if (categoryLower === 'injection' || nameLower.includes('inj') || nameLower.includes('amp') || nameLower.includes('vial')) {
      return 'injection';
    }
    if (categoryLower === 'syrup' || categoryLower === 'cream' || categoryLower === 'general' || (spb === 1 && tps === 1 && !nameLower.includes('tab') && !nameLower.includes('cap'))) {
      return 'general';
    }
    return 'tablet';
  }

  function getDefaultExpiryDate() {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function addItemToCart(med: Medicine) {
    const existing = cartItems.find((c) => c.medicine_id === med.id);
    const medId = med.id;

    if (existing) {
      updateCartItem(medId, 'qty', Number(existing.qty) + 1);
    } else {
      const defaultUnit: SaleUnit = 'Box';
      const defaultMrp = priceForUnit(med, defaultUnit);
      const initialDiscAmt = ((defaultMrp * 15) / 100).toFixed(2);
      
      setCartItems((prev) => [
        ...prev,
        {
          medicine_id: med.id,
          name: med.name,
          batch_no: (med as any).batch_no || 'B-01',
          expiry_date: (med as any).expiry_date || getDefaultExpiryDate(),
          unit: defaultUnit,
          qty: 1,
          bonus_qty: 0,
          mrp: defaultMrp,
          disc_percent: 15,
          disc_amt: initialDiscAmt,
          gst_percent: 0,
          gst_amt: '0.00',
          further_tax_percent: 0,
          further_tax_amt: '0.00',
          adv_tax_percent: 0,
          adv_tax_amt: '0.00',
          charge_percent: 0,
          charge_amt: '0.00',
          tablets_per_box: tabletsPerBox(med),
          tablets_per_strip: Math.max(1, med.tablets_per_strip || 1),
          category: (med as any).category,
        },
      ]);
    }
    setItemQuery('');
    setShowItemDropdown(false);

    setTimeout(() => {
      const el = document.getElementById(`pur-batch-${medId}`) as HTMLInputElement;
      el?.focus();
      el?.select();
    }, 60);
  }

  function changeUnit(medicineId: string, newUnit: SaleUnit) {
    const originalMed = medicines.find((m) => m.id === medicineId);
    if (!originalMed) return;

    const newMrp = priceForUnit(originalMed, newUnit);
    setCartItems((prev) =>
      prev.map((c) => {
        if (c.medicine_id !== medicineId) return c;
        const discPercent = Number(c.disc_percent) || 0;
        return {
          ...c,
          unit: newUnit,
          mrp: newMrp,
          disc_amt: ((newMrp * discPercent) / 100).toFixed(2),
        };
      })
    );
  }

  function updateCartItem(id: string, field: keyof PurchaseItem, val: any) {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.medicine_id !== id) return item;
        const updated: any = { ...item, [field]: val };
        const mrpNum = Number(updated.mrp) || 0;

        if (field === 'disc_percent') {
          const p = Number(val) || 0;
          updated.disc_amt = ((mrpNum * p) / 100).toFixed(2);
        }
        if (field === 'disc_amt') {
          const amt = Number(val) || 0;
          updated.disc_percent = mrpNum > 0 ? ((amt / mrpNum) * 100).toFixed(1) : 0;
        }

        if (field === 'gst_percent') {
          const p = Number(val) || 0;
          updated.gst_amt = ((mrpNum * p) / 100).toFixed(2);
        }
        if (field === 'gst_amt') {
          const amt = Number(val) || 0;
          updated.gst_percent = mrpNum > 0 ? ((amt / mrpNum) * 100).toFixed(1) : 0;
        }

        if (field === 'adv_tax_percent') {
          const p = Number(val) || 0;
          updated.adv_tax_amt = ((mrpNum * p) / 100).toFixed(2);
        }
        if (field === 'adv_tax_amt') {
          const amt = Number(val) || 0;
          updated.adv_tax_percent = mrpNum > 0 ? ((amt / mrpNum) * 100).toFixed(1) : 0;
        }

        if (field === 'further_tax_percent') {
          const p = Number(val) || 0;
          updated.further_tax_amt = ((mrpNum * p) / 100).toFixed(2);
        }
        if (field === 'further_tax_amt') {
          const amt = Number(val) || 0;
          updated.further_tax_percent = mrpNum > 0 ? ((amt / mrpNum) * 100).toFixed(1) : 0;
        }

        if (field === 'charge_percent') {
          const p = Number(val) || 0;
          updated.charge_amt = ((mrpNum * p) / 100).toFixed(2);
        }
        if (field === 'charge_amt') {
          const amt = Number(val) || 0;
          updated.charge_percent = mrpNum > 0 ? ((amt / mrpNum) * 100).toFixed(1) : 0;
        }

        return updated;
      })
    );
  }

  function calculateRowCost(item: PurchaseItem) {
    const mrp = Number(item.mrp) || 0;
    const disc = Number(item.disc_amt) || 0;
    const gst = Number(item.gst_amt) || 0;
    const adv = Number(item.adv_tax_amt) || 0;
    const fur = Number(item.further_tax_amt) || 0;
    const chg = Number(item.charge_amt) || 0;

    const unitNetCost = mrp - disc + gst + adv + fur + chg;
    const qty = Number(item.qty) || 0;
    const lineTotal = unitNetCost * qty;

    return { unitNetCost, lineTotal };
  }

  const grossItemsNetTotal = useMemo(() => {
    return cartItems.reduce((sum, it) => sum + calculateRowCost(it).lineTotal, 0);
  }, [cartItems]);

  function handleSummaryDiscPercent(val: string) {
    setOverallDiscountPercent(val);
    const p = Number(val) || 0;
    setOverallDiscountAmt(((grossItemsNetTotal * p) / 100).toFixed(2));
  }
  function handleSummaryDiscAmt(val: string) {
    setOverallDiscountAmt(val);
    const amt = Number(val) || 0;
    setOverallDiscountPercent(grossItemsNetTotal > 0 ? ((amt / grossItemsNetTotal) * 100).toFixed(1) : '0');
  }

  function handleSummaryGstPercent(val: string) {
    setOverallGstPercent(val);
    const p = Number(val) || 0;
    setOverallGstAmt(((grossItemsNetTotal * p) / 100).toFixed(2));
  }
  function handleSummaryGstAmt(val: string) {
    setOverallGstAmt(val);
    const amt = Number(val) || 0;
    setOverallGstPercent(grossItemsNetTotal > 0 ? ((amt / grossItemsNetTotal) * 100).toFixed(1) : '0');
  }

  function handleSummaryAdvPercent(val: string) {
    setOverallAdvTaxPercent(val);
    const p = Number(val) || 0;
    setOverallAdvTaxAmt(((grossItemsNetTotal * p) / 100).toFixed(2));
  }
  function handleSummaryAdvAmt(val: string) {
    setOverallAdvTaxAmt(val);
    const amt = Number(val) || 0;
    setOverallAdvTaxPercent(grossItemsNetTotal > 0 ? ((amt / grossItemsNetTotal) * 100).toFixed(1) : '0');
  }

  function handleSummaryFurtherPercent(val: string) {
    setOverallFurtherTaxPercent(val);
    const p = Number(val) || 0;
    setOverallFurtherTaxAmt(((grossItemsNetTotal * p) / 100).toFixed(2));
  }
  function handleSummaryFurtherAmt(val: string) {
    setOverallFurtherTaxAmt(val);
    const amt = Number(val) || 0;
    setOverallFurtherTaxPercent(grossItemsNetTotal > 0 ? ((amt / grossItemsNetTotal) * 100).toFixed(1) : '0');
  }

  const finalNetPayable = useMemo(() => {
    const disc = Number(overallDiscountAmt) || 0;
    const gst = Number(overallGstAmt) || 0;
    const adv = Number(overallAdvTaxAmt) || 0;
    const fur = Number(overallFurtherTaxAmt) || 0;

    return Math.max(0, grossItemsNetTotal - disc + gst + adv + fur);
  }, [grossItemsNetTotal, overallDiscountAmt, overallGstAmt, overallAdvTaxAmt, overallFurtherTaxAmt]);

  function handleStartEditInvoice(inv: PurchaseInvoiceRecord) {
    setEditingInvoiceId(inv.id);
    setInvoiceNo(inv.invoice_no);
    setPurchaseDate(inv.purchase_date);
    setCartItems(inv.items || []);

    setOverallDiscountPercent(String(inv.overall_discount_percent ?? '0'));
    setOverallDiscountAmt(String(inv.overall_discount_amt ?? '0'));
    setOverallGstPercent(String(inv.gst_percent ?? '0'));
    setOverallGstAmt(String(inv.gst_amt ?? '0'));
    setOverallAdvTaxPercent(String(inv.adv_tax_percent ?? '0'));
    setOverallAdvTaxAmt(String(inv.adv_tax_amt ?? '0'));
    setOverallFurtherTaxPercent(String(inv.further_tax_percent ?? '0'));
    setOverallFurtherTaxAmt(String(inv.further_tax_amt ?? '0'));

    setView('entry');
    setTimeout(() => invoiceNoInputRef.current?.focus(), 80);
  }

  async function handleDeleteInvoice(inv: PurchaseInvoiceRecord) {
    const ok = window.confirm(
      `Kya aap waqai Invoice #${inv.invoice_no} delete karna chahte hain?\nIs bill se jo maal inventory me add hua tha, wo automatically minus (-unstock) ho jayega!`
    );
    if (!ok) return;

    try {
      await Promise.all(
        (inv.items || []).map(async (it) => {
          const med = medicines.find((m) => m.id === it.medicine_id);
          if (med) {
            const addedStock = tabletsForQty(Number(it.qty) + Number(it.bonus_qty || 0), it.unit, it);
            const revertedQty = Math.max(0, Number(med.stock_quantity || 0) - addedStock);
            return supabase
              .from('medicines')
              .update({ stock_quantity: revertedQty, updated_at: new Date().toISOString() })
              .eq('id', it.medicine_id);
          }
        })
      );

      const existingBatches = JSON.parse(localStorage.getItem('pos_batches') || '[]');
      const filteredBatches = existingBatches.filter((b: any) => b.vendor_id !== inv.vendor_id || !inv.items.some((i) => i.batch_no === b.batch_no));
      localStorage.setItem('pos_batches', JSON.stringify(filteredBatches));

      const updatedInvoices = invoices.filter((i) => i.id !== inv.id);
      saveInvoicesToStorage(updatedInvoices);

      fetchMedicines();
      alert(`Invoice #${inv.invoice_no} delete ho chuka hai aur stock inventory se nikaal diya gaya hai!`);
    } catch (err) {
      console.error(err);
      alert('Delete karte waqt masla aaya.');
    }
  }

  async function handleSavePurchase() {
    if (!selectedVendor) return;
    if (cartItems.length === 0) {
      alert('Pehle bill me medicines add karein.');
      return;
    }

    const billNo = invoiceNo.trim() || `PUR-${Date.now().toString().slice(-6)}`;

    // Revert old stock if editing
    if (editingInvoiceId) {
      const oldInvoice = invoices.find((i) => i.id === editingInvoiceId);
      if (oldInvoice) {
        await Promise.all(
          (oldInvoice.items || []).map(async (it) => {
            const med = medicines.find((m) => m.id === it.medicine_id);
            if (med) {
              const oldAdded = tabletsForQty(Number(it.qty) + Number(it.bonus_qty || 0), it.unit, it);
              const baseQty = Math.max(0, Number(med.stock_quantity || 0) - oldAdded);
              return supabase.from('medicines').update({ stock_quantity: baseQty }).eq('id', it.medicine_id);
            }
          })
        );
      }
    }

    const record: PurchaseInvoiceRecord = {
      id: editingInvoiceId || `pur_${Date.now()}`,
      invoice_no: billNo,
      vendor_id: selectedVendor.id,
      vendor_name: selectedVendor.company_name,
      purchase_date: purchaseDate,
      items: cartItems,
      items_subtotal: grossItemsNetTotal,
      total_discount: Number(overallDiscountAmt) || 0,
      gst_percent: overallGstPercent,
      gst_amt: Number(overallGstAmt) || 0,
      adv_tax_percent: overallAdvTaxPercent,
      adv_tax_amt: Number(overallAdvTaxAmt) || 0,
      further_tax_percent: overallFurtherTaxPercent,
      further_tax_amt: Number(overallFurtherTaxAmt) || 0,
      net_payable: finalNetPayable,
      overall_discount_percent: overallDiscountPercent,
      overall_discount_amt: overallDiscountAmt,
      created_at: new Date().toISOString(),
    };

    // 1. AUTO UPDATE MASTER MEDICINES TABLE (STOCK & DYNAMIC GLOBAL PRICE UPDATE)
    try {
      await Promise.all(
        cartItems.map(async (it) => {
          const med = medicines.find((m) => m.id === it.medicine_id);
          if (med) {
            const totalQty = Number(it.qty) + Number(it.bonus_qty || 0);
            const addedUnits = tabletsForQty(totalQty, it.unit, it);
            const newStockQty = Number(med.stock_quantity || 0) + addedUnits;

            let newBoxRetailPrice = Number(it.mrp) || Number(med.sale_price) || 0;
            if (it.unit === 'Strip') {
              const spb = Number(med.strips_per_box) || 1;
              newBoxRetailPrice = Number(it.mrp) * spb;
            } else if (it.unit === 'Tablet') {
              const tpb = tabletsPerBox(med);
              newBoxRetailPrice = Number(it.mrp) * tpb;
            }

            return supabase
              .from('medicines')
              .update({ 
                stock_quantity: newStockQty,
                sale_price: newBoxRetailPrice,
                updated_at: new Date().toISOString() 
              })
              .eq('id', it.medicine_id);
          }
        })
      );
    } catch (e) {
      console.warn('Offline mode: Local updated');
    }

    // 2. FIFO BATCH SAVE
    const existingBatches = JSON.parse(localStorage.getItem('pos_batches') || '[]');
    const newBatches = cartItems.map((it) => {
      const { unitNetCost } = calculateRowCost(it);
      const totalUnits = Number(it.qty) + Number(it.bonus_qty || 0);
      return {
        id: `batch_${Date.now()}_${it.medicine_id}`,
        medicine_id: it.medicine_id,
        medicine_name: it.name,
        vendor_id: selectedVendor.id,
        vendor_name: selectedVendor.company_name,
        batch_no: it.batch_no || 'B-01',
        expiry_date: it.expiry_date || '2028-12-31',
        unit: it.unit,
        mrp: Number(it.mrp),
        cost_price: unitNetCost,
        remaining_qty: totalUnits,
        initial_qty: totalUnits,
        bonus_qty: Number(it.bonus_qty || 0),
        created_at: new Date().toISOString(),
      };
    });

    localStorage.setItem('pos_batches', JSON.stringify([...newBatches, ...existingBatches]));

    const updatedInvoices = editingInvoiceId
      ? invoices.map((i) => (i.id === editingInvoiceId ? record : i))
      : [record, ...invoices];

    saveInvoicesToStorage(updatedInvoices);

    // Call Thermal Slip Print
    printPurchaseReceipt(
      {
        invoice_no: record.invoice_no,
        vendor_name: record.vendor_name,
        purchase_date: record.purchase_date,
        items: record.items.map((it) => ({
          name: it.name,
          batch_no: it.batch_no,
          expiry_date: it.expiry_date,
          qty: it.qty,
          bonus_qty: it.bonus_qty,
          unit: it.unit,
          mrp: Number(it.mrp),
          gst_amt: it.gst_amt,
          adv_tax_amt: it.adv_tax_amt,
          further_tax_amt: it.further_tax_amt,
          lineTotal: calculateRowCost(it).lineTotal,
        })),
        items_subtotal: grossItemsNetTotal,
        total_discount: Number(overallDiscountAmt) || 0,
        gst_amt: Number(overallGstAmt) || 0,
        gst_percent: overallGstPercent,
        adv_tax_amt: Number(overallAdvTaxAmt) || 0,
        adv_tax_percent: overallAdvTaxPercent,
        further_tax_amt: Number(overallFurtherTaxAmt) || 0,
        further_tax_percent: overallFurtherTaxPercent,
        net_payable: record.net_payable,
      },
      settings || null
    );

    // Clear Draft on Success
    clearPurchaseDraft();
    setView('vendor_ledger');
    fetchMedicines();
  }

  function handleReprintInvoice(inv: PurchaseInvoiceRecord) {
    const subtotal = inv.items_subtotal ?? (inv.items || []).reduce(
      (sum, it) => sum + calculateRowCost(it).lineTotal,
      0
    );

    printPurchaseReceipt(
      {
        invoice_no: inv.invoice_no,
        vendor_name: inv.vendor_name,
        purchase_date: inv.purchase_date,
        items: inv.items.map((it) => ({
          name: it.name,
          batch_no: it.batch_no,
          expiry_date: it.expiry_date,
          qty: it.qty,
          bonus_qty: it.bonus_qty,
          unit: it.unit,
          mrp: Number(it.mrp),
          gst_amt: it.gst_amt,
          adv_tax_amt: it.adv_tax_amt,
          further_tax_amt: it.further_tax_amt,
          lineTotal: calculateRowCost(it).lineTotal,
        })),
        items_subtotal: subtotal,
        total_discount: Number(inv.overall_discount_amt ?? inv.total_discount ?? 0),
        gst_amt: Number(inv.gst_amt ?? 0),
        gst_percent: inv.gst_percent ?? 0,
        adv_tax_amt: Number(inv.adv_tax_amt ?? 0),
        adv_tax_percent: inv.adv_tax_percent ?? 0,
        further_tax_amt: Number(inv.further_tax_amt ?? 0),
        further_tax_percent: inv.further_tax_percent ?? 0,
        net_payable: inv.net_payable,
      },
      settings || null
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 select-none">
      {/* Top Header */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          {view !== 'directory' && (
            <button
              onClick={() => {
                if (view === 'entry') {
                  setView('vendor_ledger');
                } else {
                  setView('directory');
                }
              }}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Truck className="h-5 w-5 text-indigo-600" />
              {view === 'directory'
                ? 'Vendor & Company Directory'
                : view === 'vendor_ledger'
                ? `${selectedVendor?.company_name} — Supply Bills`
                : editingInvoiceId
                ? `Edit Supply Bill: #${invoiceNo}`
                : `New Supply Entry: ${selectedVendor?.company_name}`}
            </h1>
            <p className="text-xs text-slate-500">
              Suppliers, bookers, purchase bills, taxes & bonus receiving.
            </p>
          </div>
        </div>

        {view === 'directory' && (
          <button
            onClick={() => setShowAddVendorModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add Vendor</span>
          </button>
        )}

        {view === 'vendor_ledger' && (
          <button
            onClick={() => {
              clearPurchaseDraft();
              setView('entry');
              setTimeout(() => invoiceNoInputRef.current?.focus(), 80);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-colors"
          >
            <PackageCheck className="h-4 w-4" />
            <span>+ Enter New Supply</span>
          </button>
        )}
      </div>

      {/* VIEW 1: VENDORS DIRECTORY */}
      {view === 'directory' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-slate-400 ml-1" />
              <input
                ref={vSearchInputRef}
                type="text"
                placeholder="Search vendor by name, booker, or phone..."
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                className="w-full text-xs font-medium text-slate-700 outline-none"
              />
            </div>
            <span className="text-xs font-bold text-slate-400">{filteredVendors.length} Vendors in Directory</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVendors.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                <Building2 className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold">Abhi koi vendor add nahi hai.</p>
                <p className="text-[11px] text-slate-400 mt-1">Upar diye gaye "+ Add Vendor" button se vendor add karein.</p>
              </div>
            ) : (
              filteredVendors.map((v) => {
                const billCount = invoices.filter((i) => i.vendor_id === v.id).length;
                return (
                  <div
                    key={v.id}
                    onClick={() => {
                      setSelectedVendor(v);
                      setView('vendor_ledger');
                    }}
                    className="p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer space-y-3 group"
                  >
                    <div className="flex items-start justify-between">
                      <h3 className="font-bold text-sm text-slate-800 group-hover:text-indigo-600 transition-colors">
                        {v.company_name}
                      </h3>
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold text-[10px] rounded-full border border-indigo-100">
                        {billCount} Bills
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600 border-t border-slate-100 pt-2">
                      {v.booker_name && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-slate-400" />
                          <span>Booker: <strong>{v.booker_name}</strong> {v.booker_phone && `(${v.booker_phone})`}</span>
                        </div>
                      )}
                      {v.supplier_phone && (
                        <div className="text-[11px] text-slate-500">
                          Supplier Delivery: {v.supplier_phone}
                        </div>
                      )}
                      {v.supervisor_phone && (
                        <div className="text-[11px] text-slate-400">
                          Supervisor: {v.supervisor_phone}
                        </div>
                      )}
                      {v.manager_phone && (
                        <div className="text-[11px] text-slate-400">
                          Manager: {v.manager_phone}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold text-indigo-600 pt-1 group-hover:translate-x-1 transition-transform">
                      <span>View Bills & Enter Supply</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: VENDOR BILLS & HISTORY */}
      {view === 'vendor_ledger' && selectedVendor && (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">{selectedVendor.company_name}</h2>
              <p className="text-xs text-slate-500">
                Booker: {selectedVendor.booker_name || 'N/A'} ({selectedVendor.booker_phone || 'No Phone'}) | Supplier: {selectedVendor.supplier_phone || 'N/A'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-slate-500 block">Total Purchases</span>
              <span className="text-lg font-black text-slate-800">
                {formatCurrency(filteredVendorInvoices.reduce((a, b) => a + (b.net_payable || 0), 0))}
              </span>
            </div>
          </div>

          {/* DATE & CALENDAR FILTER BAR */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                onClick={() => setDateFilterMode('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  dateFilterMode === 'all' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Records
              </button>
              <button
                onClick={() => setDateFilterMode('today')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  dateFilterMode === 'today' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setDateFilterMode('yesterday')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  dateFilterMode === 'yesterday' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Yesterday
              </button>
              <button
                onClick={() => setDateFilterMode('month')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  dateFilterMode === 'month' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                This Month
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-300 shadow-xs">
                <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                <input
                  type="date"
                  value={customHistoryDate}
                  onChange={(e) => {
                    setCustomHistoryDate(e.target.value);
                    setDateFilterMode('custom');
                  }}
                  className="text-xs font-semibold text-slate-700 bg-transparent outline-none cursor-pointer"
                />
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search invoice or item..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 font-bold text-xs text-slate-700 uppercase flex items-center justify-between">
              <span>Supply Invoices History ({filteredVendorInvoices.length})</span>
              <span className="text-[11px] text-slate-400 font-normal">Thermal Print, View & Edit ready</span>
            </div>
            {filteredVendorInvoices.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Is tareekh ya search ke mutabiq koi bill nahi mila.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Invoice No</th>
                      <th className="px-4 py-3">Purchase Date</th>
                      <th className="px-4 py-3 text-center">Items Count</th>
                      <th className="px-4 py-3 text-right">Discount</th>
                      <th className="px-4 py-3 text-right">Net Payable</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredVendorInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono font-bold text-indigo-700">{inv.invoice_no}</td>
                        <td className="px-4 py-3 text-slate-600">{inv.purchase_date}</td>
                        <td className="px-4 py-3 text-center">{inv.items?.length || 0} Products</td>
                        <td className="px-4 py-3 text-right text-emerald-600">
                          {Number(inv.total_discount) > 0 ? `-${formatCurrency(inv.total_discount)}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(inv.net_payable)}</td>
                        
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleReprintInvoice(inv)}
                              className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                              title="Print Thermal Receipt"
                            >
                              <Printer className="h-4 w-4" />
                            </button>

                            <button
                              onClick={() => setViewingInvoice(inv)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="View Invoice Details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>

                            <button
                              onClick={() => handleStartEditInvoice(inv)}
                              className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit This Invoice"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>

                            <button
                              onClick={() => handleDeleteInvoice(inv)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Invoice & Reverse Stock"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: SUPPLY ENTRY SCREEN (PERSISTENT AUTO-DRAFT) */}
      {view === 'entry' && selectedVendor && (
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Vendor Name</label>
                <input
                  type="text"
                  value={selectedVendor.company_name}
                  disabled
                  className="w-full px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Supplier Bill / Invoice #</label>
                <input
                  ref={invoiceNoInputRef}
                  type="text"
                  placeholder="e.g. INV-9821"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      searchInputRef.current?.focus();
                    }
                  }}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Purchase Date</label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 outline-none cursor-pointer"
                />
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Dawa Search Karein (Auto-fetches MRP from Inventory):
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Panadol, Augmentin, etc..."
                  value={itemQuery}
                  onChange={(e) => {
                    setItemQuery(e.target.value);
                    setShowItemDropdown(true);
                    setHighlightedItemIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHighlightedItemIndex((prev) => Math.min(prev + 1, itemMatches.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedItemIndex((prev) => Math.max(prev - 1, 0));
                    } else if (e.key === 'Enter' && itemMatches.length > 0) {
                      e.preventDefault();
                      addItemToCart(itemMatches[highlightedItemIndex]);
                    }
                  }}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {showItemDropdown && itemMatches.length > 0 && (
                  <div className="absolute left-0 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto">
                    {itemMatches.map((m, idx) => (
                      <div
                        key={m.id}
                        onClick={() => addItemToCart(m)}
                        className={`p-3 border-b border-slate-100 flex items-center justify-between cursor-pointer ${
                          highlightedItemIndex === idx ? 'bg-indigo-100 text-indigo-900 font-bold' : 'hover:bg-indigo-50'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-800">{m.name}</div>
                          <div className="text-[10px] text-slate-400">Current Stock: {m.stock_quantity}</div>
                        </div>
                        <span className="text-xs font-bold text-indigo-600">
                          MRP: {formatCurrency(Number(m.sale_price))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cart Table with Clear Cart Option */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase">Received Products ({cartItems.length})</span>
                {cartItems.length > 0 && (
                  <button 
                    onClick={() => {
                      if (window.confirm('Kya aap waqai is draft bill ke tamam items clear karna chahte hain?')) {
                        clearPurchaseDraft();
                      }
                    }} 
                    className="text-xs text-rose-600 font-bold hover:underline cursor-pointer"
                  >
                    Clear Cart
                  </button>
                )}
              </div>

              {cartItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Koi medicine add nahi hai. Upar se search karke dawa select karein.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="text-left px-2.5 py-2">Item</th>
                        <th className="px-1.5 py-2 text-center">Batch</th>
                        <th className="px-2 py-2 text-center text-indigo-700 bg-indigo-50/50 min-w-[125px]">
                          Expiry Date
                        </th>
                        <th className="px-1.5 py-2 text-center">Unit</th>
                        <th className="px-1.5 py-2 text-center">Qty</th>
                        <th className="px-1.5 py-2 text-center text-amber-700 bg-amber-50/50">Bonus</th>
                        <th className="px-1.5 py-2 text-right">MRP (Rs)</th>
                        <th className="px-1.5 py-2 text-center text-emerald-700">Disc (%)</th>
                        <th className="px-1.5 py-2 text-center">GST (%)</th>
                        <th className="px-1.5 py-2 text-center">Adv Tax (%)</th>
                        <th className="px-1.5 py-2 text-center">Further (%)</th>
                        <th className="px-1.5 py-2 text-center">Charge (%)</th>
                        <th className="px-2 py-2 text-right">Unit Cost</th>
                        <th className="px-2 py-2 text-right">Total</th>
                        <th className="w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {cartItems.map((item, idx) => {
                        const originalMed = medicines.find((m) => m.id === item.medicine_id);
                        const itType = originalMed ? getItemType(originalMed) : 'tablet';
                        const { unitNetCost, lineTotal } = calculateRowCost(item);
                        const id = item.medicine_id;

                        return (
                          <tr key={id} className="hover:bg-slate-50">
                            <td className="px-2.5 py-2 font-bold text-slate-800">{item.name}</td>

                            <td className="px-1 py-2 text-center">
                              <input
                                id={`pur-batch-${id}`}
                                type="text"
                                placeholder="B-01"
                                value={item.batch_no}
                                onChange={(e) => updateCartItem(id, 'batch_no', e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    document.getElementById(`pur-exp-${id}`)?.focus();
                                  }
                                }}
                                className="w-16 px-1 py-1 border border-slate-300 rounded text-center text-[11px] font-mono outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>

                            <td className="px-2 py-2 text-center bg-indigo-50/20">
                              <div className="relative inline-flex items-center">
                                <input
                                  id={`pur-exp-${id}`}
                                  type="date"
                                  value={item.expiry_date}
                                  onChange={(e) => updateCartItem(id, 'expiry_date', e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const qtyEl = document.getElementById(`pur-qty-${id}`) as HTMLInputElement;
                                      qtyEl?.focus();
                                      qtyEl?.select();
                                    }
                                  }}
                                  className="w-32 px-2 py-1 border border-indigo-300 rounded-lg text-xs font-bold text-indigo-900 bg-white shadow-xs outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                />
                              </div>
                            </td>

                            <td className="px-1 py-2 text-center">
                              {itType === 'injection' ? (
                                <select
                                  value={item.unit === 'Box' ? 'Box' : 'Tablet'}
                                  onChange={(e) => changeUnit(id, e.target.value as SaleUnit)}
                                  className="text-[11px] border border-blue-400 rounded px-1.5 py-1 bg-blue-50 text-blue-900 font-bold outline-none cursor-pointer"
                                >
                                  <option value="Box">Box</option>
                                  <option value="Tablet">Inj/Amp</option>
                                </select>
                              ) : itType === 'general' ? (
                                <span className="inline-block text-[11px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-700">
                                  Pcs / Bot
                                </span>
                              ) : (
                                <select
                                  value={item.unit}
                                  onChange={(e) => changeUnit(id, e.target.value as SaleUnit)}
                                  className="text-[11px] border border-indigo-300 rounded px-1 py-1 bg-indigo-50 text-indigo-900 font-semibold outline-none cursor-pointer"
                                >
                                  <option value="Box">Box</option>
                                  <option value="Strip">Strip</option>
                                  <option value="Tablet">Tablet</option>
                                </select>
                              )}
                            </td>

                            <td className="px-1 py-2 text-center">
                              <input
                                id={`pur-qty-${id}`}
                                type="number"
                                min="1"
                                value={item.qty}
                                onChange={(e) => updateCartItem(id, 'qty', e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const bonusEl = document.getElementById(`pur-bonus-${id}`) as HTMLInputElement;
                                    bonusEl?.focus();
                                    bonusEl?.select();
                                  }
                                }}
                                className="w-12 text-center border border-slate-300 rounded py-1 font-bold text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>

                            <td className="px-1 py-2 text-center bg-amber-50/30">
                              <input
                                id={`pur-bonus-${id}`}
                                type="number"
                                min="0"
                                placeholder="0"
                                value={item.bonus_qty}
                                onChange={(e) => updateCartItem(id, 'bonus_qty', e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const mrpEl = document.getElementById(`pur-mrp-${id}`) as HTMLInputElement;
                                    mrpEl?.focus();
                                    mrpEl?.select();
                                  }
                                }}
                                className="w-11 text-center border border-amber-300 rounded py-1 font-bold text-amber-800 text-xs outline-none focus:ring-1 focus:ring-amber-500"
                              />
                            </td>

                            <td className="px-1 py-2 text-right">
                              <input
                                id={`pur-mrp-${id}`}
                                type="number"
                                value={item.mrp}
                                onChange={(e) => updateCartItem(id, 'mrp', e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const discEl = document.getElementById(`pur-disc-${id}`) as HTMLInputElement;
                                    discEl?.focus();
                                    discEl?.select();
                                  }
                                }}
                                className="w-14 text-right border border-slate-300 rounded py-1 font-bold text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>

                            <td className="px-1 py-2 text-center">
                              <div className="flex items-center gap-0.5 justify-center">
                                <input
                                  id={`pur-disc-${id}`}
                                  type="number"
                                  value={item.disc_percent}
                                  onChange={(e) => updateCartItem(id, 'disc_percent', e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const gstEl = document.getElementById(`pur-gst-${id}`) as HTMLInputElement;
                                      gstEl?.focus();
                                      gstEl?.select();
                                    }
                                  }}
                                  className="w-11 text-center border border-emerald-300 rounded py-0.5 text-[11px] font-bold text-emerald-700 outline-none"
                                />
                                <span className="text-[10px] text-slate-400">%</span>
                              </div>
                              <input
                                type="number"
                                placeholder="Rs"
                                value={item.disc_amt}
                                onChange={(e) => updateCartItem(id, 'disc_amt', e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className="w-14 text-right border border-slate-200 rounded py-0.5 text-[10px] text-slate-500 mt-0.5 outline-none"
                              />
                            </td>

                            <td className="px-1 py-2 text-center">
                              <input
                                id={`pur-gst-${id}`}
                                type="number"
                                placeholder="%"
                                value={item.gst_percent}
                                onChange={(e) => updateCartItem(id, 'gst_percent', e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const advEl = document.getElementById(`pur-adv-${id}`) as HTMLInputElement;
                                    advEl?.focus();
                                    advEl?.select();
                                  }
                                }}
                                className="w-10 text-center border border-slate-300 rounded py-0.5 text-[11px] outline-none"
                              />
                              <input
                                type="number"
                                placeholder="Rs"
                                value={item.gst_amt}
                                onChange={(e) => updateCartItem(id, 'gst_amt', e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className="w-12 text-right border border-slate-200 rounded py-0.5 text-[10px] text-slate-500 mt-0.5 outline-none"
                              />
                            </td>

                            <td className="px-1 py-2 text-center">
                              <input
                                id={`pur-adv-${id}`}
                                type="number"
                                placeholder="%"
                                value={item.adv_tax_percent}
                                onChange={(e) => updateCartItem(id, 'adv_tax_percent', e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const furEl = document.getElementById(`pur-further-${id}`) as HTMLInputElement;
                                    furEl?.focus();
                                    furEl?.select();
                                  }
                                }}
                                className="w-10 text-center border border-slate-300 rounded py-0.5 text-[11px] outline-none"
                              />
                              <input
                                type="number"
                                placeholder="Rs"
                                value={item.adv_tax_amt}
                                onChange={(e) => updateCartItem(id, 'adv_tax_amt', e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className="w-12 text-right border border-slate-200 rounded py-0.5 text-[10px] text-slate-500 mt-0.5 outline-none"
                              />
                            </td>

                            <td className="px-1 py-2 text-center">
                              <input
                                id={`pur-further-${id}`}
                                type="number"
                                placeholder="%"
                                value={item.further_tax_percent}
                                onChange={(e) => updateCartItem(id, 'further_tax_percent', e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const chgEl = document.getElementById(`pur-charge-${id}`) as HTMLInputElement;
                                    chgEl?.focus();
                                    chgEl?.select();
                                  }
                                }}
                                className="w-10 text-center border border-slate-300 rounded py-0.5 text-[11px] outline-none"
                              />
                              <input
                                type="number"
                                placeholder="Rs"
                                value={item.further_tax_amt}
                                onChange={(e) => updateCartItem(id, 'further_tax_amt', e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className="w-12 text-right border border-slate-200 rounded py-0.5 text-[10px] text-slate-500 mt-0.5 outline-none"
                              />
                            </td>

                            <td className="px-1 py-2 text-center">
                              <input
                                id={`pur-charge-${id}`}
                                type="number"
                                placeholder="%"
                                value={item.charge_percent}
                                onChange={(e) => updateCartItem(id, 'charge_percent', e.target.value)}
                                onFocus={(e) => e.target.select()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const next = cartItems[idx + 1];
                                    if (next) {
                                      const nextBatch = document.getElementById(`pur-batch-${next.medicine_id}`) as HTMLInputElement;
                                      nextBatch?.focus();
                                      nextBatch?.select();
                                    } else {
                                      searchInputRef.current?.focus();
                                    }
                                  }
                                }}
                                className="w-10 text-center border border-slate-300 rounded py-0.5 text-[11px] outline-none"
                              />
                              <input
                                type="number"
                                placeholder="Rs"
                                value={item.charge_amt}
                                onChange={(e) => updateCartItem(id, 'charge_amt', e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className="w-12 text-right border border-slate-200 rounded py-0.5 text-[10px] text-slate-500 mt-0.5 outline-none"
                              />
                            </td>

                            <td className="px-2 py-2 text-right font-bold text-slate-800">
                              {formatCurrency(unitNetCost)}
                            </td>

                            <td className="px-2 py-2 text-right font-black text-indigo-700">
                              {formatCurrency(lineTotal)}
                            </td>

                            <td className="px-1 py-2 text-center">
                              <button
                                onClick={() => setCartItems((prev) => prev.filter((c) => c.medicine_id !== id))}
                                className="text-slate-400 hover:text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Invoice Summary Card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 sticky top-4">
              <h3 className="font-bold text-slate-800 text-sm flex items-center justify-between border-b border-slate-100 pb-2">
                <span>{editingInvoiceId ? 'Update Bill Summary' : 'Supply Bill Summary'}</span>
                <span className="text-[10px] text-indigo-600 font-mono">[Esc to Focus]</span>
              </h3>

              <div className="space-y-3 text-xs">
                {/* Items Net Subtotal */}
                <div className="flex items-center justify-between text-slate-700">
                  <span className="font-bold text-sm">Items Net Subtotal:</span>
                  <span className="font-black text-sm text-slate-900">{formatCurrency(grossItemsNetTotal)}</span>
                </div>

                {/* Overall Discount */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                  <span className="font-semibold text-emerald-700">Overall Bill Discount:</span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center border border-emerald-300 rounded bg-emerald-50/50 px-1 py-0.5">
                      <input
                        ref={sumDiscPercentRef}
                        type="number"
                        value={overallDiscountPercent}
                        onChange={(e) => handleSummaryDiscPercent(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            sumGstPercentRef.current?.focus();
                            sumGstPercentRef.current?.select();
                          }
                        }}
                        className="w-9 text-center bg-transparent font-bold text-emerald-800 outline-none text-[11px]"
                      />
                      <span className="text-[10px] text-emerald-600 font-bold">%</span>
                    </div>
                    <input
                      type="number"
                      placeholder="Rs"
                      value={overallDiscountAmt}
                      onChange={(e) => handleSummaryDiscAmt(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-16 text-right border border-emerald-300 rounded px-1.5 py-0.5 font-bold text-emerald-800 outline-none text-[11px]"
                    />
                  </div>
                </div>

                {/* Overall GST Tax */}
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">GST Tax:</span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center border border-slate-300 rounded px-1 py-0.5">
                      <input
                        ref={sumGstPercentRef}
                        type="number"
                        value={overallGstPercent}
                        onChange={(e) => handleSummaryGstPercent(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            sumAdvPercentRef.current?.focus();
                            sumAdvPercentRef.current?.select();
                          }
                        }}
                        className="w-9 text-center outline-none text-[11px] font-bold"
                      />
                      <span className="text-[10px] text-slate-400 font-bold">%</span>
                    </div>
                    <input
                      type="number"
                      placeholder="Rs"
                      value={overallGstAmt}
                      onChange={(e) => handleSummaryGstAmt(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-16 text-right border border-slate-300 rounded px-1.5 py-0.5 font-bold outline-none text-[11px]"
                    />
                  </div>
                </div>

                {/* Overall Advance Tax (WHT) */}
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Advance Tax (WHT):</span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center border border-slate-300 rounded px-1 py-0.5">
                      <input
                        ref={sumAdvPercentRef}
                        type="number"
                        value={overallAdvTaxPercent}
                        onChange={(e) => handleSummaryAdvPercent(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            sumFurtherPercentRef.current?.focus();
                            sumFurtherPercentRef.current?.select();
                          }
                        }}
                        className="w-9 text-center outline-none text-[11px] font-bold"
                      />
                      <span className="text-[10px] text-slate-400 font-bold">%</span>
                    </div>
                    <input
                      type="number"
                      placeholder="Rs"
                      value={overallAdvTaxAmt}
                      onChange={(e) => handleSummaryAdvAmt(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-16 text-right border border-slate-300 rounded px-1.5 py-0.5 font-bold outline-none text-[11px]"
                    />
                  </div>
                </div>

                {/* Overall Further Tax */}
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Further Tax:</span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center border border-slate-300 rounded px-1 py-0.5">
                      <input
                        ref={sumFurtherPercentRef}
                        type="number"
                        value={overallFurtherTaxPercent}
                        onChange={(e) => handleSummaryFurtherPercent(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            confirmBtnRef.current?.focus();
                          }
                        }}
                        className="w-9 text-center outline-none text-[11px] font-bold"
                      />
                      <span className="text-[10px] text-slate-400 font-bold">%</span>
                    </div>
                    <input
                      type="number"
                      placeholder="Rs"
                      value={overallFurtherTaxAmt}
                      onChange={(e) => handleSummaryFurtherAmt(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-16 text-right border border-slate-300 rounded px-1.5 py-0.5 font-bold outline-none text-[11px]"
                    />
                  </div>
                </div>
              </div>

              {/* Net Payable Highlight */}
              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-center">
                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider block">
                  {editingInvoiceId ? 'UPDATED PAYABLE AMOUNT' : 'NET INVOICE PAYABLE'}
                </span>
                <span className="text-2xl font-black text-indigo-700 block mt-1">
                  {formatCurrency(finalNetPayable)}
                </span>
                <span className="text-[10px] text-indigo-500 mt-1 block font-medium">
                  Auto updates master price, prints slip & queues FIFO batches
                </span>
              </div>

              <button
                ref={confirmBtnRef}
                onClick={handleSavePurchase}
                disabled={cartItems.length === 0}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow cursor-pointer transition-colors focus:ring-2 focus:ring-indigo-600 focus:outline-none"
              >
                <Printer className="h-4 w-4" />
                <span>{editingInvoiceId ? 'Update Bill & Print' : 'Confirm, Receive Stock & Print'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: VIEW INVOICE */}
      {viewingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[2px]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 text-slate-800 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="font-bold text-base text-slate-800">Supply Invoice: #{viewingInvoice.invoice_no}</h3>
                <p className="text-xs text-slate-500">
                  Vendor: <strong>{viewingInvoice.vendor_name}</strong> | Date: {viewingInvoice.purchase_date}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReprintInvoice(viewingInvoice)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100 cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Slip</span>
                </button>
                <button onClick={() => setViewingInvoice(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-2 py-2 text-center">Batch</th>
                    <th className="px-2 py-2 text-center">Expiry</th>
                    <th className="px-2 py-2 text-center">Unit</th>
                    <th className="px-2 py-2 text-center">Qty</th>
                    <th className="px-2 py-2 text-center">Bonus</th>
                    <th className="px-2 py-2 text-right">MRP</th>
                    <th className="px-2 py-2 text-center">Disc</th>
                    <th className="px-2 py-2 text-right">Unit Cost</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewingInvoice.items.map((it: any, i: number) => {
                    const rowCost = calculateRowCost(it);
                    return (
                      <tr key={i}>
                        <td className="px-3 py-2 font-bold text-slate-800">{it.name}</td>
                        <td className="px-2 py-2 text-center font-mono">{it.batch_no}</td>
                        <td className="px-2 py-2 text-center text-slate-600">{it.expiry_date}</td>
                        <td className="px-2 py-2 text-center font-semibold text-indigo-700">{it.unit || 'Box'}</td>
                        <td className="px-2 py-2 text-center font-bold">{it.qty}</td>
                        <td className="px-2 py-2 text-center text-amber-700 font-bold">{it.bonus_qty || 0}</td>
                        <td className="px-2 py-2 text-right">{formatCurrency(Number(it.mrp))}</td>
                        <td className="px-2 py-2 text-center text-emerald-700">{it.disc_percent}%</td>
                        <td className="px-2 py-2 text-right font-semibold">{formatCurrency(rowCost.unitNetCost)}</td>
                        <td className="px-3 py-2 text-right font-black text-indigo-700">{formatCurrency(rowCost.lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold shrink-0">
              <div>
                Items Subtotal: <strong className="text-slate-800">{formatCurrency(viewingInvoice.items_subtotal)}</strong>
              </div>
              <div className="text-sm">
                Net Payable: <strong className="text-indigo-700 font-black">{formatCurrency(viewingInvoice.net_payable)}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD VENDOR */}
      {showAddVendorModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[2px]"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowAddVendorModal(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-slate-800 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-800">Add New Vendor</h3>
              </div>
              <button onClick={() => setShowAddVendorModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Vendor Name <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={vendorNameRef}
                  type="text"
                  placeholder="Vendor / Distributor ka naam..."
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      supplierPhoneRef.current?.focus();
                      supplierPhoneRef.current?.select();
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Supplier Delivery Phone <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  ref={supplierPhoneRef}
                  type="text"
                  placeholder="0300-1234567"
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      bookerNameRef.current?.focus();
                      bookerNameRef.current?.select();
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Booker Name <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    ref={bookerNameRef}
                    type="text"
                    placeholder="Kashif Bhai"
                    value={newBookerName}
                    onChange={(e) => setNewBookerName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        bookerPhoneRef.current?.focus();
                        bookerPhoneRef.current?.select();
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Booker Phone <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    ref={bookerPhoneRef}
                    type="text"
                    placeholder="0333-7654321"
                    value={newBookerPhone}
                    onChange={(e) => setNewBookerPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        supervisorPhoneRef.current?.focus();
                        supervisorPhoneRef.current?.select();
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Supervisor Phone <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    ref={supervisorPhoneRef}
                    type="text"
                    placeholder="0301-9988776"
                    value={newSupervisorPhone}
                    onChange={(e) => setNewSupervisorPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        managerPhoneRef.current?.focus();
                        managerPhoneRef.current?.select();
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Manager Phone <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    ref={managerPhoneRef}
                    type="text"
                    placeholder="0345-1122334"
                    value={newManagerPhone}
                    onChange={(e) => setNewManagerPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateVendor();
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddVendorModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateVendor}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-colors"
              >
                Save Vendor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}