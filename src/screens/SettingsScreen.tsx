import { useState, useEffect, type FormEvent } from 'react';
import { 
  Store, Save, CheckCircle2, AlertCircle, 
  Download, Upload, FileSpreadsheet, Key
} from 'lucide-react';
import { supabase, type StoreSettings } from '@/lib/supabase';
import { getLicenseInfo, getMachineId } from '../utils/licenseManager';

export function SettingsScreen({
  settings,
  setSettings,
}: {
  settings: StoreSettings | null;
  setSettings: (s: StoreSettings | null) => void;
}) {
  const [name, setName] = useState(settings?.name || '');
  const [phone, setPhone] = useState(settings?.phone || '');
  const [address, setAddress] = useState(settings?.address || '');
  const [receiptFooter, setReceiptFooter] = useState((settings as any)?.receipt_footer || '');

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const machineId = getMachineId();
  const licenseInfo = getLicenseInfo();
  const activeLicenseKey = localStorage.getItem('pos_license_key') ||
    (settings as any)?.license_key ||
    'No license key saved on this device';
  const licenseBadgeText = licenseInfo.status === 'active'
    ? licenseInfo.isLifetime
      ? 'Lifetime License'
      : licenseInfo.daysLeft === 0
        ? 'Expires today'
        : `${licenseInfo.daysLeft} days remaining`
    : licenseInfo.status === 'expired'
      ? 'Expired'
      : licenseInfo.status === 'invalid'
        ? 'Invalid License'
        : 'No License';
  const licenseBadgeClass = licenseInfo.status === 'active'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : licenseInfo.status === 'expired'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-red-50 text-red-700 border-red-200';
  const licenseDescription = licenseInfo.status === 'active'
    ? licenseInfo.isLifetime
      ? 'This device has a lifetime license.'
      : `Valid through ${licenseInfo.expiry}.`
    : licenseInfo.status === 'expired'
      ? `This license expired on ${licenseInfo.expiry}.`
      : licenseInfo.status === 'invalid'
        ? 'The saved license is invalid or belongs to another machine.'
        : 'No activation key is saved on this device.';

  useEffect(() => {
    if (settings) {
      setName(settings.name || '');
      setPhone(settings.phone || '');
      setAddress(settings.address || '');
      setReceiptFooter((settings as any)?.receipt_footer || '');
    }
  }, [settings]);

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload: any = {
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      receipt_footer: receiptFooter.trim(),
      updated_at: new Date().toISOString(),
    };

    if (settings?.id) {
      const { data, error } = await supabase
        .from('store_settings')
        .update(payload)
        .eq('id', settings.id)
        .select()
        .single();

      if (error) {
        showToast('err', 'Failed to save settings');
      } else {
        setSettings(data);
        showToast('ok', 'Store settings updated successfully!');
      }
    } else {
      const { data, error } = await supabase
        .from('store_settings')
        .insert([payload])
        .select()
        .single();

      if (error) {
        showToast('err', 'Failed to create settings');
      } else {
        setSettings(data);
        showToast('ok', 'Store settings created successfully!');
      }
    }
    setSaving(false);
  }

  // Backup & Export Handlers
  async function exportToExcel() {
    try {
      const { data: meds } = await supabase.from('medicines').select('*');
      if (!meds || meds.length === 0) {
        showToast('err', 'No medicine records to export');
        return;
      }
      const csvContent = 'data:text/csv;charset=utf-8,' + 
        ['Name,Sale Price,Cost Price,Stock Quantity,Category,Batch No,Expiry Date']
          .concat(meds.map((m: any) => `"${m.name}",${m.sale_price},${m.cost_price},${m.stock_quantity},"${m.category || ''}","${m.batch_no || ''}","${m.expiry_date || ''}"`))
          .join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `pharmacy_inventory_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('ok', 'Inventory exported successfully!');
    } catch {
      showToast('err', 'Export failed');
    }
  }

  async function handleBackup() {
    try {
      const [{ data: meds }, { data: sls }, { data: items }] = await Promise.all([
        supabase.from('medicines').select('*'),
        supabase.from('sales').select('*'),
        supabase.from('sale_items').select('*'),
      ]);
      const backupData = {
        timestamp: new Date().toISOString(),
        store: settings,
        medicines: meds || [],
        sales: sls || [],
        sale_items: items || [],
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pharmacy_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('ok', 'Database backup downloaded safely!');
    } catch {
      showToast('err', 'Backup creation failed');
    }
  }

  function handleRestoreClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const parsed = JSON.parse(evt.target?.result as string);
          if (parsed && Array.isArray(parsed.medicines)) {
            if (window.confirm(`Restore will import ${parsed.medicines.length} medicines. Continue?`)) {
              showToast('ok', 'Backup data parsed successfully!');
            }
          }
        } catch {
          showToast('err', 'Invalid backup file format');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 select-none overflow-y-auto p-6 space-y-5">
      {/* Top Header with Action Buttons */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Store className="h-6 w-6 text-emerald-600" />
            Store Settings
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Receipt branding, address, phone & database backup controls.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Excel Export</span>
          </button>

          <button
            type="button"
            onClick={handleBackup}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs"
          >
            <Download className="h-4 w-4" />
            <span>Backup Data</span>
          </button>

          <button
            type="button"
            onClick={handleRestoreClick}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs"
          >
            <Upload className="h-4 w-4" />
            <span>Restore Backup</span>
          </button>
        </div>
      </div>

      {toast && (
        <div className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-bold ${
          toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          {toast.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSaveSettings} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2">
          Receipt Branding & Pharmacy Details
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Store / Pharmacy Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="bin shams medicos"
              required
              className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0300-1234567"
              className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Store Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Shop # 1, Main Road, Karachi"
            className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Receipt Footer Note</label>
          <input
            type="text"
            value={receiptFooter}
            onChange={(e) => setReceiptFooter(e.target.value)}
            placeholder="Thank you for your visit! Medicines once sold can be returned within 3 days."
            className="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? 'Saving...' : 'Save All Settings'}</span>
        </button>
      </form>

      {/* Software License & Machine ID Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="grid place-items-center h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600">
              <Key className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800">Software License</h3>
              <p className="text-[11px] text-slate-400">{licenseDescription}</p>
            </div>
          </div>
          <span className={`px-2.5 py-1 border rounded-full text-[10px] font-bold ${licenseBadgeClass}`}>
            {licenseBadgeText}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-500 font-medium mb-1">This Machine ID</label>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700 text-xs select-all">
              {machineId}
            </div>
          </div>

          <div>
            <label className="block text-slate-500 font-medium mb-1">Active License Key</label>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-indigo-700 font-bold text-xs select-all">
              {activeLicenseKey}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
