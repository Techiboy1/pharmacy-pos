const ADMIN_CREDENTIAL_KEY = 'pos_master_admin_credential_v1';
const PBKDF2_ITERATIONS = 250_000;
const MIN_PIN_LENGTH = 5;

interface StoredAdminCredential {
  version: 1;
  algorithm: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  verifier: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function readCredential(): StoredAdminCredential | null {
  const stored = localStorage.getItem(ADMIN_CREDENTIAL_KEY);
  if (!stored) return null;

  try {
    const credential = JSON.parse(stored) as StoredAdminCredential;
    if (
      credential.version !== 1 ||
      credential.algorithm !== 'PBKDF2-SHA-256' ||
      !Number.isInteger(credential.iterations) ||
      !credential.salt ||
      !credential.verifier
    ) {
      return null;
    }
    return credential;
  } catch {
    return null;
  }
}

async function deriveVerifier(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure credential storage is unavailable in this app environment.');
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations },
    keyMaterial,
    256,
  );
  return new Uint8Array(derivedBits);
}

export function isAdminPinConfigured(): boolean {
  return readCredential() !== null;
}

export async function saveAdminPinCredential(pin: string, confirmation: string): Promise<void> {
  if (pin.length < MIN_PIN_LENGTH) {
    throw new Error(`Choose an admin PIN with at least ${MIN_PIN_LENGTH} characters.`);
  }
  if (pin !== confirmation) {
    throw new Error('The PIN entries do not match.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier = await deriveVerifier(pin, salt, PBKDF2_ITERATIONS);
  const credential: StoredAdminCredential = {
    version: 1,
    algorithm: 'PBKDF2-SHA-256',
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    verifier: toBase64(verifier),
  };
  localStorage.setItem(ADMIN_CREDENTIAL_KEY, JSON.stringify(credential));
}

export async function verifyAdminPin(pin: string): Promise<boolean> {
  const credential = readCredential();
  if (!credential) return false;

  try {
    const expected = fromBase64(credential.verifier);
    const actual = await deriveVerifier(pin, fromBase64(credential.salt), credential.iterations);
    if (expected.length !== actual.length) return false;

    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) {
      difference |= expected[index] ^ actual[index];
    }
    return difference === 0;
  } catch {
    return false;
  }
}
