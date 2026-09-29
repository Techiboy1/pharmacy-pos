import React, { useState, useEffect, useRef } from 'react';
import { 
  ShoppingCart, Package, BarChart3, Settings as SettingsIcon, 
  Pill, Boxes, CalendarX, Lock, ShieldAlert, Loader2, X, Flame,
  LayoutGrid, ChevronDown, User, LogOut, UserCheck, RotateCcw, Truck, Users, Network, Trash2
} from 'lucide-react';
import { getNetworkRole, getServerIP, replaceLocalTable, supabase } from '@/lib/supabase';
import { isAdminPinConfigured, saveAdminPinCredential, verifyAdminPin } from '@/utils/adminAccess';
import { isCounterModuleRestricted, readCachedCounterPermissions, type CounterPermissions } from '@/utils/counterPermissions';
import { createUserPasswordCredential, verifyUserPassword, type PosUserRecord } from '@/utils/userAccounts';

export type Page = 
  | 'pos' 
  | 'inventory' 
  | 'demand' 
  | 'expiry' 
  | 'sales' 
  | 'customer-history' 
  | 'settings' 
  | 'fast-moving' 
  | 'returns' 
  | 'purchases'
  | 'network';

export const NAV_ITEMS: { id: Page; label: string; icon: any; desc: string }[] = [
  { id: 'pos', label: 'Fast Billing', icon: ShoppingCart, desc: 'Counter sales & quick receipt billing' },
  { id: 'returns', label: 'Sales Return', icon: RotateCcw, desc: 'Medicine refund & automatic restock' },
  { id: 'purchases', label: 'Purchase & Vendors', icon: Truck, desc: 'Suppliers, bookers & purchase receiving' },
  { id: 'inventory', label: 'Inventory', icon: Package, desc: 'Manage medicines, stocks & pricing' },
  { id: 'demand', label: 'Demand / Restock', icon: Boxes, desc: 'Low stock alerts & purchase demands' },
  { id: 'expiry', label: 'Expiry Tracker', icon: CalendarX, desc: 'Short expiry & expired stock status' },
  { id: 'customer-history', label: 'Customer History', icon: Users, desc: 'Invoices, return slips & customer ledger' },
  { id: 'sales', label: 'Sales & Reports', icon: BarChart3, desc: 'Revenue, purchase expense & gross profit' },
  { id: 'fast-moving', label: 'Top Selling', icon: Flame, desc: 'Product demand & sales leaderboard' },
  { id: 'settings', label: 'Store Settings', icon: SettingsIcon, desc: 'Printer setup, branding & backups' },
  { id: 'network', label: 'Sharing & Network', icon: Network, desc: 'Server IP, LAN sync & client setup' },
];

