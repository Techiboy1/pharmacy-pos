const SESSION_COOKIE = 'pharmacy_pos_demo_started_at';
const SESSION_LENGTH_MS = 3 * 24 * 60 * 60 * 1000;
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function readCookie(cookieHeader, name) {
  const prefix = `${name}=`;
  const item = (cookieHeader || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
}

export default function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  response.setHeader('Cache-Control', 'no-store, private');

  const now = Date.now();
  const existing = readCookie(request.headers.cookie, SESSION_COOKIE);
  let startedAt = existing ? Number(existing) : NaN;

  if (!Number.isSafeInteger(startedAt) || startedAt > now || now - startedAt > COOKIE_MAX_AGE_SECONDS * 1000) {
    startedAt = now;
    response.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${startedAt}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`
    );
  }

  const expiresAt = startedAt + SESSION_LENGTH_MS;
  if (now >= expiresAt) {
    return response.status(410).json({ expired: true });
  }

  return response.status(200).json({ expiresAt });
}
