import { useState, useEffect } from 'react';
import { Pill, Lock, ShieldAlert, CheckCircle, Clock } from 'lucide-react';
import { Sidebar, MobileNav, type Page } from '@/components/Sidebar';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { PosScreen } from '@/screens/PosScreen';
import { InventoryScreen } from '@/screens/InventoryScreen';
import { DemandScreen } from '@/screens/DemandScreen';
import { ExpiryScreen } from '@/screens/ExpiryScreen';
import { SalesScreen } from '@/screens/SalesScreen';
import { CustomerHistoryScreen } from '@/screens/CustomerHistoryScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { FastMovingScreen } from '@/screens/FastMovingScreen';
import { ReturnScreen } from '@/screens/ReturnScreen';
import { PurchaseScreen } from '@/screens/PurchaseScreen';
import { NetworkScreen } from '@/screens/NetworkScreen';
import { LicenseModal } from './components/LicenseModal';
import { SplashScreen } from './components/SplashScreen';
import { checkCurrentLicense } from './utils/licenseManager';
import { supabase } from '@/lib/supabase';

function App() {
  const isDemoMode = __PHARMACY_DEMO_MODE__;
  const [isLicensed, setIsLicensed] = useState<boolean>(() => isDemoMode || checkCurrentLicense());
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [page, setPage] = useState<Page>('pos');
  const { settings, setSettings, loading } = useStoreSettings();

  // Permission Request Modal State for Counter PC
  const [blockedPage, setBlockedPage] = useState<Page | null>(null);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'pending' | 'approved' | 'rejected'>('idle');
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);

  const storeName = settings?.name || 'Pharmacy POS';

  // Check if current device is Counter PC
  function isCounterPC(): boolean {
    const role = localStorage.getItem('pos_device_role') || '';
    const user = localStorage.getItem('pos_active_user') || '';
    if (role.toLowerCase().includes('counter') || user.toLowerCase().includes('counter')) {
      return true;
    }
    return false;
  }

  // Handle Protected Navigation (Only lock Sales & Reports and Top Selling)
  function handleNavigate(targetPage: Page) {
    const isCounter = isCounterPC();
    const isRestricted = targetPage === 'sales' || targetPage === 'fast-moving';

    if (isCounter && isRestricted) {
      const grantedToken = sessionStorage.getItem(`one_time_access_${targetPage}`);
      if (grantedToken === 'granted') {
        sessionStorage.removeItem(`one_time_access_${targetPage}`); // One-time use
        setPage(targetPage);
        return;
      }

      setBlockedPage(targetPage);
      setRequestStatus('idle');
      return;
    }

    setPage(targetPage);
  }

  // Send Access Request to Main Server
  async function sendAccessRequest() {
    if (!blockedPage) return;
    setRequestStatus('pending');

    const cashierName = localStorage.getItem('pos_active_user') || 'Counter Man';
    const localReqId = `req_${Date.now()}`;
    const reqPayload = {
      id: localReqId,
      cashier_name: cashierName,
      requested_page: blockedPage,
      page: blockedPage,
      status: 'pending',
      time: new Date().toLocaleTimeString(),
      created_at: new Date().toISOString(),
    };

    setCurrentRequestId(localReqId);
    localStorage.setItem('pending_access_request', JSON.stringify(reqPayload));

    try {
      await supabase.from('counter_access_requests').insert([reqPayload]);
    } catch {}
  }

  // Listen for Approval from Main Server
  useEffect(() => {
    if (!currentRequestId || requestStatus !== 'pending') return;

    const interval = setInterval(async () => {
      // 1. Check LocalStorage fallback
      const localRaw = localStorage.getItem('pending_access_request');
      if (localRaw) {
        try {
          const parsed = JSON.parse(localRaw);
          if (parsed.id === currentRequestId && parsed.status === 'approved') {
            setRequestStatus('approved');
            sessionStorage.setItem(`one_time_access_${blockedPage}`, 'granted');
            localStorage.removeItem('pending_access_request');
            clearInterval(interval);
            setTimeout(() => {
              if (blockedPage) setPage(blockedPage);
              setBlockedPage(null);
              setRequestStatus('idle');
              setCurrentRequestId(null);
            }, 1200);
            return;
          } else if (parsed.id === currentRequestId && parsed.status === 'rejected') {
            setRequestStatus('rejected');
            clearInterval(interval);
            return;
          }
        } catch {}
      }

      // 2. Check Supabase
      try {
        const { data } = await supabase
          .from('counter_access_requests')
          .select('status')
          .eq('id', currentRequestId)
          .maybeSingle();

        if (data?.status === 'approved') {
          setRequestStatus('approved');
          sessionStorage.setItem(`one_time_access_${blockedPage}`, 'granted');
          clearInterval(interval);
          setTimeout(() => {
            if (blockedPage) setPage(blockedPage);
            setBlockedPage(null);
            setRequestStatus('idle');
            setCurrentRequestId(null);
          }, 1200);
        } else if (data?.status === 'rejected') {
          setRequestStatus('rejected');
          clearInterval(interval);
        }
      } catch {}
    }, 1500);

    return () => clearInterval(interval);
  }, [currentRequestId, requestStatus, blockedPage]);

  if (!isLicensed) {
    return <LicenseModal onActivate={() => setIsLicensed(true)} />;
  }

  if (showSplash) {
    return <SplashScreen onStart={() => setShowSplash(false)} />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100 text-slate-800 overflow-hidden">
      {isDemoMode && window.__PHARMACY_DEMO__ && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-3 py-2 text-center text-xs text-amber-900">
          Demo mode · changes are temporary and disappear when you close or refresh this page · expires{' '}
          {new Date(window.__PHARMACY_DEMO__.expiresAt).toLocaleString()}
        </div>
      )}

      <div className="flex flex-1 min-h-0 min-w-0">
        {/* Top Navigation Bar with Permission Guard */}
        <Sidebar page={page} onNavigate={handleNavigate} storeName={storeName} />

        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Mobile top bar */}
          <header className="md:hidden flex items-center gap-2 px-4 py-3 bg-slate-900 text-white shrink-0">
            <div className="grid place-items-center h-8 w-8 rounded-lg bg-emerald-500">
              <Pill className="h-5 w-5" />
            </div>
            <span className="font-semibold truncate">{storeName}</span>
          </header>

          <main className="flex-1 min-h-0 overflow-hidden pb-14 md:pb-0">
            {loading ? (
              <div className="h-full grid place-items-center text-slate-400 text-sm">
                Loading…
              </div>
            ) : page === 'pos' ? (
              <PosScreen settings={settings} />
            ) : page === 'returns' ? (
              <ReturnScreen settings={settings} />
            ) : page === 'purchases' ? (
              <PurchaseScreen settings={settings} />
            ) : page === 'inventory' ? (
              <InventoryScreen />
            ) : page === 'demand' ? (
              <DemandScreen />
            ) : page === 'expiry' ? (
              <ExpiryScreen />
            ) : page === 'customer-history' ? (
              <CustomerHistoryScreen settings={settings} onNavigate={handleNavigate} />
            ) : page === 'sales' ? (
              <SalesScreen settings={settings} />
            ) : page === 'fast-moving' ? (
              <FastMovingScreen />
            ) : page === 'network' ? (
              <NetworkScreen />
            ) : (
              <SettingsScreen settings={settings} setSettings={setSettings} />
            )}
          </main>
        </div>
      </div>

      <MobileNav page={page} onNavigate={handleNavigate} />

      {/* Permission Request Modal for Counter PC */}
      {blockedPage && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="mx-auto w-14 h-14 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl flex items-center justify-center">
              <Lock className="h-7 w-7" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-800">Permission Required</h3>
              <p className="text-xs text-slate-500 mt-1">
                Aap <strong>{blockedPage === 'sales' ? 'Sales & Reports' : 'Top Selling'}</strong> screen access kar rahe hain. Is screen ke liye Main Server se approval lazmi hai.
              </p>
            </div>

            {requestStatus === 'idle' && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBlockedPage(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={sendAccessRequest}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-colors"
                >
                  Request One-Time Access
                </button>
              </div>
            )}

            {requestStatus === 'pending' && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center justify-center gap-2 text-amber-800 font-bold text-xs">
                  <Clock className="h-4 w-4 animate-spin" />
                  <span>Main Server approval ka intezar hai...</span>
                </div>
                <p className="text-[11px] text-amber-600">
                  Main Server ke Sharing & Network module mein request chali gayi hai. Jaise hi approve hoga, screen khul jayegi.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRequestStatus('idle');
                    setBlockedPage(null);
                  }}
                  className="mt-2 text-xs text-slate-500 hover:underline font-semibold"
                >
                  Cancel Request
                </button>
              </div>
            )}

            {requestStatus === 'approved' && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center gap-2 text-emerald-800 font-bold text-xs">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <span>Access Approved! Redirecting...</span>
              </div>
            )}

            {requestStatus === 'rejected' && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                <div className="flex items-center justify-center gap-2 text-rose-800 font-bold text-xs">
                  <ShieldAlert className="h-5 w-5 text-rose-600" />
                  <span>Request Rejected by Main Server</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRequestStatus('idle');
                    setBlockedPage(null);
                  }}
                  className="px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-bold"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
