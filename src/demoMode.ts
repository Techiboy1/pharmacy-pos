declare global {
  const __PHARMACY_DEMO_MODE__: boolean;

  interface Window {
    __PHARMACY_DEMO__?: { expiresAt: number; expired: boolean };
  }
}

type DemoStartup = 'inactive' | 'active' | 'expired' | 'unavailable';

function keepApplicationStateInMemory(): void {
  const localStorage = window.localStorage;
  const sessionStorage = window.sessionStorage;
  const nativeClear = Storage.prototype.clear;

  // This host is exclusively for the demo, so discard data left by any earlier build here.
  nativeClear.call(localStorage);
  nativeClear.call(sessionStorage);

  const stores = new WeakMap<Storage, Map<string, string>>();
  const getStore = (storage: Storage) => {
    let store = stores.get(storage);
    if (!store) {
      store = new Map<string, string>();
      stores.set(storage, store);
    }
    return store;
  };

  Storage.prototype.getItem = function (key: string): string | null {
    return getStore(this).get(String(key)) ?? null;
  };
  Storage.prototype.setItem = function (key: string, value: string): void {
    getStore(this).set(String(key), String(value));
  };
  Storage.prototype.removeItem = function (key: string): void {
    getStore(this).delete(String(key));
  };
  Storage.prototype.clear = function (): void {
    getStore(this).clear();
  };
  Storage.prototype.key = function (index: number): string | null {
    return Array.from(getStore(this).keys())[index] ?? null;
  };
  Object.defineProperty(Storage.prototype, 'length', {
    configurable: true,
    get() {
      return getStore(this).size;
    },
  });
}

export async function startDemoSession(): Promise<DemoStartup> {
  if (!__PHARMACY_DEMO_MODE__) return 'inactive';

  try {
    const response = await fetch('/api/demo-session', {
      cache: 'no-store',
      credentials: 'same-origin',
    });

    if (response.status === 410) return 'expired';
    if (!response.ok) return 'unavailable';

    const { expiresAt } = (await response.json()) as { expiresAt?: number };
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return 'expired';
    }

    keepApplicationStateInMemory();
    window.__PHARMACY_DEMO__ = { expiresAt, expired: false };

    window.setTimeout(() => {
      if (!window.__PHARMACY_DEMO__) return;
      window.__PHARMACY_DEMO__.expired = true;
      window.dispatchEvent(new Event('pharmacy-demo-expired'));
    }, Math.max(0, expiresAt - Date.now()));

    return 'active';
  } catch {
    return 'unavailable';
  }
}