export function Sidebar({
  page,
  onNavigate,
  storeName,
  counterPermissions = readCachedCounterPermissions(),
  onMasterAdminChange,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  storeName: string;
  counterPermissions?: CounterPermissions;
  onMasterAdminChange?: (isMasterAdmin: boolean) => void;
}) {
  const isCounter = getNetworkRole() === 'client' || localStorage.getItem('pos_device_role') === 'counter';
  const serverIP = getServerIP();

  const fallbackStore = storeName || 'Pharmacy Store';

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [adminPinOpen, setAdminPinOpen] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminPinConfirm, setAdminPinConfirm] = useState('');
  const [adminPinConfigured, setAdminPinConfigured] = useState(isAdminPinConfigured);
  const [adminPinError, setAdminPinError] = useState('');
  
  const [activeUser, setActiveUser] = useState<string>(() => localStorage.getItem('pos_active_user') || fallbackStore);
  const [userNameInput, setUserNameInput] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [userError, setUserError] = useState('');
  const [userAccounts, setUserAccounts] = useState<PosUserRecord[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('pos_users_list') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Use refs for click timing so the fifth-click side effect runs exactly once,
  // including under React StrictMode in development builds.
  const logoTapCountRef = useRef(0);
  const tapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('pos_active_user');
    if (!saved && storeName) {
      setActiveUser(storeName);
    }
  }, [storeName]);

  useEffect(() => {
    let active = true;
    const syncAccounts = async () => {
      try {
        const { data } = await supabase.from('pos_users_list').select('*');
        if (!active) return;
        if (data?.length) {
          const accounts = (data as PosUserRecord[]).filter((user) => Boolean(user.name));
          setUserAccounts(accounts);
          localStorage.setItem('pos_users_list', JSON.stringify(accounts));
        } else if (!isCounter && userAccounts.length > 0) {
          await replaceLocalTable('pos_users_list', userAccounts);
        }
      } catch {
        // Local cached accounts remain usable while the LAN server is offline.
      }
    };
    void syncAccounts();
    const interval = window.setInterval(syncAccounts, 4000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isCounter]);

  useEffect(() => () => {
    if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
  }, []);

  const [oneTimeAllowedPage, setOneTimeAllowedPage] = useState<Page | null>(null);
  const [lockedTarget, setLockedTarget] = useState<{ id: Page; label: string } | null>(null);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'pending' | 'denied'>('idle');

  const catalogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (catalogRef.current && !catalogRef.current.contains(e.target as Node)) {
        setCatalogOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleLogoClick() {
    const next = logoTapCountRef.current + 1;
    logoTapCountRef.current = next;

    if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);

    if (next >= 5) {
      logoTapCountRef.current = 0;
      tapTimerRef.current = null;
      setAdminPin('');
      setAdminPinConfirm('');
      setAdminPinConfigured(isAdminPinConfigured());
      setAdminPinError('');
      setAdminPinOpen(true);
      return;
    }

    tapTimerRef.current = window.setTimeout(() => {
      logoTapCountRef.current = 0;
      tapTimerRef.current = null;
    }, 2000);
  }

  async function handleAdminPinSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      if (!adminPinConfigured) {
        await saveAdminPinCredential(adminPin, adminPinConfirm);
        setAdminPinConfigured(true);
      } else if (!(await verifyAdminPin(adminPin))) {
        setAdminPin('');
        setAdminPinError('Incorrect PIN. Please try again.');
        return;
      }
    } catch (error) {
      setAdminPinError(error instanceof Error ? error.message : 'Could not save the admin PIN.');
      return;
    }

    localStorage.setItem('pos_device_role', 'server');
    localStorage.setItem('pos_network_role', 'server');
    localStorage.setItem('is_master_admin', 'true');
    onMasterAdminChange?.(true);
    localStorage.setItem('pos_active_user', 'TECHI');
    window.dispatchEvent(new Event('pos-network-role-changed'));
    setActiveUser('TECHI');
    setAdminPin('');
    setAdminPinConfirm('');
    setAdminPinError('');
    setAdminPinOpen(false);
  }

  async function saveUserAccounts(accounts: PosUserRecord[]) {
    setUserAccounts(accounts);
    localStorage.setItem('pos_users_list', JSON.stringify(accounts));
    try {
      // Keep an explicit empty-list row so Counter PCs can distinguish "no users" from an offline server.
      const tableRows = accounts.length ? accounts : [{ id: '__empty_user_list__', name: '', created_at: new Date().toISOString() }];
      await replaceLocalTable('pos_users_list', tableRows);
      setUserError('');
    } catch {
      setUserError('Saved on this PC. The Main Server could not be reached to sync the user list.');
    }
  }

  async function handleLoginUser(name: string) {
    const clean = name.trim();
    if (!clean) return;
    const account = userAccounts.find((user) => user.name.toLowerCase() === clean.toLowerCase());
    if (userAccounts.length > 0 && !account) {
      setUserError('Choose a saved account or add this person as a user first.');
      return;
    }
    if (account?.passwordCredential && !(await verifyUserPassword(loginPassword, account.passwordCredential))) {
      setUserError('Incorrect password for this user.');
      return;
    }
    localStorage.setItem('pos_active_user', clean);
    setActiveUser(clean);
    setUserModalOpen(false);
    setUserNameInput('');
    setLoginPassword('');
    setUserError('');
  }

  async function handleAddUser() {
    const name = newUserName.trim();
    if (!name) {
      setUserError('Enter a name for the new user.');
      return;
    }
    if (userAccounts.some((user) => user.name.toLowerCase() === name.toLowerCase())) {
      setUserError('A user with this name already exists.');
      return;
    }
    try {
      const passwordCredential = newUserPassword ? await createUserPasswordCredential(newUserPassword) : undefined;
      const next: PosUserRecord[] = [{
        id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        ...(passwordCredential ? { passwordCredential } : {}),
        created_at: new Date().toISOString(),
      }, ...userAccounts];
      await saveUserAccounts(next);
      setUserNameInput(name);
      setNewUserName('');
      setNewUserPassword('');
    } catch (error) {
      setUserError(error instanceof Error ? error.message : 'Could not create this user.');
    }
  }

  async function handleDeleteUser(user: PosUserRecord) {
    if (isCounter || !window.confirm(`Remove the saved account for ${user.name}?`)) return;
    const next = userAccounts.filter((current) => current.id !== user.id);
    await saveUserAccounts(next);
    if (activeUser.toLowerCase() === user.name.toLowerCase()) handleLogoutUser();
  }

  function handleLogoutUser() {
    localStorage.removeItem('pos_active_user');
    setActiveUser(fallbackStore);
    setUserModalOpen(false);
  }

  // Main Server's saved authority matrix is enforced by App and reflected here.
  function isRestrictedScreen(p: Page): boolean {
    return isCounterModuleRestricted(p, counterPermissions);
  }

  const handleTabClick = (item: { id: Page; label: string }) => {
    if (oneTimeAllowedPage === item.id) setOneTimeAllowedPage(null);
    // App owns the shared permission gate and request flow for every navigation entry point.
    onNavigate(item.id as Page);
    setCatalogOpen(false);
  };

  const currentPageItem = NAV_ITEMS.find((it) => it.id === page);

  return (
    <>
      <header className="w-full shrink-0 flex items-center justify-between px-4 py-2.5 bg-slate-900 text-slate-200 border-b border-slate-800 shadow-md select-none z-30 relative">
        
        {/* Left Side: Store Identity (5-Tap Admin Master) & Modules */}
        <div className="flex items-center gap-3">
          <div 
            onClick={handleLogoClick}
            className="flex items-center gap-2.5 cursor-pointer active:scale-95 transition-transform"
            title="Click 5 times for Admin Master Control"
          >
            <div className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-sm">
              <Pill className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-bold text-sm text-white leading-tight">
                {storeName || 'Pharmacy POS'}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold leading-none mt-0.5">
                {isCounter ? 'Counter PC (Client)' : 'Main Server'}
              </div>
            </div>
          </div>

          <div className="h-5 w-[1px] bg-slate-700 hidden sm:block"></div>

          {/* Catalog Dropdown */}
          <div className="relative" ref={catalogRef}>
            <button
              onClick={() => setCatalogOpen((prev) => !prev)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <LayoutGrid className="h-4 w-4 text-emerald-400" />
              <span>Catalog & Modules</span>
              {currentPageItem && (
                <span className="hidden md:inline-block ml-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30">
                  {currentPageItem.label}
                </span>
              )}
              <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${catalogOpen ? 'rotate-180' : ''}`} />
            </button>

            {catalogOpen && (
              <div className="absolute left-0 mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between px-2 pb-2 mb-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">System Modules</span>
                  <span className="text-[10px] text-slate-500">Standard Pro Hub</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = page === item.id;
                    const isLocked = isCounter && isRestrictedScreen(item.id) && oneTimeAllowedPage !== item.id;

                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabClick(item)}
                        className={`flex items-start gap-2.5 p-2 rounded-xl text-left transition-all cursor-pointer group ${
                          active
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <div className={`p-2 rounded-lg shrink-0 ${
                          active ? 'bg-white/20 text-white' : 'bg-slate-800 group-hover:bg-slate-700 text-emerald-400'
                        }`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold truncate">{item.label}</span>
                            {isLocked && <Lock className="h-3 w-3 text-amber-400 shrink-0 ml-1" />}
                          </div>
                          <p className={`text-[10px] leading-tight line-clamp-1 mt-0.5 ${
                            active ? 'text-emerald-100' : 'text-slate-400'
                          }`}>
                            {item.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Active User Switcher + STANDARD PRO */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setUserModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium cursor-pointer shadow-xs transition-colors"
            title="Click to switch or logout user"
          >
            <div className="h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center font-bold text-[10px]">
              {activeUser.charAt(0).toUpperCase()}
            </div>
            <span>User: <strong className="text-emerald-400">{activeUser}</strong></span>
          </button>

          <div className="text-right hidden sm:flex flex-col items-end">
            <div className="text-sm font-extrabold tracking-wider bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent uppercase">
              STANDARD PRO
            </div>
            <div className="text-[10px] text-slate-400 font-medium tracking-tight">
              Created by <span className="text-emerald-400 font-semibold">TECHI</span>
            </div>
          </div>
        </div>
      </header>

      {/* HTML modal works in both Chromium browsers and Electron; native prompt() is unsupported in some Electron builds. */}
      {adminPinOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="master-admin-title"
            onSubmit={handleAdminPinSubmit}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-2xl"
          >
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h2 id="master-admin-title" className="text-center text-lg font-bold">Master Admin Control</h2>
            <p className="mt-1 text-center text-xs text-slate-500">
              {adminPinConfigured
                ? 'Enter this device’s admin PIN to switch it to Main Server.'
                : 'Create a private admin PIN for this device to switch it to Main Server.'}
            </p>
            <label htmlFor="master-admin-pin" className="mt-5 block text-xs font-semibold text-slate-600">
              {adminPinConfigured ? 'Admin PIN' : 'Create Admin PIN'}
            </label>
            <input
              id="master-admin-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={adminPin}
              onChange={(e) => {
                setAdminPin(e.target.value);
                setAdminPinError('');
              }}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-center font-mono tracking-[0.3em] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            {!adminPinConfigured && (
              <>
                <label htmlFor="master-admin-pin-confirm" className="mt-3 block text-xs font-semibold text-slate-600">
                  Confirm Admin PIN
                </label>
                <input
                  id="master-admin-pin-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={adminPinConfirm}
                  onChange={(e) => {
                    setAdminPinConfirm(e.target.value);
                    setAdminPinError('');
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-center font-mono tracking-[0.3em] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  Stored on this device only. Choose a PIN you can remember.
                </p>
              </>
            )}
            {adminPinError && (
              <p role="alert" className="mt-2 text-center text-xs font-medium text-red-600">{adminPinError}</p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdminPinOpen(false);
                  setAdminPin('');
                  setAdminPinConfirm('');
                  setAdminPinError('');
                }}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
              >
                {adminPinConfigured ? 'Unlock' : 'Save & Unlock'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User Switch Modal */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 text-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-base text-slate-800">Counter User Login</h3>
              </div>
              <button onClick={() => setUserModalOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <p className="text-xs text-slate-500">
                Counter par kaam karne wale ka naam likhein taake har bill par uska naam record ho sake.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cashier / User Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ali / counter man"
                  value={userNameInput}
                  onChange={(e) => setUserNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleLoginUser(userNameInput);
                  }}
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {userAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Saved Users</label>
                  <div className="max-h-28 overflow-y-auto space-y-1 rounded-xl border border-slate-200 p-1.5">
                    {userAccounts.map((account) => (
                      <div key={account.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => { setUserNameInput(account.name); setUserError(''); }}
                          className={`flex-1 rounded-lg px-2.5 py-2 text-left text-xs font-semibold ${userNameInput === account.name ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                          {account.name}{account.passwordCredential ? ' · password protected' : ''}
                        </button>
                        {!isCounter && (
                          <button
                            type="button"
                            title={`Delete ${account.name}`}
                            onClick={() => void handleDeleteUser(account)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Password (if this user has one)</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => { setLoginPassword(e.target.value); setUserError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleLoginUser(userNameInput); }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3">
                <p className="text-xs font-bold text-slate-700">Add Cashier / User</p>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => { setNewUserName(e.target.value); setUserError(''); }}
                  placeholder="New user name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newUserPassword}
                  onChange={(e) => { setNewUserPassword(e.target.value); setUserError(''); }}
                  placeholder="Optional password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => void handleAddUser()}
                  className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                >
                  Add User
                </button>
              </div>
              {userError && <p role="alert" className="text-xs font-medium text-red-600">{userError}</p>}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleLogoutUser}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Reset to Store Name</span>
              </button>

              <button
                type="button"
                onClick={() => void handleLoginUser(userNameInput || activeUser)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Set User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Access Denied Modal on Counter PC */}
      {lockedTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[2px]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="mx-auto h-12 w-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
              <ShieldAlert className="h-6 w-6" />
            </div>

            <h3 className="text-base font-bold text-slate-800">Access Restricted</h3>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              <span className="font-semibold text-slate-700">[{(lockedTarget as any).label}]</span> is protected. Main Server se 1-time permission zaroori hai.
            </p>

            {requestStatus === 'idle' && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={async () => {
                    setRequestStatus('pending');
                    const reqObj = {
                      id: `req_${Date.now()}`,
                      page: (lockedTarget as any).id,
                      pageLabel: (lockedTarget as any).label,
                      cashier_name: activeUser,
                      requested_page: (lockedTarget as any).id,
                      status: 'pending',
                      time: new Date().toLocaleTimeString(),
                      created_at: new Date().toISOString(),
                    };
                    localStorage.setItem('pending_access_request', JSON.stringify(reqObj));
                  }}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-colors"
                >
                  Request 1-Time Access from Main PC
                </button>
                <button
                  type="button"
                  onClick={() => setLockedTarget(null)}
                  className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}

            {requestStatus === 'pending' && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
                <div className="flex justify-center items-center gap-2 text-indigo-700 font-semibold text-xs mb-1">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for Main PC Approval...
                </div>
                <p className="text-[11px] text-indigo-500">
                  Main Server ki Store Settings / Sharing Module mein request chali gayi hai.
                </p>
                <button
                  type="button"
                  onClick={() => { setLockedTarget(null); setRequestStatus('idle'); }}
                  className="mt-3 text-[11px] font-bold text-slate-400 hover:text-slate-600 underline cursor-pointer"
                >
                  Cancel Request
                </button>
              </div>
            )}

            {requestStatus === 'denied' && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                <p className="text-xs font-bold text-red-600 mb-1">Access Request Rejected</p>
                <button
                  type="button"
                  onClick={() => { setLockedTarget(null); setRequestStatus('idle'); }}
                  className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function MobileNav({ page, onNavigate, counterPermissions = readCachedCounterPermissions() }: {
  page: Page;
  onNavigate: (p: Page) => void;
  counterPermissions?: CounterPermissions;
}) {
  const isCounter = getNetworkRole() === 'client' || localStorage.getItem('pos_device_role') === 'counter';

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-900 border-t border-slate-800 flex overflow-x-auto">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = page === item.id;
        const isLocked = isCounter && isCounterModuleRestricted(item.id, counterPermissions);

        return (
          <button
            key={item.id}
            onClick={() => {
              onNavigate(item.id);
            }}
            className={`min-w-[64px] flex-1 flex flex-col items-center gap-1 py-2 text-[10px] font-medium ${
              active ? 'text-emerald-400' : isLocked ? 'text-slate-600' : 'text-slate-400'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="flex items-center gap-0.5 truncate max-w-[55px]">
              {item.label.split(' ')[0]}
              {isLocked && <Lock className="h-2.5 w-2.5 text-amber-400" />}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
