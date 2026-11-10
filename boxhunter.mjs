/*
 * TikTok Box Hunter PRO v21 — AZZOUZ AI
 * Browser ES module. Backward-compatible exports: render, startWatcher, stopWatcher,
 * tkToken, tkStatus, tkConnect, tkDisconnect, tkFinish.
 *
 * IMPORTANT: TikTok does not expose a general public LIVE reward-box discovery or
 * collection API. Radar therefore consumes only an explicitly configured,
 * authorized AZZOUZ backend/provider endpoint. Collection is always user-confirmed.
 */

export const BOXHUNTER_VERSION = '21.0.0';

const STORE = {
  boxes: 'bh-boxes', logs: 'bh-logs', settings: 'bh-settings',
  needs: 'bh-need', auth: 'bh-tk-session', verifier: 'bh-tk-verifier',
  state: 'bh-tk-state', redirect: 'bh-tk-redirect', returnQuery: 'bh-tk-return-query',
  manual: 'bh-tk-manual'
};
// الـRedirect المسجل بالحرف فبوابة TikTok
const REGISTERED_REDIRECT = 'https://mohamedazzouz1662001-bit.github.io/azzouz.com/azzouz-ai.html';
const DEFAULTS = {
  on: true, silent: true, notify: false, ttl: 15, pollSeconds: 45,
  radarEndpoint: '', authEndpoint: '', clientKey: '',
  kinds: { treasure: true, live: true }, lang: 'ar', maxBoxes: 400
};
const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
let TIMER = null;
let RADAR_BUSY = false;
let ROOT = null;
let LAST_RADAR_AT = 0;

const read = (key, fallback) => {
  try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value ?? fallback; }
  catch { return fallback; }
};
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
const getBoxes = () => { const value = read(STORE.boxes, []); return Array.isArray(value) ? value : []; };
const getLogs = () => { const value = read(STORE.logs, []); return Array.isArray(value) ? value : []; };
const settings = () => ({ ...DEFAULTS, ...read(STORE.settings, {}), kinds: { ...DEFAULTS.kinds, ...(read(STORE.settings, {}).kinds || {}) } });
const safeText = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const fmt = ms => ms <= 0 ? 'انتهى' : `${Math.floor(ms / 60000)}د ${String(Math.floor(ms % 60000 / 1000)).padStart(2, '0')}ث`;
const makeId = value => (String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(-32) || `bh${Date.now()}${Math.random().toString(36).slice(2, 7)}`);

