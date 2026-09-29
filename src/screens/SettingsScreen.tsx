import { useState, useEffect, type FormEvent } from 'react';
import { 
  Store, Save, CheckCircle2, AlertCircle, 
  Download, Upload, FileSpreadsheet, Key, Unlink
} from 'lucide-react';
import { getNetworkRole, isMainServerReachable, replaceLocalRecord, replaceLocalTable, supabase, type StoreSettings } from '@/lib/supabase';
import { getLicenseInfo, getMachineId } from '../utils/licenseManager';

const BACKUP_TABLES = [
  'medicines', 'sales', 'sale_items', 'returns', 'return_items',
  'purchases', 'purchase_items', 'suppliers', 'customer_history',
  'customer_ledger', 'store_settings', 'pos_users_list',
  'counter_module_permissions', 'counter_access_requests',
] as const;

const LOCAL_RECORD_KEYS = [
  'pos_purchases', 'pos_vendors', 'pos_batches', 'pos_customer_history',
  'pos_customer_ledger', 'pos_returns', 'pos_return_items', 'pos_purchase_items',
] as const;

function readLocalArray(key: string): any[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function downloadTextFile(contents: string, fileName: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsScreen({
  settings,
  setSettings,
  isMasterAdmin,
  onDeactivateLicense,
}: {
  settings: StoreSettings | null;
  setSettings: (s: StoreSettings | null) => void;
  isMasterAdmin?: boolean;
  onDeactivateLicense?: () => void;
}) {
  const [name, setName] = useState(settings?.name || '');
  const [phone, setPhone] = useState(settings?.phone || '');
  const [address, setAddress] = useState(settings?.address || '');
  const [receiptFooter, setReceiptFooter] = useState((settings as any)?.receipt_footer || '');

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const machineId = getMachineId();
  const licenseInfo = getLicenseInfo();
  const activeLicenseKey = localStorage.getItem('pos_license_key') || 'No license key saved on this device';
  const licenseBadgeText = licenseInfo.status === 'active'
    ? licenseInfo.isLifetime
      ? 'Lifetime License'
      : `Trial License - Expires: ${licenseInfo.expiry}`
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
      : `Trial License - Expires: ${licenseInfo.expiry}${licenseInfo.daysLeft === null ? '' : ` (${licenseInfo.daysLeft} days remaining)`}.`
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
      if (!(await isMainServerReachable())) throw new Error('Main Server is unavailable on the local network.');
      const [{ data: meds }, { data: supplierRows }] = await Promise.all([
        supabase.from('medicines').select('*'),
        supabase.from('suppliers').select('*'),
      ]);
      const vendors = supplierRows?.length ? supplierRows : readLocalArray('pos_vendors');
      const supplierById = new Map<string, any>();
      for (const supplier of vendors || []) {
        if (supplier.id !== undefined) supplierById.set(String(supplier.id), supplier);
        if (supplier.company_name) supplierById.set(String(supplier.company_name).toLowerCase(), supplier);
        if (supplier.name) supplierById.set(String(supplier.name).toLowerCase(), supplier);
      }

      const columns = [
        'Medicine ID', 'Name', 'Category', 'Batch No', 'Expiry Date', 'Purchase/Cost Price',
        'Sale Price', 'Strip Sale Price', 'Tablet Sale Price', 'Stock Quantity',
        'Strips per Box', 'Tablets per Strip', 'Supplier Name', 'Supplier Phone',
        'Booker Name', 'Booker Phone', 'Manager Phone', 'Supervisor Phone',
      ];
      const escapeCell = (value: unknown) => {
        let text = value === null || value === undefined ? '' : String(value);
        if (typeof value === 'string' && /^[=+@\-\t\r]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      const rows = (meds || []).map((medicine: any) => {
        const supplier = supplierById.get(String(medicine.supplier_id ?? medicine.vendor_id ?? ''))
          || supplierById.get(String(medicine.supplier_name ?? medicine.supplier ?? '').toLowerCase())
          || {};
        return [
          medicine.id, medicine.name, medicine.category, medicine.batch_no, medicine.expiry_date,
          medicine.purchase_price ?? medicine.cost_price, medicine.sale_price,
          medicine.strip_sale_price, medicine.tablet_sale_price, medicine.stock_quantity,
          medicine.strips_per_box, medicine.tablets_per_strip,
          medicine.supplier_name || medicine.supplier || supplier.company_name || supplier.name,
          medicine.supplier_phone || supplier.supplier_phone || supplier.phone,
          medicine.booker_name || supplier.booker_name, medicine.booker_phone || supplier.booker_phone,
          medicine.manager_phone || supplier.manager_phone, medicine.supervisor_phone || supplier.supervisor_phone,
        ];
      });
      const csvContent = '\uFEFF' + [columns, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
      downloadTextFile(csvContent, `pharmacy_inventory_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
      showToast('ok', 'Inventory exported successfully!');
    } catch {
      showToast('err', 'Export failed');
    }
  }

  async function handleBackup() {
    try {
      if (!(await isMainServerReachable())) throw new Error('Main Server is unavailable on the local network.');
      const tableResults = await Promise.all(BACKUP_TABLES.map(async (table) => {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw new Error(`Could not read ${table} for backup.`);
        return [table, data || []] as const;
      }));
      const tables = Object.fromEntries(tableResults) as Record<string, any[]>;
      const localData = Object.fromEntries(LOCAL_RECORD_KEYS.map((key) => [key, readLocalArray(key)]));

      if (!tables.purchases.length) tables.purchases = localData.pos_purchases;
      if (!tables.suppliers.length) tables.suppliers = localData.pos_vendors;
      if (!tables.purchase_items.length) {
        tables.purchase_items = tables.purchases.flatMap((purchase: any) =>
          Array.isArray(purchase.items) ? purchase.items.map((item: any) => ({ ...item, purchase_id: purchase.id })) : [],
        );
      }
      if (!tables.returns.length) {
        tables.returns = tables.sales.filter((sale: any) => sale.payment_type === 'Refund' || Number(sale.net_payable) < 0);
      }
      const returnIds = new Set(tables.returns.map((record: any) => record.id));
      if (!tables.return_items.length) tables.return_items = tables.sale_items.filter((item: any) => returnIds.has(item.sale_id));
      if (!tables.customer_history.length) tables.customer_history = localData.pos_customer_history;
      if (!tables.customer_ledger.length) tables.customer_ledger = localData.pos_customer_ledger;

      // Sales queries include joined sale_items for display; store the normalized tables once.
      tables.sales = tables.sales.map((sale: any) => {
        const normalizedSale = { ...sale };
        delete normalizedSale.sale_items;
        return normalizedSale;
      });
      const backupData = {
        format: 'pharmacy-pos-offline-backup',
        schema_version: 2,
        timestamp: new Date().toISOString(),
        tables,
        localData,
      };
      downloadTextFile(JSON.stringify(backupData, null, 2), `pharmacy_backup_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
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
          const backupTables = parsed?.tables && typeof parsed.tables === 'object' ? parsed.tables : parsed;
          if (!backupTables || typeof backupTables !== 'object' || Array.isArray(backupTables)) throw new Error('This is not a pharmacy backup.');
          const hasKnownTable = BACKUP_TABLES.some((table) => Array.isArray(backupTables[table])) || Array.isArray(parsed.medicines);
          if (!hasKnownTable) throw new Error('This backup does not contain recognized pharmacy tables.');
          const isUniversalBackup = parsed.schema_version >= 2 || parsed.format === 'pharmacy-pos-offline-backup';
          if (isUniversalBackup && BACKUP_TABLES.some((table) => !Array.isArray(backupTables[table]))) {
            throw new Error('A universal backup is missing one or more tables.');
          }
          if (parsed.localData && typeof parsed.localData === 'object' &&
            LOCAL_RECORD_KEYS.some((key) => parsed.localData[key] !== undefined && !Array.isArray(parsed.localData[key]))) {
            throw new Error('The backup contains an invalid local records section.');
          }

          const tablesToRestore: Record<string, any[]> = {};
          for (const table of BACKUP_TABLES) {
            if (Array.isArray(backupTables[table])) tablesToRestore[table] = backupTables[table];
            else if (isUniversalBackup) tablesToRestore[table] = [];
          }
          // Support the first-generation backup shape.
          if (!Array.isArray(tablesToRestore.store_settings) && parsed.store && typeof parsed.store === 'object') {
            tablesToRestore.store_settings = [parsed.store];
          }
          if (!Array.isArray(tablesToRestore.medicines) && Array.isArray(parsed.medicines)) tablesToRestore.medicines = parsed.medicines;
          if (!Array.isArray(tablesToRestore.sales) && Array.isArray(parsed.sales)) tablesToRestore.sales = parsed.sales;
          if (!Array.isArray(tablesToRestore.sale_items) && Array.isArray(parsed.sale_items)) tablesToRestore.sale_items = parsed.sale_items;

          const counts = Object.entries(tablesToRestore).map(([table, rows]) => `${table}: ${rows.length}`).join('\n');
          if (!window.confirm(`This will replace the backed-up local business records with the selected backup.\n\n${counts}\n\nContinue?`)) return;

          for (const table of BACKUP_TABLES) {
            if (tablesToRestore[table]) {
              const rows = table === 'pos_users_list' && tablesToRestore[table].length === 0
                ? [{ id: '__empty_user_list__', name: '', created_at: new Date().toISOString() }]
                : tablesToRestore[table];
              await replaceLocalTable(table, rows);
            }
          }

          const localData = parsed.localData && typeof parsed.localData === 'object' ? parsed.localData : {};
          for (const key of LOCAL_RECORD_KEYS) {
            const localRows = Array.isArray(localData[key]) ? localData[key] : undefined;
            let rows = localRows;
            if (!rows?.length && key === 'pos_purchases' && Array.isArray(tablesToRestore.purchases)) rows = tablesToRestore.purchases;
            if (!rows?.length && key === 'pos_vendors' && Array.isArray(tablesToRestore.suppliers)) rows = tablesToRestore.suppliers;
            if (rows) await replaceLocalRecord(key, rows);
          }

          if (tablesToRestore.pos_users_list) localStorage.setItem('pos_users_list', JSON.stringify(tablesToRestore.pos_users_list));
          if (tablesToRestore.counter_module_permissions?.[0]?.permissions) {
            localStorage.setItem('pos_counter_module_access', JSON.stringify(tablesToRestore.counter_module_permissions[0].permissions));
          }
          const restoredSettings = tablesToRestore.store_settings?.[0] || null;
          setSettings(restoredSettings as StoreSettings | null);
          window.dispatchEvent(new CustomEvent('pos-database-restored'));
          showToast('ok', 'All backup tables were restored to local storage.');
        } catch {
          showToast('err', 'Restore failed. Check that this is a valid backup and the local/LAN storage is available.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async function deactivateLicense() {
    if (!window.confirm('Deactivate this machine’s license and return to the activation screen?')) return;
    localStorage.removeItem('pos_license_key');
    if (getNetworkRole() === 'server') {
      try {
        const raw = localStorage.getItem('pos_db_store_settings');
        const rows = raw ? JSON.parse(raw) : [];
        if (Array.isArray(rows)) {
          localStorage.setItem('pos_db_store_settings', JSON.stringify(rows.map((row: any) => {
            const { license_key: _licenseKey, activation_key: _activationKey, ...safeRow } = row;
            return safeRow;
          })));
        }
      } catch {}
    }
    onDeactivateLicense?.();
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
            <span>Excel / CSV Export</span>
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

        {(isMasterAdmin ?? localStorage.getItem('is_master_admin') === 'true') && (
          <button
            type="button"
            onClick={deactivateLicense}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-100"
          >
            <Unlink className="h-4 w-4" />
            Deactivate License / Unlink Machine
          </button>
        )}
      </div>
    </div>
  );
}
