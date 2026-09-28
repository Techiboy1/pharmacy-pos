import { useState, useEffect } from 'react';
import { 
  Network, Server, Monitor, ShieldCheck, Check, X, Bell, RefreshCw, Key
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function NetworkScreen() {
  const [deviceRole, setDeviceRole] = useState<'server' | 'counter'>(() => {
    return (localStorage.getItem('pos_device_role') as 'server' | 'counter') || 'server';
  });

  const [serverIP, setServerIP] = useState(() => localStorage.getItem('pos_server_ip') || '192.168.1.50');
  const [port, setPort] = useState(() => localStorage.getItem('pos_server_port') || '45455');
  const [accessRequests, setAccessRequests] = useState<any[]>([]);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 2000);
    return () => clearInterval(interval);
  }, []);

  async function fetchRequests() {
    const raw = localStorage.getItem('pending_access_request');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.status === 'pending') {
          setAccessRequests([parsed]);
          return;
        }
      } catch {}
    }
    setAccessRequests([]);
  }

  function handleApprove(req: any) {
    const raw = localStorage.getItem('pending_access_request');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        parsed.status = 'approved';
        localStorage.setItem('pending_access_request', JSON.stringify(parsed));
      } catch {}
    }
    setAccessRequests([]);
    showToast('ok', `Access approved for ${req.cashier_name || 'Counter PC'}!`);
  }

  function handleReject(req: any) {
    const raw = localStorage.getItem('pending_access_request');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        parsed.status = 'rejected';
        localStorage.setItem('pending_access_request', JSON.stringify(parsed));
      } catch {}
    }
    setAccessRequests([]);
    showToast('ok', 'Request rejected.');
  }

  function showToast(kind: 'ok' | 'err', msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  }

  function saveNetworkConfig(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem('pos_device_role', deviceRole);
    localStorage.setItem('pos_server_ip', serverIP.trim());
    localStorage.setItem('pos_server_port', port.trim());
    
    if (deviceRole === 'counter') {
      localStorage.setItem('pos_active_user', 'counter man');
    } else {
      localStorage.setItem('pos_active_user', 'TECHI');
    }

    showToast('ok', 'Network & Machine configuration saved!');
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
                      {req.page === 'sales' ? 'Sales & Reports' : 'Top Selling'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">Time: {req.time} · 1-Time Permission</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleReject(req)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(req)}
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
            onClick={() => setDeviceRole('server')}
            className={`p-4 rounded-xl border-2 cursor-pointer flex items-start gap-3 ${
              deviceRole === 'server' ? 'border-indigo-600 bg-indigo-50/20' : 'border-slate-200'
            }`}
          >
            <input type="radio" checked={deviceRole === 'server'} onChange={() => setDeviceRole('server')} className="mt-1" />
            <div>
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Server className="h-4 w-4 text-indigo-600" />
                Main Server PC
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Host database on this computer.</p>
            </div>
          </div>

          <div
            onClick={() => setDeviceRole('counter')}
            className={`p-4 rounded-xl border-2 cursor-pointer flex items-start gap-3 ${
              deviceRole === 'counter' ? 'border-indigo-600 bg-indigo-50/20' : 'border-slate-200'
            }`}
          >
            <input type="radio" checked={deviceRole === 'counter'} onChange={() => setDeviceRole('counter')} className="mt-1" />
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
    </div>
  );
}