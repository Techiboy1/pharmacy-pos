import CryptoJS from 'crypto-js';

const SECRET_KEY = 'PHARMA_POS_SECURE_SALT_KEY_2026';

type LicensePayload = {
  mid: string;
  exp: string;
};

export type LicenseInfo = {
  status: 'missing' | 'active' | 'expired' | 'invalid';
  expiry: string | null;
  isLifetime: boolean;
  daysLeft: number | null;
};

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function parseLicenseExpiry(value: string): Date | null {
  const dateKey = parseDateKey(value);
  if (dateKey) return dateKey;

  // Accept legacy ISO timestamps and Unix timestamps stored in older trial keys.
  const numeric = /^\d{10,13}$/.test(value) ? Number(value) : null;
  const parsed = numeric === null
    ? new Date(value)
    : new Date(numeric < 100_000_000_000 ? numeric * 1000 : numeric);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function expiryIsDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addCalendarMonths(date: Date, months: number): Date {
  const targetMonth = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDayOfTargetMonth = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0,
  ).getDate();
  targetMonth.setDate(Math.min(date.getDate(), lastDayOfTargetMonth));
  return targetMonth;
}

function decryptLicenseKey(key: string): LicensePayload | null {
  try {
    const bytes = CryptoJS.AES.decrypt(key.trim(), SECRET_KEY);
    const text = bytes.toString(CryptoJS.enc.Utf8);
    if (!text) return null;

    const payload = JSON.parse(text) as Partial<LicensePayload>;
    if (typeof payload.mid !== 'string' || typeof payload.exp !== 'string') return null;
    return { mid: payload.mid, exp: payload.exp };
  } catch {
    return null;
  }
}

export function getMachineId(): string {
  let id = localStorage.getItem('pos_machine_id');
  if (!id) {
    const part1 = Math.random().toString(36).substring(2, 8).toUpperCase();
    const part2 = Math.random().toString(36).substring(2, 8).toUpperCase();
    id = `MID-${part1}-${part2}`;
    localStorage.setItem('pos_machine_id', id);
  }
  return id;
}

/**
 * If the caller omits an expiry, issue the safer one-month duration rather
 * than silently creating a lifetime license. Lifetime must be explicit.
 */
export function generateLicenseKey(
  machineId: string,
  expiry: string = toDateKey(addCalendarMonths(new Date(), 1)),
): string {
  const normalizedExpiry = expiry.trim();
  if (normalizedExpiry !== 'LIFETIME' && !parseDateKey(normalizedExpiry)) {
    throw new Error('License expiry must be LIFETIME or a valid YYYY-MM-DD date.');
  }

  const payload = JSON.stringify({
    mid: machineId.trim(),
    exp: normalizedExpiry,
  });
  return CryptoJS.AES.encrypt(payload, SECRET_KEY).toString();
}

export function verifyLicenseKey(key: string): { valid: boolean; reason?: string } {
  if (!key || !key.trim()) {
    return { valid: false, reason: 'Please enter a license key.' };
  }

  const data = decryptLicenseKey(key);
  if (!data) {
    return { valid: false, reason: 'Invalid or corrupt License Key.' };
  }

  if (data.mid !== getMachineId()) {
    return { valid: false, reason: 'This license key does not match this machine!' };
  }

  if (data.exp !== 'LIFETIME') {
    const expiryDate = parseLicenseExpiry(data.exp);
    if (!expiryDate) {
      return { valid: false, reason: 'Invalid or corrupt License Key.' };
    }

    const todayDate = parseDateKey(toDateKey(new Date()));
    const expired = expiryIsDateOnly(data.exp)
      ? !todayDate || expiryDate.getTime() < todayDate.getTime()
      : expiryDate.getTime() < Date.now();
    if (expired) {
      return { valid: false, reason: 'This license has expired!' };
    }
  }

  localStorage.setItem('pos_license_key', key.trim());
  return { valid: true };
}

export function checkCurrentLicense(): boolean {
  const savedKey = localStorage.getItem('pos_license_key');
  if (!savedKey) return false;
  return verifyLicenseKey(savedKey).valid;
}

export function getLicenseInfo(): LicenseInfo {
  const savedKey = localStorage.getItem('pos_license_key');
  if (!savedKey) {
    return { status: 'missing', expiry: null, isLifetime: false, daysLeft: null };
  }

  const data = decryptLicenseKey(savedKey);
  if (!data || data.mid !== getMachineId()) {
    return { status: 'invalid', expiry: null, isLifetime: false, daysLeft: null };
  }

  if (data.exp === 'LIFETIME') {
    return { status: 'active', expiry: null, isLifetime: true, daysLeft: null };
  }

  const expiryDate = parseLicenseExpiry(data.exp);
  const todayDate = parseDateKey(toDateKey(new Date()));
  if (!expiryDate || !todayDate) {
    return { status: 'invalid', expiry: null, isLifetime: false, daysLeft: null };
  }

  const displayExpiry = expiryIsDateOnly(data.exp)
    ? data.exp
    : toDateKey(expiryDate);
  const expired = expiryIsDateOnly(data.exp)
    ? expiryDate.getTime() < todayDate.getTime()
    : expiryDate.getTime() < Date.now();
  if (expired) {
    return { status: 'expired', expiry: displayExpiry, isLifetime: false, daysLeft: 0 };
  }

  const difference = Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000);
  return { status: 'active', expiry: displayExpiry, isLifetime: false, daysLeft: Math.max(0, difference) };
}
