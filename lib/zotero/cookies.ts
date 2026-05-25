import { cookies } from 'next/headers';
import { encrypt, decrypt } from './crypto';
import type { ZoteroSession, OAuthPendingSession } from './types';

const SESSION_COOKIE = 'zotero_session';
const PENDING_COOKIE = 'zotero_oauth_pending';
const MAX_AGE_SESSION = 60 * 60 * 24 * 30; // 30 days
const MAX_AGE_PENDING = 60 * 5; // 5 minutes

// ── Session cookie (post-OAuth) ────────────────────────────────────────

export async function getZoteroSession(): Promise<ZoteroSession | null> {
  try {
    const store = await cookies();
    const cookie = store.get(SESSION_COOKIE);
    if (!cookie?.value) return null;
    const json = decrypt(cookie.value);
    return JSON.parse(json) as ZoteroSession;
  } catch {
    return null;
  }
}

export async function setZoteroSession(session: ZoteroSession): Promise<void> {
  const store = await cookies();
  const encrypted = encrypt(JSON.stringify(session));
  store.set(SESSION_COOKIE, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SESSION,
  });
}

export async function clearZoteroSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

// ── Pending OAuth cookie (between request-token and callback) ──────────

export async function getOAuthPending(): Promise<OAuthPendingSession | null> {
  try {
    const store = await cookies();
    const cookie = store.get(PENDING_COOKIE);
    if (!cookie?.value) return null;
    const json = decrypt(cookie.value);
    return JSON.parse(json) as OAuthPendingSession;
  } catch {
    return null;
  }
}

export async function setOAuthPending(pending: OAuthPendingSession): Promise<void> {
  const store = await cookies();
  const encrypted = encrypt(JSON.stringify(pending));
  store.set(PENDING_COOKIE, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_PENDING,
  });
}

export async function clearOAuthPending(): Promise<void> {
  const store = await cookies();
  store.set(PENDING_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
