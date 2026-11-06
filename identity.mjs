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

export function profile() {
  const g = getSession();
  const gh = account('github');
  const cf = account('cloudflare');
  const email = g?.email || '';
  const signedIn = !!(g || gh || cf);
  const names = [];
  if (g) names.push('Google');
  if (gh) names.push('GitHub');
  if (cf) names.push('Cloudflare');
  return {
    id: baseId(),
    email,
    name: g?.name || gh?.login || '',
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