function log(kind, message, meta = {}) {
  const rows = getLogs(); rows.unshift({ at: Date.now(), kind, text: String(message), ...meta });
  write(STORE.logs, rows.slice(0, 500));
}
function requestAttention(message) {
  const old = read(STORE.needs, { n: 0 });
  write(STORE.needs, { n: (old.n || 0) + 1, text: String(message), at: Date.now() });
}
function toast(message) {
  const host = ROOT?.querySelector('#bh-toast');
  if (!host) return;
  host.textContent = String(message);
  host.classList.add('show');
  clearTimeout(host._timer);
  host._timer = setTimeout(() => host.classList.remove('show'), 6500);
}
function announce(title, body) {
  const s = settings();
  if (s.silent) { log('silent', `${title} — ${body}`); requestAttention(title); return; }
  if (s.notify && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body }); } catch { /* browser notification unavailable */ }
  }
  toast(`${title} — ${body}`);
}
function validEndpoint(raw) {
  if (!raw) return '';
  try {
    const u = new URL(raw, location.href);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return '';
    return u.href;
  } catch { return ''; }
}
function makeTikTokUrl(raw) {
  const value = String(raw || '').trim();
  let url;
  if (/^@?[\w.]{2,24}$/.test(value)) {
    const username = value.replace(/^@/, '');
    return `https://www.tiktok.com/@${username}/live`;
  }
  try { url = new URL(value); } catch { return ''; }
  if (url.protocol !== 'https:' || !['tiktok.com', 'www.tiktok.com'].includes(url.hostname.toLowerCase())) return '';
  const match = url.pathname.match(/^\/@([\w.]{2,24})(?:\/live)?\/?$/i);
  if (!match) return '';
  return `https://www.tiktok.com/@${match[1]}/live`;
}
function hostFrom(raw) {
  const m = String(raw || '').match(/@([\w.]+)/);
  return m?.[1] || String(raw || '').replace(/^https?:\/\//, '').slice(0, 80) || 'TikTok LIVE';
}

function saveBox(box) {
  const all = getBoxes();
  const existing = all.find(x => (x.id === box.id || x.url === box.url) && ['candidate', 'available'].includes(x.status));
  if (existing) return { duplicate: true, box: existing };
  all.unshift(box);
  if (!write(STORE.boxes, all.slice(0, Math.max(50, Number(settings().maxBoxes) || 400)))) {
    return { error: 'تعذر حفظ البيانات محلياً؛ تحقق من مساحة التخزين وإعدادات المتصفح.' };
  }
  return { duplicate: false, box };
}
function addManual({ host, url, ttl }) {
  const id = makeId(url || host);
  const result = saveBox({ id, host: host || 'بث TikTok', url, at: Date.now(), ttl: Math.min(180, Math.max(1, Number(ttl) || settings().ttl)) * 60000,
    status: 'available', source: 'manual', evidence: 'أضيف يدوياً', coins: 0, confirmed: false, tries: 0 });
  if (!result.duplicate) { log('manual', `تمت إضافة ${result.box.host}`); announce('📡 بث مضاف', result.box.host); }
  return result;
}

function expireAndWarn() {
  const s = settings(); if (!s.on) return;
  const all = getBoxes(); let changed = false;
  for (const b of all) {
    if (!['candidate', 'available'].includes(b.status)) continue;
    const left = Number(b.at) + Number(b.ttl) - Date.now();
    if (left <= 0) {
      const wasCandidate = b.status === 'candidate';
      b.status = 'expired'; changed = true;
      log('expire', `${wasCandidate ? 'انتهت صلاحية المرشح' : 'انتهى وقت'}: ${b.host}`);
      if (!wasCandidate) announce('⌛ انتهى الوقت', b.host);
    } else if (b.status === 'available' && left <= 180000 && !b.warned) {
      b.warned = true; changed = true;
      log('warning', `باقي أقل من 3 دقائق: ${b.host}`);
      announce('⏳ اقترب الانتهاء', `${b.host} — ${fmt(left)}`);
    }
  }
  if (changed) write(STORE.boxes, all);
}

// Radar API contract: GET configured endpoint; optional ?q=...&limit=50.
// JSON: { streams: [{ id?, host, url, live:true, rewardSignal:true, evidence?, ttlMinutes? }] }
// A stream is only surfaced as a candidate; the user must confirm it before countdown.
export async function radarSearch(query = '') {
  const endpoint = validEndpoint(settings().radarEndpoint);
  if (!endpoint) throw new Error('خاصك تضبط رابط Radar API ديال AZZOUZ backend أولاً.');
  const u = new URL(endpoint);
  if (query) u.searchParams.set('q', String(query).slice(0, 120));
  u.searchParams.set('limit', '50');
  const response = await fetch(u.href, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Radar API رجع HTTP ${response.status}`);
  const data = await response.json();
  const streams = data?.streams;
  if (!Array.isArray(streams)) throw new Error('صيغة Radar API غير صحيحة: خاص streams[].');
  let added = 0;
  for (const item of streams.slice(0, 100)) {
    if (!item || item.live !== true || item.rewardSignal !== true) continue;
    const url = makeTikTokUrl(item.url || (item.host ? `@${item.host}` : ''));
    if (!url || typeof item.id !== 'string' || !item.id.trim() || typeof item.evidence !== 'string' || !item.evidence.trim()) continue;
    const host = String(item.host || hostFrom(url)).slice(0, 80);
    const id = makeId(item.id);
    const result = saveBox({ id, host, url, at: Date.now(), ttl: Math.min(180, Math.max(1, Number(item.ttlMinutes) || settings().ttl)) * 60000,
      status: 'candidate', source: 'authorized-radar', evidence: item.evidence.slice(0, 300), coins: 0, confirmed: false, tries: 0 });
    if (result.error) throw new Error(result.error);
    if (result.error) throw new Error(result.error);
    if (!result.duplicate) { added++; log('candidate', `مرشح صندوق: ${host}`, { evidence: result.box.evidence }); }
  }
  LAST_RADAR_AT = Date.now();
  log('radar', `اكتمل البحث؛ نتائج جديدة: ${added}`);
  if (added) announce('🎁 مرشحو مكافآت', `تم العثور على ${added} بث/بثوث تحتاج التأكيد`);
  return { received: streams.length, added };
}
async function radarPoll() {
  const s = settings();
  if (!s.on || RADAR_BUSY || !validEndpoint(s.radarEndpoint)) return;
  RADAR_BUSY = true;
  try { await radarSearch(''); }
  catch (error) { log('radar-error', error.message); }
  finally { RADAR_BUSY = false; }
}

export function confirmCandidate(id) {
  const all = getBoxes(); const box = all.find(x => x.id === id && x.status === 'candidate');
  if (!box || Number(box.at) + Number(box.ttl) <= Date.now()) return false;
  box.status = 'available'; box.at = Date.now(); box.ttl = Math.min(180, Math.max(1, Number(box.ttl) / 60000 || settings().ttl)) * 60000;
  box.confirmedByUser = true; write(STORE.boxes, all);
  log('confirmed', `تم تأكيد المرشح يدوياً: ${box.host}`); announce('⏱️ بدأ العد التنازلي', box.host);
  render(ROOT); return true;
}
export function markCollected(id, coins = 0) {
  const all = getBoxes(); const box = all.find(x => x.id === id && x.status === 'available'); if (!box) return false;
  const amount = Math.max(0, Math.floor(Number(coins) || 0));
  box.status = 'collected'; box.coins = amount; box.confirmed = amount > 0; box.doneAt = Date.now();
  write(STORE.boxes, all); log('collected', `تسجيل جمع يدوي: ${box.host} — ${amount} عملة`);
  announce('✅ تم تسجيل الجمع', `${box.host}${amount ? ` — ${amount} عملة` : ''}`); render(ROOT); return true;
}
export function openLive(id) {
  const box = getBoxes().find(x => x.id === id && x.status === 'available'); if (!box?.url) return false;
  box.tries = (box.tries || 0) + 1; box.lastTry = Date.now();
  const all = getBoxes(); const index = all.findIndex(x => x.id === id); if (index >= 0) all[index] = box;
  write(STORE.boxes, all); log('open', `فتح البث يدوياً: ${box.host}`);
  // Explicit click opens a new tab; never auto-open tabs from background polling.
  window.open(box.url, '_blank', 'noopener,noreferrer'); return true;
}
export function markFailed(id) {
  const all = getBoxes(); const box = all.find(x => x.id === id && ['candidate', 'available'].includes(x.status)); if (!box) return false;
  box.status = 'expired'; box.failed = true; write(STORE.boxes, all);
  log('failed', `تعذر الجمع: ${box.host}`); render(ROOT); return true;
}

/* TikTok OAuth 2.0 + PKCE.
 * The backend must exchange the code, validate redirect_uri/verifier, keep secrets server-side,
 * and set an HttpOnly Secure SameSite cookie. The browser never stores access_token.
 */
function randomUrlSafe(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function tkUser() { return String(read(STORE.manual, '') || '').replace(/^@+/, '').trim(); }
export function tkSetUser(value) {
  const u = String(value || '').replace(/^@+/, '').replace(/[^A-Za-z0-9._]/g, '').trim();
  if (!u) { try { localStorage.removeItem(STORE.manual); } catch {} return ''; }
  write(STORE.manual, u); return u;
}
export function tkToken() {
  // Legacy API name retained for compatibility. This is connection metadata only,
  // never an OAuth access/refresh token.
  return read(STORE.auth, null);
}
export function tkStatus() {
  const session = tkToken();
  if (session?.connected) return {
    state: 'linked',
    label: 'آخر ربط ناجح؛ جلسة الخادم هي المرجع',
    profile: session.profile || null
  };
  const manual = tkUser();
  if (manual) return { state: 'linked', label: `@${manual} مربوط يدويا (بلا OAuth)`, profile: { username: manual }, manual: true };
  const key = settings().clientKey;
  return { state: key ? 'configured' : 'none', label: key ? 'Client Key مضبوط؛ الحساب غير مربوط' : 'مازال ما تضبطش الربط' };
}
function authTempGet(key) {
  try { return sessionStorage.getItem(key); } catch { return localStorage.getItem(key); }
}
function authTempSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { localStorage.setItem(key, value); }
}
function authTempRemove(key) {
  try { sessionStorage.removeItem(key); } catch {}
  try { localStorage.removeItem(key); } catch {}
}
function cleanOAuthParams(returnTo = '') {
  try {
    const current = new URL(location.href);
    current.searchParams.delete('code');
    current.searchParams.delete('state');
    current.searchParams.delete('error');
    current.searchParams.delete('error_description');
    const preserved = returnTo ? new URL(returnTo, location.origin) : current;
    // Keep the original app deep-link query (for example p=hunter), never OAuth credentials.
    const target = `${preserved.pathname}${preserved.search}${preserved.hash}`;
    history.replaceState({}, document.title, target);
  } catch {}
}
function clearOAuthTemp() {
  authTempRemove(STORE.verifier);
  authTempRemove(STORE.state);
  authTempRemove(STORE.redirect);
  authTempRemove(STORE.returnQuery);
}
export async function tkConnect() {
  const s = settings(); const clientKey = String(s.clientKey || '').trim();
  if (!clientKey) throw new Error('دخل TikTok Client Key في إعدادات Box Hunter.');
  if (!validEndpoint(s.authEndpoint)) throw new Error('ضبط OAuth backend endpoint أولاً.');
  const verifier = randomUrlSafe(48);
  const state = randomUrlSafe(24);
  const challenge = await pkceChallenge(verifier);
  const redirect = REGISTERED_REDIRECT;
  authTempSet(STORE.verifier, verifier);
  authTempSet(STORE.state, state);
  authTempSet(STORE.redirect, redirect);
  authTempSet(STORE.returnQuery, location.search || '');
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({
    client_key: clientKey,
    scope: 'user.info.basic',
    response_type: 'code',
    redirect_uri: redirect,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  }).toString();
  location.assign(u.href);
}
export async function tkDisconnect() {
  write(STORE.auth, null);
  clearOAuthTemp();
  const endpoint = validEndpoint(settings().authEndpoint);
  if (endpoint) {
    try {
      const response = await fetch(endpoint, { method: 'DELETE', credentials: 'include', headers: { Accept: 'application/json' } });
      if (!response.ok && response.status !== 204) throw new Error(`HTTP ${response.status}`);
      log('auth', 'تم فصل جلسة TikTok من الخادم.');
    } catch (error) {
      log('auth-error', `تعذر تأكيد فصل جلسة الخادم: ${error.message}`);
      throw new Error('تم مسح حالة الربط محلياً، لكن تعذر تأكيد فصل جلسة الخادم.');
    }
  } else {
    log('auth', 'تم مسح حالة الربط المحلية؛ لم يتم ضبط رابط الخادم لإبطال الجلسة.');
  }
}
export async function tkFinish() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const oauthError = params.get('error');
  if (oauthError) {
    log('auth-error', `رفض TikTok تسجيل الدخول: ${String(oauthError).slice(0, 120)}`);
    const returnQuery = authTempGet(STORE.returnQuery) || '';
    cleanOAuthParams(`${location.pathname}${returnQuery}`);
    clearOAuthTemp();
    return false;
  }
  if (!code) return false;

  const returnedState = params.get('state');
  const expectedState = authTempGet(STORE.state);
  const verifier = authTempGet(STORE.verifier);
  const redirect = authTempGet(STORE.redirect);
  const returnQuery = authTempGet(STORE.returnQuery) || '';

  if (!returnedState || !expectedState || returnedState !== expectedState || !verifier || !redirect) {
    log('auth-error', 'رفض OAuth: state/verifier غير صالح.');
    cleanOAuthParams(`${location.pathname}${returnQuery}`);
    clearOAuthTemp();
    return false;
  }

  const endpoint = validEndpoint(settings().authEndpoint);
  if (!endpoint) {
    log('auth-error', 'OAuth backend endpoint غير مضبوط.');
    cleanOAuthParams(`${location.pathname}${returnQuery}`);
    clearOAuthTemp();
    return false;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        action: 'exchange',
        code,
        code_verifier: verifier,
        redirect_uri: redirect,
        state: returnedState
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.connected !== true) {
      throw new Error(result.error_description || result.error || `HTTP ${response.status}`);
    }
    if (!write(STORE.auth, { connected: true, profile: result.profile || null, connectedAt: Date.now() })) {
      throw new Error('تعذر حفظ حالة الربط محلياً.');
    }
    log('auth', 'نجح ربط TikTok؛ التوكن محفوظ في جلسة backend الآمنة.');
    cleanOAuthParams(`${location.pathname}${returnQuery}`);
    clearOAuthTemp();
    return true;
  } catch (error) {
    log('auth-error', `فشل OAuth: ${String(error.message || 'خطأ غير معروف').slice(0, 200)}`);
    cleanOAuthParams(`${location.pathname}${returnQuery}`);
    clearOAuthTemp();
    return false;
  }
}

function card(box, now) {
  const left = box.at + box.ttl - now;
  const status = box.status === 'candidate' ? '<span class="bh-warn">● مرشح يحتاج التأكيد</span>' : box.status === 'available' ? '<span class="bh-live">● مؤكد / متاح</span>' : '';
  const controls = box.status === 'candidate'
    ? `<button class="bh-b" data-confirm="${safeText(box.id)}">تأكيد الصندوق وبدء العد</button>`
    : `<button class="bh-b" data-open="${safeText(box.id)}">فتح البث</button><button class="bh-b g" data-done="${safeText(box.id)}">تسجيل الجمع</button><button class="bh-b r" data-fail="${safeText(box.id)}">فشل</button>`;
  return `<article class="bh-row"><b>${safeText(box.host)}</b> ${status}<div class="bh-t">${box.status === 'candidate' ? 'الدليل: ' + safeText(box.evidence || 'إشارة رصد') : 'الوقت المتبقي: ' + fmt(left)} · ${safeText(box.source || '')}</div>${controls}</article>`;
}

export function render(root) {
  if (!root) return;
  ROOT = root;
  if (!document.getElementById('bh-style')) {
    const style = document.createElement('style'); style.id = 'bh-style';
    style.textContent = `
      .bh-wrap{background:linear-gradient(155deg,#0a0710,#171027 62%,#0b1724);border:1px solid #30234a;border-radius:15px;padding:13px;color:#eee8ff;font:13px/1.5 system-ui,sans-serif}
      .bh-hd{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.bh-hd b{font-size:16px;color:#c6a8ff}
      .bh-t{font-size:11px;color:#a99fc4}.bh-row{background:#150f22;border:1px solid #302348;border-radius:10px;padding:9px;margin-top:7px}
      .bh-actions{display:flex;gap:5px;flex-wrap:wrap;margin:8px 0}.bh-b{background:linear-gradient(90deg,#783cff,#238ee9);color:white;border:0;border-radius:8px;padding:8px 10px;font-size:12px;cursor:pointer;margin:3px 3px 0 0}
      .bh-b.g{background:#211833;border:1px solid #493567;color:#ded2ff}.bh-b.r{background:#321625;border:1px solid #65334d;color:#ffc2d4}
      .bh-in{box-sizing:border-box;width:100%;background:#100b19;border:1px solid #493567;color:#fff;border-radius:8px;padding:9px;margin:4px 0;font:inherit}
      .bh-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:9px 0}.bh-stat{background:#1b1329;border:1px solid #302348;border-radius:9px;padding:8px}.bh-stat b{display:block;color:#cbb4ff;font-size:17px}.bh-stat span{font-size:10px;color:#a99fc4}
      .bh-live{color:#59e8ad}.bh-warn{color:#ffd166}.bh-dead{color:#ff8181}.bh-toast{display:none;background:#291b3d;border:1px solid #a06bff;border-radius:8px;padding:8px;margin-top:7px}.bh-toast.show{display:block}
      .bh-log{max-height:145px;overflow:auto;font-size:11px;color:#b8adce}.bh-section{font-weight:700;color:#d7c7ff;margin-top:12px}.bh-settings{display:grid;grid-template-columns:1fr;gap:4px}
      @media(min-width:650px){.bh-settings{grid-template-columns:1fr 1fr}.bh-grid{grid-template-columns:repeat(6,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }
  expireAndWarn();
  const s = settings(); const all = getBoxes(); const now = Date.now();
  const candidates = all.filter(x => x.status === 'candidate');
  const available = all.filter(x => x.status === 'available' && x.at + x.ttl > now).sort((a,b) => a.at+a.ttl-b.at-b.ttl);
  const done = all.filter(x => x.status === 'collected'); const expired = all.filter(x => x.status === 'expired');
  const coins = done.reduce((sum, x) => sum + (x.confirmed ? Number(x.coins || 0) : 0), 0);
  const auth = tkStatus(); const need = read(STORE.needs, { n: 0 });
  root.innerHTML = `<div class="bh-wrap">
    <div class="bh-hd"><b>🎁 TikTok Box Hunter PRO v21</b><span class="bh-t">${s.silent ? '🔇 Silent Mode' : '🔔 الإشعارات العادية'} · ${s.on ? 'المراقبة مفعلة' : 'المراقبة متوقفة'}</span></div>
    <div class="bh-actions">
      <button class="bh-b g" id="bhSilent">${s.silent ? 'تشغيل الإشعارات' : 'تفعيل الهدوء'}</button>
      <button class="bh-b g" id="bhToggle">${s.on ? 'إيقاف المراقبة' : 'تشغيل المراقبة'}</button>
      <button class="bh-b r" id="bhStop">إيقاف فوري</button>
      <button class="bh-b" id="bhRadar">🔎 ابحث الآن</button>
      <button class="bh-b g" id="bhNotify">${s.notify ? 'الإشعارات مفعلة' : 'تفعيل إشعارات الجهاز'}</button>
      <button class="bh-b g" id="bhAuth">${auth.state === 'linked' ? 'الحساب مربوط' : 'ربط TikTok'}</button>
      ${auth.state === 'linked' ? '<button class="bh-b r" id="bhUnlink">فصل الحساب</button>' : ''}
    </div>
    <div class="bh-actions">
      <input class="bh-in" id="bhManualUser" value="${safeText(tkUser() || (new URLSearchParams(location.search).get('tk')||'').replace(/[@]/g,''))}" placeholder="اسم حساب TikTok بلا @" autocomplete="off" />
      <button class="bh-b g" id="bhManualBind">💾 ربط يدوي</button>
      ${tkUser() ? '<button class="bh-b r" id="bhManualClear">مسح الربط</button>' : ''}
    </div>
    <div class="bh-t">حالة الحساب: ${safeText(auth.label)}. جمع المكافآت يتم يدوياً. آخر فحص: ${LAST_RADAR_AT ? new Date(LAST_RADAR_AT).toLocaleTimeString('ar-MA') : 'لم يبدأ بعد'}.</div>
    <div class="bh-grid">
      <div class="bh-stat"><b>${all.length}</b><span>إجمالي السجلات</span></div><div class="bh-stat"><b>${candidates.length}</b><span>مرشحو المكافآت</span></div><div class="bh-stat"><b>${available.length}</b><span>متاحة بعد التأكيد</span></div><div class="bh-stat"><b>${done.length}</b><span>تم جمعها</span></div><div class="bh-stat"><b>${coins}</b><span>عملات مؤكدة</span></div><div class="bh-stat"><b>${expired.length}</b><span>منتهية / فاشلة</span></div>
    </div>
    <div class="bh-section">رادار البثوث</div>
    <input class="bh-in" id="bhQuery" placeholder="بحث اختياري عن حساب أو كلمة مفتاحية" />
    <div class="bh-t">الرادار يحتاج API endpoint موثوقاً من AZZOUZ backend؛ لا يتم فحص TikTok عبر مواقع وسيطة ولا اعتبار الكلمات دليلاً مؤكداً على وجود صندوق.</div>
    <div class="bh-section">إضافة بث يدوياً</div>
    <input class="bh-in" id="bhUrl" placeholder="رابط LIVE أو @اسم الحساب" />
    <input class="bh-in" id="bhTtl" type="number" min="1" max="180" value="${Number(s.ttl)}" placeholder="مدة الصندوق بالدقائق" />
    <button class="bh-b" id="bhAdd">إضافة البث</button>
    <div class="bh-section">الإعدادات والربط</div>
    <div class="bh-settings">
      <label class="bh-t">TikTok Client Key<input class="bh-in" id="bhClientKey" value="${safeText(s.clientKey)}" autocomplete="off" /></label>
      <label class="bh-t">OAuth Backend HTTPS URL<input class="bh-in" id="bhAuthEndpoint" value="${safeText(s.authEndpoint)}" placeholder="https://your-backend.example/auth" /></label>
      <label class="bh-t">Radar Backend HTTPS URL<input class="bh-in" id="bhRadarEndpoint" value="${safeText(s.radarEndpoint)}" placeholder="https://your-backend.example/radar" /></label>
      <label class="bh-t">مدة الفحص بالثواني<input class="bh-in" id="bhPoll" type="number" min="20" max="600" value="${Number(s.pollSeconds)}" /></label>
    </div>
    <div class="bh-actions"><button class="bh-b" id="bhSave">حفظ الإعدادات</button><button class="bh-b r" id="bhClear">مسح السجل والصناديق</button><button class="bh-b g" id="bhClearNeed">تصفير التنبيهات المعلقة (${Number(need.n || 0)})</button></div>
    <div id="bh-toast" class="bh-toast" role="status" aria-live="polite"></div>
    ${candidates.length ? '<div class="bh-section">مرشحو الصناديق — راجع الدليل وأكد يدوياً</div>' + candidates.map(b => card(b, now)).join('') : ''}
    ${available.length ? '<div class="bh-section">الصناديق المؤكدة حسب أقرب انتهاء</div>' + available.map(b => card(b, now)).join('') : ''}
    ${done.length ? '<div class="bh-section">آخر عمليات الجمع</div>' + done.slice(0,8).map(b => `<div class="bh-t">✓ ${safeText(b.host)} — ${b.confirmed ? `${b.coins} عملة مؤكدة` : 'تم التسجيل دون عدد مؤكد'}</div>`).join('') : ''}
    <div class="bh-section">آخر الأحداث</div><div class="bh-log">${getLogs().slice(0,20).map(x => `<div>${new Date(x.at).toLocaleTimeString('ar-MA')} — ${safeText(x.text)}</div>`).join('') || 'لا توجد أحداث بعد.'}</div>
  </div>`;

  const $ = selector => root.querySelector(selector);
  $('#bhSilent')?.addEventListener('click', () => { const x=settings(); x.silent=!x.silent; write(STORE.settings,x); log('settings', x.silent?'تم تفعيل Silent Mode':'تم إيقاف Silent Mode'); render(root); });
  $('#bhToggle')?.addEventListener('click', () => { const x=settings(); x.on=!x.on; write(STORE.settings,x); if(x.on) startWatcher(); else stopWatcher(); render(root); });
  $('#bhStop')?.addEventListener('click', () => { stopWatcher(); toast('تم إيقاف المراقبة.'); render(root); });
  $('#bhRadar')?.addEventListener('click', async () => { const button=$('#bhRadar'); button.disabled=true; button.textContent='جاري البحث…'; try { const result=await radarSearch($('#bhQuery')?.value || ''); toast(`انتهى البحث: ${result.added} نتيجة جديدة من ${result.received}.`); } catch(e) { toast(e.message); } finally { render(root); } });
  $('#bhAdd')?.addEventListener('click', () => { const raw=$('#bhUrl')?.value || ''; const url=makeTikTokUrl(raw); if(!url) return toast('أدخل رابط TikTok صحيحاً أو اسم حساب صالحاً.'); const result=addManual({host:hostFrom(raw),url,ttl:$('#bhTtl')?.value}); toast(result.duplicate?'هذا البث مسجل من قبل.':'تمت إضافة البث.'); render(root); });
  $('#bhSave')?.addEventListener('click', () => { const x=settings(); x.clientKey=$('#bhClientKey').value.trim(); x.authEndpoint=$('#bhAuthEndpoint').value.trim(); x.radarEndpoint=$('#bhRadarEndpoint').value.trim(); x.pollSeconds=Math.min(600,Math.max(20,Number($('#bhPoll').value)||45));
    if(x.authEndpoint && !validEndpoint(x.authEndpoint)) return toast('OAuth URL يجب أن يكون HTTPS صحيحاً.'); if(x.radarEndpoint && !validEndpoint(x.radarEndpoint)) return toast('Radar URL يجب أن يكون HTTPS صحيحاً.'); write(STORE.settings,x); log('settings','تم حفظ إعدادات الرادار والربط.'); toast('تم حفظ الإعدادات.'); render(root); });
  $('#bhNotify')?.addEventListener('click', async () => { if(!('Notification' in window)) return toast('المتصفح لا يدعم إشعارات الجهاز.'); const permission=await Notification.requestPermission(); const x=settings(); x.notify=permission==='granted'; x.silent=false; write(STORE.settings,x); render(root); });
  $('#bhManualBind')?.addEventListener('click', () => { const u = tkSetUser($('#bhManualUser')?.value || ''); toast(u ? `تم ربط @${u} يدويا.` : 'كتب اسم حساب TikTok.'); render(root); });
  $('#bhManualClear')?.addEventListener('click', () => { tkSetUser(''); toast('تم مسح الربط اليدوي.'); render(root); });
  $('#bhAuth')?.addEventListener('click', async () => { try { await tkConnect(); } catch(e) { toast(e.message); } });
  $('#bhUnlink')?.addEventListener('click', async () => {
    const button = $('#bhUnlink'); if (button) button.disabled = true;
    try { await tkDisconnect(); toast('تم طلب فصل حساب TikTok.'); }
    catch (error) { toast(error.message); }
    finally { render(root); }
  });
  $('#bhClear')?.addEventListener('click', () => { if(!confirm('هل تريد مسح كل الصناديق والسجل؟')) return; write(STORE.boxes,[]); write(STORE.logs,[]); render(root); });
  $('#bhClearNeed')?.addEventListener('click', () => { write(STORE.needs,{n:0}); render(root); });
  root.querySelectorAll('[data-confirm]').forEach(el=>el.addEventListener('click',()=>confirmCandidate(el.dataset.confirm)));
  root.querySelectorAll('[data-open]').forEach(el=>el.addEventListener('click',()=>openLive(el.dataset.open)));
  root.querySelectorAll('[data-done]').forEach(el=>el.addEventListener('click',()=>{ const value=prompt('عدد العملات المؤكدة (اتركه 0 إذا غير معروف):','0'); if(value!==null) markCollected(el.dataset.done, value); }));
  root.querySelectorAll('[data-fail]').forEach(el=>el.addEventListener('click',()=>markFailed(el.dataset.fail)));
}

export function stopWatcher() {
  if (TIMER) { clearInterval(TIMER); TIMER=null; }
  const s=settings(); s.on=false; write(STORE.settings,s); log('stop','توقفت المراقبة.');
}
export function startWatcher() {
  const s=settings(); s.on=true; write(STORE.settings,s);
  expireAndWarn();
  if (TIMER) clearInterval(TIMER);
  radarPoll();
  TIMER=setInterval(() => { expireAndWarn(); radarPoll(); if(ROOT?.isConnected) render(ROOT); }, Math.max(20,Number(s.pollSeconds)||45)*1000);
  log('start',`بدأت المراقبة؛ فحص كل ${s.pollSeconds} ثانية.`);
}

// Optional one-time startup helper for AZZOUZ AI. Call after mounting #paneHunter.
export async function initBoxHunter(root, { autoStart = true } = {}) {
  if (root) render(root);
  const callback = await tkFinish();
  if (callback && root) render(root);
  if (autoStart && settings().on) startWatcher();
  return { authCompleted: callback, status: tkStatus() };
}
