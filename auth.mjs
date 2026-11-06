/* auth.mjs — تسجيل الدخول بحساب جوجل (OAuth بدون أي سر)، والجلسة كتبقى فالجهاز */

const CID_KEY = 'azzouz-google-client-id';
const SESSION = 'azzouz-google-session-v1';

export const SCOPES = {
  basic: 'openid email profile',
  youtube: 'https://www.googleapis.com/auth/youtube.readonly',
  drive: 'https://www.googleapis.com/auth/drive.metadata.readonly',
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
  calendar: 'https://www.googleapis.com/auth/calendar.readonly'
};

export function getClientId() {
  try { return localStorage.getItem(CID_KEY) || ''; } catch (e) { return ''; }
}

export function setClientId(id) {
  try { localStorage.setItem(CID_KEY, String(id || '').trim()); } catch (e) {}
}

export function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION) || 'null');
    if (!s || !s.token) return null;
    if (s.exp && Date.now() > s.exp - 60000) return { ...s, stale: true };
    return s;
  } catch (e) { return null; }
}

function saveSession(s) {
  try { localStorage.setItem(SESSION, JSON.stringify(s)); } catch (e) {}
}

export function signOut() {
  const s = getSession();
  try {
    if (s && s.token && typeof google !== 'undefined' && google.accounts?.oauth2?.revoke) {
      google.accounts.oauth2.revoke(s.token, () => {});
    }
  } catch (e) {}
  try { localStorage.removeItem(SESSION); } catch (e) {}
}

let gisReady = null;
function loadGis() {
  if (typeof google !== 'undefined' && google.accounts?.oauth2) return Promise.resolve();
  if (gisReady) return gisReady;
  gisReady = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error('ماقدرتش نحمّل صفحة تسجيل الدخول ديال جوجل'));
    document.head.appendChild(s);
  });
  return gisReady;
}

function requestToken(scope, prompt) {
  return new Promise((resolve, reject) => {
    const cid = getClientId();
    if (!cid) return reject(new Error('NO_CLIENT_ID'));
    let settled = false;
    const client = google.accounts.oauth2.initTokenClient({
      client_id: cid,
      scope,
      prompt,
      callback: (resp) => {
        if (settled) return;
        settled = true;
        if (resp.error) return reject(new Error(resp.error === 'access_denied' ? 'ACCESS_DENIED' : resp.error));
        resolve(resp);
      },
      error_callback: (err) => {
        if (settled) return;
        settled = true;
        reject(new Error(err?.type || 'popup_failed'));
      }
    });
    try { client.requestAccessToken(); } catch (e) { reject(e); }
  });
}

export async function signIn(extraScopes = []) {
  await loadGis();
  const scope = [SCOPES.basic, ...extraScopes].join(' ');
  const resp = await requestToken(scope, 'consent');
  const s = {
    token: resp.access_token,
    scope: resp.scope || scope,
    exp: Date.now() + (Number(resp.expires_in || 3600) * 1000),
    ts: Date.now()
  };
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + s.token } });
    if (r.ok) {
      const u = await r.json();
      s.name = u.name || '';
      s.email = u.email || '';
      s.pic = u.picture || '';
    }
  } catch (e) {}
  saveSession(s);
  return s;
}

export async function getAccessToken(needScope) {
  const s = getSession();
  if (s && !s.stale) {
    if (!needScope || String(s.scope || '').includes(needScope)) return s.token;
  }
  if (!s) return null;
  // تجديد صامت بلا ما يتحل أي شيء
  try {
    await loadGis();
    const scope = [SCOPES.basic, needScope].filter(Boolean).join(' ');
    const resp = await requestToken(scope, '');
    const ns = { ...s, token: resp.access_token, scope: resp.scope || scope, exp: Date.now() + (Number(resp.expires_in || 3600) * 1000), stale: false };
    saveSession(ns);
    return ns.token;
  } catch (e) { return null; }
}

export function hasScope(s, scope) {
  const sc = String(s?.scope || '');
  return !!sc && sc.includes(scope);
}

export async function googleApi(url, needScope, opts = {}) {
  const token = await getAccessToken(needScope);
  if (!token) throw new Error('NOT_SIGNED_IN');
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token } });
  if (r.status === 401) throw new Error('TOKEN_EXPIRED');
  return r;
}
