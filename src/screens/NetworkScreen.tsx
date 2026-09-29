import { useState, useEffect } from 'react';
import {
  Network, Server, Monitor, ShieldCheck, Check, X, Bell, RefreshCw, Key
} from 'lucide-react';
import { getNetworkRole, replaceLocalTable, supabase } from '@/lib/supabase';
import {
  COUNTER_MODULES,
  COUNTER_PERMISSION_CACHE_KEY,
  COUNTER_PERMISSION_RECORD_ID,
  readCachedCounterPermissions,
  normalizeCounterPermissions,
} from '@/utils/counterPermissions';
import type { Page } from '@/components/Sidebar';

export function NetworkScreen() {
  const [deviceRole, setDeviceRole] = useState<'server' | 'counter'>(() => {
    return localStorage.getItem('pos_device_role') === 'counter' || getNetworkRole() === 'client' ? 'counter' : 'server';
  });
  const isMasterAdmin = localStorage.getItem('is_master_admin') === 'true';
  const isCounterDevice = deviceRole === 'counter' || getNetworkRole() === 'client';

  const [serverIP, setServerIP] = useState(() => localStorage.getItem('pos_server_ip') || '192.168.1.50');
  const [port, setPort] = useState(() => localStorage.getItem('pos_server_port') || '45455');
  const [accessRequests, setAccessRequests] = useState<any[]>([]);
  const [counterPermissions, setCounterPermissions] = useState(() => readCachedCounterPermissions());
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    fetchRequests();
    fetchCounterPermissions();
    const interval = setInterval(() => {
      fetchRequests();
      if (deviceRole === 'server') fetchCounterPermissions();
    }, 2000);
    return () => clearInterval(interval);
  }, [deviceRole]);

  async function fetchCounterPermissions() {
    try {
      const { data } = await supabase.from('counter_module_permissions').select('*').eq('id', COUNTER_PERMISSION_RECORD_ID).maybeSingle();
      if (data?.permissions) {
        const normalized = normalizeCounterPermissions(data.permissions);
        setCounterPermissions(normalized);
        localStorage.setItem(COUNTER_PERMISSION_CACHE_KEY, JSON.stringify(normalized));
      }
    } catch {}
  }

  async function fetchRequests() {
    const requests: any[] = [];
    const raw = localStorage.getItem('pending_access_request');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.status === 'pending') {
          requests.push(parsed);
        }
      } catch {}
    }
    if (deviceRole === 'server') {
      try {
        const { data } = await supabase.from('counter_access_requests').select('*').eq('status', 'pending');
        for (const request of data || []) {
          if (!requests.some((current) => current.id === request.id)) requests.push(request);
        }
      } catch {}
    }
    setAccessRequests(requests);
  }

  async function resolveRequest(req: any, status: 'approved' | 'rejected') {
    try {
      await supabase.from('counter_access_requests').update({ status }).eq('id', req.id);
    } catch {}
    const raw = localStorage.getItem('pending_access_request');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.id === req.id) {
          parsed.status = status;
          localStorage.setItem('pending_access_request', JSON.stringify(parsed));
        }
      } catch {}
    }
    setAccessRequests((current) => current.filter((request) => request.id !== req.id));
    showToast('ok', status === 'approved' ? `Access approved for ${req.cashier_name || 'Counter PC'}!` : 'Request rejected.');
  }

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  }

  function selectDeviceRole(role: 'server' | 'counter') {
    if (role === 'server' && isCounterDevice && !isMasterAdmin) {
      showToast('err', 'Only the authenticated Master Admin can switch this Counter PC to Main Server mode.');
      return;
    }
    setDeviceRole(role);
  }

  function saveNetworkConfig(e: React.FormEvent) {
    e.preventDefault();
    const savedRole = isCounterDevice && !isMasterAdmin ? 'counter' : deviceRole;
    localStorage.setItem('pos_device_role', savedRole);
    localStorage.setItem('pos_network_role', savedRole === 'counter' ? 'client' : 'server');
    localStorage.setItem('pos_server_ip', serverIP.trim());
    localStorage.setItem('pos_server_port', port.trim());
    window.dispatchEvent(new Event('pos-network-role-changed'));

    showToast('ok', 'Network & Machine configuration saved!');
  }

  async function saveCounterPermissions(next: Record<Page, boolean>) {
    setCounterPermissions(next);
    localStorage.setItem(COUNTER_PERMISSION_CACHE_KEY, JSON.stringify(next));
    setSavingPermissions(true);
    try {
      await replaceLocalTable('counter_module_permissions', [{
        id: COUNTER_PERMISSION_RECORD_ID,
        permissions: next,
        updated_at: new Date().toISOString(),
      }]);
      showToast('ok', 'Counter PC module access saved and synced over the local network.');
    } catch {
      showToast('err', 'Could not sync permissions. They are saved locally on this PC.');
    } finally {
      setSavingPermissions(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 select-none overflow-y-auto p-6 space-y-5">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Network className="h-6 w-6 text-indigo-600" />
            Sharing & Local Network Hub
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure LAN Server, Counter Clients, and manage access requests.
          </p>
        </div>
      </div>

      {toast && (
        <div className={`p-3.5 rounded-xl border text-xs font-bold ${
          toast.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Access Requests Box */}
      {accessRequests.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm mb-3">
            <Bell className="h-5 w-5 text-amber-600 animate-bounce" />
            <span>Pending Counter Access Requests ({accessRequests.length})</span>
          </div>

          <div className="space-y-2">
            {accessRequests.map((req) => (
              <div key={req.id} className="bg-white border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    User: <span className="text-indigo-600">{req.cashier_name}</span> is requesting access to{' '}
                    <span className="text-rose-600 font-black uppercase">
                      {COUNTER_MODULES.find((module) => module.page === (req.page || req.requested_page))?.label || req.page || req.requested_page}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">Time: {req.time} · 1-Time Permission</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => resolveRequest(req, 'rejected')}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveRequest(req, 'approved')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm"
                  >
                    Approve 1-Time Access
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Network Configuration Form */}
      <form onSubmit={saveNetworkConfig} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 max-w-2xl">
        <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">Device Role Selection</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            onClick={() => selectDeviceRole('server')}
            className={`p-4 rounded-xl border-2 flex items-start gap-3 ${
              isCounterDevice && !isMasterAdmin ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            } ${
              deviceRole === 'server' ? 'border-indigo-600 bg-indigo-50/20' : 'border-slate-200'
            }`}
          >
            <input type="radio" checked={deviceRole === 'server'} disabled={isCounterDevice && !isMasterAdmin} onChange={() => selectDeviceRole('server')} className="mt-1" />
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Server className="h-4 w-4 text-indigo-600" />
                Main Server PC
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Host database on this computer.</p>
            </div>
          </div>

          <div
            onClick={() => selectDeviceRole('counter')}
            className={`p-4 rounded-xl border-2 cursor-pointer flex items-start gap-3 ${
              deviceRole === 'counter' ? 'border-indigo-600 bg-indigo-50/20' : 'border-slate-200'
            }`}
          >
            <input type="radio" checked={deviceRole === 'counter'} onChange={() => selectDeviceRole('counter')} className="mt-1" />
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Monitor className="h-4 w-4 text-indigo-600" />
                Counter PC (Client)
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Connects to server via LAN cable.</p>
            </div>
          </div>
        </div>

        {deviceRole === 'counter' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Main Server IP Address</label>
              <input
                type="text"
                value={serverIP}
                onChange={(e) => setServerIP(e.target.value)}
                placeholder="192.168.1.50"
                className="w-full text-xs font-mono font-bold px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">LAN Port</label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="45455"
                className="w-full text-xs font-mono font-bold px-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          className="mt-3 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm cursor-pointer"
        >
          Save Network Configuration
        </button>
      </form>

      {deviceRole === 'server' && getNetworkRole() === 'server' && (
        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 max-w-2xl">
          <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
            <div className="grid place-items-center h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Counter PC Module Access Control</h2>
              <p className="text-[11px] text-slate-500 mt-1">Choose which screens Counter PCs can open. Changes are stored locally and synced over your LAN.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {COUNTER_MODULES.map(({ page, label }) => (
              <label key={page} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-3 cursor-pointer hover:bg-slate-50">
                <span className="text-xs font-semibold text-slate-700">{label}</span>
                <input
                  type="checkbox"
                  checked={counterPermissions[page]}
                  disabled={savingPermissions}
                  onChange={(event) => void saveCounterPermissions({ ...counterPermissions, [page]: event.target.checked })}
                  className="h-4 w-4 accent-indigo-600"
                />
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
