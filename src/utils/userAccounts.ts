const PASSWORD_ITERATIONS = 180_000;

export interface PosUserRecord {
  id: string;
  name: string;
  passwordCredential?: {
    algorithm: 'PBKDF2-SHA-256';
    iterations: number;
    salt: string;
    verifier: string;
  };
  created_at: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure password storage is unavailable in this app environment.');
  }
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations },
    material,
    256,
  );
  return new Uint8Array(bits);
}

export async function createUserPasswordCredential(password: string): Promise<NonNullable<PosUserRecord['passwordCredential']>> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return {
    algorithm: 'PBKDF2-SHA-256',
    iterations: PASSWORD_ITERATIONS,
    salt: toBase64(salt),
    verifier: toBase64(verifier),
  };
}

export async function verifyUserPassword(password: string, credential: PosUserRecord['passwordCredential']): Promise<boolean> {
  if (!credential || credential.algorithm !== 'PBKDF2-SHA-256' || !Number.isInteger(credential.iterations)) return false;
  try {
    const expected = fromBase64(credential.verifier);
    const actual = await derivePassword(password, fromBase64(credential.salt), credential.iterations);
    if (expected.length !== actual.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ actual[index];
    return difference === 0;
  } catch {
    return false;
  }
}
