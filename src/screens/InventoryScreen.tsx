import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, X, AlertTriangle, PackageX } from 'lucide-react';
import { supabase, type Medicine } from '@/lib/supabase';
import {
  formatCurrency,
  formatDate,
  isExpired,
} from '@/lib/utils';

type ItemCategory = 'tablet' | 'injection' | 'syrup' | 'cream' | 'general';

type FormState = {
  id?: string;
  category: ItemCategory;
  name: string;
  batch_no: string;
  expiry_date: string;
  purchase_price: string;
  sale_price: string;
  stock_quantity: string;
  min_stock_alert: string;
  expiry_alert_months: string;
  strips_per_box: string;
  tablets_per_strip: string;
  strip_sale_price: string;
  tablet_sale_price: string;
};

const EMPTY: FormState = {
  category: 'tablet',
  name: '',
  batch_no: 'N/A',
  expiry_date: '',
  purchase_price: '0',
  sale_price: '',
  stock_quantity: '',
  min_stock_alert: '5',
  expiry_alert_months: '3',
  strips_per_box: '1',
  tablets_per_strip: '10',
  strip_sale_price: '',
  tablet_sale_price: '',
};

export function InventoryScreen() {
  const [meds, setMeds] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Medicine | null>(null);

  useEffect(() => {
    fetchMeds();
  }, []);

  async function fetchMeds() {
    setLoading(true);
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .order('name', { ascending: true });
    if (error) {
      setError('Failed to load inventory');
    } else {
      setMeds((data as Medicine[]) || []);
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return meds;
    const q = query.trim().toLowerCase();
    return meds.filter((m) => m.name.toLowerCase().includes(q));
  }, [meds, query]);

  function openAdd() {
    setForm(EMPTY);
    setShowForm(true);
    setTimeout(() => {
      document.getElementById('inv-cat')?.focus();
    }, 100);
  }

  function openEdit(m: Medicine) {
    const med = m as any;
    let cat: ItemCategory = 'tablet';
    if (med.strips_per_box === 1 && med.tablets_per_strip > 1) {
      cat = 'injection';
    } else if (med.strips_per_box === 1 && med.tablets_per_strip === 1) {
      cat = 'general';
    }

    setForm({
      id: med.id,
      category: cat,
      name: med.name,
      batch_no: med.batch_no || 'N/A',
      expiry_date: med.expiry_date,
      purchase_price: String(med.purchase_price ?? '0'),
      sale_price: String(med.sale_price ?? ''),
      stock_quantity: String(med.stock_quantity ?? ''),
      min_stock_alert: String(med.min_stock_alert ?? '5'),
      expiry_alert_months: String(med.expiry_alert_months ?? '3'),
      strips_per_box: String(med.strips_per_box ?? 1),
      tablets_per_strip: String(med.tablets_per_strip ?? 1),
      strip_sale_price: String(med.strip_sale_price ?? ''),
      tablet_sale_price: String(med.tablet_sale_price ?? ''),
    });
    setShowForm(true);
    setTimeout(() => {
      document.getElementById('inv-name')?.focus();
    }, 100);
  }

  function handleCategoryChange(newCat: ItemCategory) {
    let updated: FormState = { ...form, category: newCat };
    if (newCat === 'tablet') {
      updated.strips_per_box = form.strips_per_box === '1' ? '10' : form.strips_per_box;
      updated.tablets_per_strip = form.tablets_per_strip === '1' ? '10' : form.tablets_per_strip;
    } else if (newCat === 'injection') {
      updated.strips_per_box = '1';
      updated.tablets_per_strip = form.tablets_per_strip === '1' ? '5' : form.tablets_per_strip;
    } else {
      updated.strips_per_box = '1';
      updated.tablets_per_strip = '1';
      updated.strip_sale_price = updated.sale_price;
      updated.tablet_sale_price = updated.sale_price;
    }
    setForm(autoUnitPrices(updated));
  }

  function autoUnitPrices(next: FormState): FormState {
    const box = Number(next.sale_price) || 0;
    const spb = Number(next.strips_per_box) || 1;
    const tps = Number(next.tablets_per_strip) || 1;

    if (next.category === 'tablet') {
      const strip = box > 0 && spb > 0 ? box / spb : 0;
      const tablet = box > 0 && spb > 0 && tps > 0 ? box / (spb * tps) : 0;
      return {
        ...next,
        strip_sale_price: strip ? strip.toFixed(2) : next.strip_sale_price,
        tablet_sale_price: tablet ? tablet.toFixed(2) : next.tablet_sale_price,
      };
    } else if (next.category === 'injection') {
      const singlePrice = box > 0 && tps > 0 ? box / tps : 0;
      return {
        ...next,
        strip_sale_price: box > 0 ? box.toFixed(2) : next.strip_sale_price,
        tablet_sale_price: singlePrice ? singlePrice.toFixed(2) : next.tablet_sale_price,
      };
    } else {
      return {
        ...next,
        strip_sale_price: box > 0 ? box.toFixed(2) : '',
        tablet_sale_price: box > 0 ? box.toFixed(2) : '',
      };
    }
  }

  function handleEnterNext(e: React.KeyboardEvent, nextId: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const el = document.getElementById(nextId);
      if (el) {
        el.focus();
        if ('select' in el && typeof (el as any).select === 'function') {
          (el as any).select();
        }
      }
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name || !form.expiry_date) {
      setError('Item name aur expiry date lazmi hain');
      return;
    }
    setSaving(true);

    const isSimpleItem = ['syrup', 'cream', 'general'].includes(form.category);
    const spb = isSimpleItem ? 1 : form.category === 'injection' ? 1 : (Number(form.strips_per_box) || 1);
    const tps = isSimpleItem ? 1 : (Number(form.tablets_per_strip) || 1);
    const salePrice = Number(form.sale_price) || 0;

    const payload = {
      name: form.name.trim(),
      batch_no: form.batch_no.trim() || 'N/A',
      expiry_date: form.expiry_date,
      purchase_price: 0,
      sale_price: salePrice,
      stock_quantity: Number(form.stock_quantity) || 0,
      min_stock_alert: Number(form.min_stock_alert) || 5,
      expiry_alert_months: Number(form.expiry_alert_months) || 3,
      strips_per_box: spb,
      tablets_per_strip: tps,
      strip_sale_price: isSimpleItem ? salePrice : (Number(form.strip_sale_price) || 0),
      tablet_sale_price: isSimpleItem ? salePrice : (Number(form.tablet_sale_price) || 0),
    };

    let hasError = false;
    if (form.id) {
      const { error: updateErr } = await supabase.from('medicines').update(payload).eq('id', form.id);
      if (updateErr) {
        setError('Failed to update item');
        hasError = true;
      }
    } else {
      const { error: insertErr } = await supabase.from('medicines').insert(payload);
      if (insertErr) {
        setError('Failed to add item');
        hasError = true;
      }
    }
    setSaving(false);
    if (!hasError) {
      setShowForm(false);
      fetchMeds();
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    const { error } = await supabase.from('medicines').delete().eq('id', confirmDelete.id);
    setConfirmDelete(null);
    if (error) {
      setError('Failed to delete item');
    } else {
      fetchMeds();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Inventory Management</h1>
          <p className="text-sm text-slate-500">{meds.length} items in catalog</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Add Item
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-50">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm bg-red-50 text-red-800 border border-red-200">
            <AlertTriangle className="h-4 w-4" /> {error}
            <button className="ml-auto" onClick={() => setError(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="relative mb-4 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search item name…"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">Loading inventory…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-16 text-center text-slate-400 text-sm">
            {query ? 'No items match your search.' : 'No items yet. Add your first item.'}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Expiry</th>
                    <th className="text-right px-4 py-3">Sale Price</th>
                    <th className="text-center px-4 py-3">Stock Units</th>
                    <th className="text-center px-4 py-3">Alert Limit</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((m) => {
                    const exp = isExpired(m as any);

                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{m.name}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(m.expiry_date)}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">
                          {formatCurrency(Number(m.sale_price))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold text-slate-800">
                            {m.stock_quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-slate-500 font-medium">
                          {(m as any).min_stock_alert || 5}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-center gap-1">
                            {exp ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                <PackageX className="h-3 w-3" /> Expired
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                In Stock
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => openEdit(m)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(m)}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded ml-1 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
              <h2 className="font-semibold text-slate-800">
                {form.id ? 'Edit Item' : 'Add Item'}
              </h2>
              <button onClick={() => setShowForm(false)} className="cursor-pointer">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={save} className="p-5 space-y-4">
              <Field label="Item Category / Form">
                <select
                  id="inv-cat"
                  value={form.category}
                  onChange={(e) => handleCategoryChange(e.target.value as ItemCategory)}
                  onKeyDown={(e) => handleEnterNext(e, 'inv-name')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="tablet">Tablets / Capsules</option>
                  <option value="injection">Injections / Syringes / Ampoules</option>
                  <option value="syrup">Syrup / Suspension / Liquids</option>
                  <option value="cream">Cream / Ointment / Drops</option>
                  <option value="general">General Items (Pampers, Toothbrush, etc.)</option>
                </select>
              </Field>

              <Field label="Item Name">
                <input
                  id="inv-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => handleEnterNext(e, 'inv-expiry')}
                  placeholder="e.g. Panadol 500mg"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </Field>

              {/* Expiry Date Full Width */}
              <Field label="Expiry Date">
                <input
                  id="inv-expiry"
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                  onKeyDown={(e) => handleEnterNext(e, 'inv-sale')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </Field>

              {/* Box Sale Price Full Width (Box Purchase Price Removed) */}
              <Field label={form.category === 'general' || form.category === 'syrup' || form.category === 'cream' ? 'Sale Price (per piece)' : 'Box Sale Price'}>
                <input
                  id="inv-sale"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.sale_price}
                  onChange={(e) => setForm(autoUnitPrices({ ...form, sale_price: e.target.value }))}
                  onKeyDown={(e) => {
                    if (form.category === 'tablet') {
                      handleEnterNext(e, 'inv-spb');
                    } else if (form.category === 'injection') {
                      handleEnterNext(e, 'inv-inj-pcs');
                    } else {
                      handleEnterNext(e, 'inv-stock');
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </Field>

              {form.category === 'tablet' && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Unit Conversion (Tablets / Capsules)
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Strips per Box">
                      <input
                        id="inv-spb"
                        type="number"
                        min="1"
                        value={form.strips_per_box}
                        onChange={(e) => setForm(autoUnitPrices({ ...form, strips_per_box: e.target.value }))}
                        onKeyDown={(e) => handleEnterNext(e, 'inv-tps')}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </Field>
                    <Field label="Tablets per Strip">
                      <input
                        id="inv-tps"
                        type="number"
                        min="1"
                        value={form.tablets_per_strip}
                        onChange={(e) => setForm(autoUnitPrices({ ...form, tablets_per_strip: e.target.value }))}
                        onKeyDown={(e) => handleEnterNext(e, 'inv-strip-price')}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Strip Sale Price (auto)">
                      <input
                        id="inv-strip-price"
                        type="number"
                        step="0.01"
                        value={form.strip_sale_price}
                        onChange={(e) => setForm({ ...form, strip_sale_price: e.target.value })}
                        onKeyDown={(e) => handleEnterNext(e, 'inv-tab-price')}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </Field>
                    <Field label="Tablet Sale Price (auto)">
                      <input
                        id="inv-tab-price"
                        type="number"
                        step="0.01"
                        value={form.tablet_sale_price}
                        onChange={(e) => setForm({ ...form, tablet_sale_price: e.target.value })}
                        onKeyDown={(e) => handleEnterNext(e, 'inv-stock')}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </Field>
                  </div>
                </div>
              )}

              {form.category === 'injection' && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Unit Conversion (Injections / Ampoules)
                  </div>
                  <Field label="Pieces / Ampoules in 1 Box">
                    <input
                      id="inv-inj-pcs"
                      type="number"
                      min="1"
                      placeholder="e.g. 5 or 10"
                      value={form.tablets_per_strip}
                      onChange={(e) => setForm(autoUnitPrices({ ...form, tablets_per_strip: e.target.value }))}
                      onKeyDown={(e) => handleEnterNext(e, 'inv-inj-price')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </Field>
                  <Field label="Single Piece / Ampoule Sale Price (auto)">
                    <input
                      id="inv-inj-price"
                      type="number"
                      step="0.01"
                      value={form.tablet_sale_price}
                      onChange={(e) => setForm({ ...form, tablet_sale_price: e.target.value })}
                      onKeyDown={(e) => handleEnterNext(e, 'inv-stock')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </Field>
                </div>
              )}

              <Field
                label={
                  form.category === 'tablet'
                    ? 'Total Stock (Loose Tabs)'
                    : form.category === 'injection'
                    ? 'Total Stock (Ampoules)'
                    : form.category === 'syrup'
                    ? 'Total Stock (Bottles)'
                    : 'Total Stock (Pieces)'
                }
              >
                <input
                  id="inv-stock"
                  type="number"
                  placeholder="e.g. 100"
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                  onKeyDown={(e) => handleEnterNext(e, 'inv-alert')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Demand Alert (Min Qty)">
                  <input
                    id="inv-alert"
                    type="number"
                    min="1"
                    placeholder="e.g. 5"
                    value={form.min_stock_alert}
                    onChange={(e) => setForm({ ...form, min_stock_alert: e.target.value })}
                    onKeyDown={(e) => handleEnterNext(e, 'inv-expiry-alert')}
                    className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-amber-50/40 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </Field>
                <Field label="Expiry Alert (Months)">
                  <input
                    id="inv-expiry-alert"
                    type="number"
                    min="1"
                    max="24"
                    placeholder="e.g. 3"
                    value={form.expiry_alert_months}
                    onChange={(e) => setForm({ ...form, expiry_alert_months: e.target.value })}
                    onKeyDown={(e) => handleEnterNext(e, 'inv-save-btn')}
                    className="w-full px-3 py-2 border border-rose-300 rounded-lg text-sm bg-rose-50/40 font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </Field>
              </div>

              {error && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> {error}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="inv-save-btn"
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:bg-slate-300 focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500 cursor-pointer"
                >
                  {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <div className="flex items-start gap-3">
              <div className="grid place-items-center h-10 w-10 rounded-full bg-red-100 text-red-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Delete item?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  "{confirmDelete.name}" will be removed. Past sales records are kept.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={doDelete}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}