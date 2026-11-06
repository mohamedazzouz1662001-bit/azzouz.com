/* identity.mjs — هوية البحث: ID ثابت كيتزاد ويتوسع ملي كتسجل الدخول */

import { getSession, account } from './auth.mjs?v=3';

const ID_KEY = 'azzouz-search-id-v1';

function rand(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map(b => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 32]).join('');
}

export function baseId() {
  let id = '';
  try { id = localStorage.getItem(ID_KEY) || ''; } catch (e) {}
  if (!id) {
    id = 'AZ-' + rand(6);
    try { localStorage.setItem(ID_KEY, id); } catch (e) {}
  }
  return id;
}


const EMAIL_KEY = 'azzouz-email-id-v1';

export function emailIdentity() {
  try { return JSON.parse(localStorage.getItem(EMAIL_KEY) || 'null'); } catch (e) { return null; }
}

export function signInEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new Error('بريد ماشي صحيح');
  let h = 0;
  for (let k = 0; k < e.length; k++) h = (h * 31 + e.charCodeAt(k)) >>> 0;
  const id = 'AZ-' + h.toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  const d = { email: e, id, at: Date.now() };
  try { localStorage.setItem(EMAIL_KEY, JSON.stringify(d)); localStorage.setItem(ID_KEY, id); } catch (er) {}
  return d;
}

export function signOutEmail() {
  try { localStorage.removeItem(EMAIL_KEY); } catch (e) {}
}

export function profile() {
  const g = getSession();
  const gh = account('github');
  const cf = account('cloudflare');
  const em = emailIdentity();
  const email = g?.email || (em && em.email) || '';
  const signedIn = !!(g || gh || cf || em);
  const names = [];
  if (g) names.push('Google');
  if (gh) names.push('GitHub');
  if (cf) names.push('Cloudflare');
  if (em && !g) names.push('البريد');
  return {
    id: (em && em.id) || baseId(),
    email,
    name: g?.name || gh?.login || (em ? String(em.email).split('@')[0] : ''),
    signedIn,
    accounts: names,
    tier: signedIn ? 'max' : 'std',
    label: signedIn ? 'بحث موسع (حساب مربوط)' : 'بحث قياسي (بلا حساب)'
  };
}

// عمق البحث حسب الهوية: الحساب كيرفع السقف
export function depthTarget() {
  return profile().signedIn ? 4000 : 3000;
}

export function maxSerpExtra() {
  return profile().signedIn;
}
