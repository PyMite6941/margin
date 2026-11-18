// AI accounts, kept in a .env file, and how much each one has been used.
//   Desktop apps: a real file in the app's data folder (window.desktop.env, see desktop/main.cjs
//                 and java/src/margin/Margin.java). It can be edited by hand; Settings rereads it.
//   Browser:      the same .env text, kept in this browser, with buttons to download or load it.
// One block per account, named by its last part (WORK here):
//   MARGIN_AI_ACTIVE=WORK                        the account in use
//   MARGIN_AI_SERVICE_WORK=github                a key of SERVICES in ai.js
//   MARGIN_AI_MODEL_WORK=openai/gpt-4.1
//   MARGIN_AI_KEY_WORK=github_pat_...            API key or token; none for local models
//   MARGIN_AI_URL_WORK=https://...               only when it differs from the service's
//   MARGIN_AI_PLAN_WORK=subscription             payg, subscription, free or local
//   MARGIN_AI_LIMIT_WORK=150 requests/day        optional: requests or tokens, per day or month
// Usage (requests and tokens per account, today and this month) is not secret: localStorage.
import { PLANS, SERVICES } from './ai.js';
import { parseEnv, updateEnv } from './env.js';

const FIELDS = ['SERVICE', 'MODEL', 'KEY', 'URL', 'PLAN', 'LIMIT'];
const VAR = new RegExp(`^MARGIN_AI_(${FIELDS.join('|')})_([A-Z0-9_]+)$`);
const ACTIVE = 'MARGIN_AI_ACTIVE';
const LOCAL_ENV = 'margin.ai.env', USAGE = 'margin.ai.usage';
const HEADER = `# Margin's AI accounts. Kept on this computer only; each key is sent only to its account's address.
# Edit here or in Margin's Settings → AI. Fields per account: SERVICE, MODEL, KEY, URL, PLAN, LIMIT.
`;
export const ENV_FILE = { label: 'Environment file', ext: 'env', mime: 'text/plain' };

// Names become part of a variable name: letters, digits and _ only.
export const accountName = text => text.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export async function readEnv() {
  if (window.desktop?.env) return window.desktop.env.read();   // { path, text }
  try { return { path: null, text: localStorage.getItem(LOCAL_ENV) || '' }; } catch { return { path: null, text: '' }; }
}
export async function writeEnv(text) {
  if (window.desktop?.env) return window.desktop.env.write(text);   // { path }
  localStorage.setItem(LOCAL_ENV, text);
  return { path: null };
}

// "150 requests/day", "2M tokens/month", "500 requests a month". A bare number is tokens a month.
export function parseLimit(text) {
  const m = String(text || '').trim().match(/^([\d.,_]+)\s*([km])?\s*(requests?|tokens?)?\s*(?:\/|per|an?|each)?\s*(day|month)?$/i);
  if (!m) return null;
  const count = Math.floor(parseFloat(m[1].replace(/[,_]/g, '')) * ({ k: 1e3, m: 1e6 }[m[2]?.toLowerCase()] || 1));
  if (!(count > 0)) return null;
  return { count, unit: /^r/i.test(m[3] || '') ? 'requests' : 'tokens', per: (m[4] || 'month').toLowerCase() };
}
export const formatLimit = l => (l ? `${l.count} ${l.unit}/${l.per}` : '');

// { accounts: [{ name, service, model, key, url, plan, limit }], active }, in file order.
export function accountsIn(text) {
  const vars = parseEnv(text);
  const found = new Map();
  for (const [v, value] of Object.entries(vars)) {
    const m = v.match(VAR);
    if (!m) continue;
    if (!found.has(m[2])) found.set(m[2], {});
    found.get(m[2])[m[1].toLowerCase()] = value;
  }
  const accounts = [...found].map(([name, a]) => {
    const service = SERVICES[a.service] ? a.service : a.url ? 'custom' : 'openai';
    return { name, service, model: a.model || '', key: a.key || '', url: a.url || '', plan: PLANS[a.plan] ? a.plan : SERVICES[service].plan, limit: parseLimit(a.limit) };
  });
  const active = accounts.some(a => a.name === vars[ACTIVE]) ? vars[ACTIVE] : accounts[0]?.name || '';
  return { accounts, active };
}

const start = text => (text?.trim() ? text : HEADER);
// Writes one account (new or changed). previous: its old name, when it was renamed.
export function saveAccount(text, a, previous) {
  const { accounts, active } = accountsIn(text);
  let out = start(text);
  if (previous && previous !== a.name) out = removeAccount(out, previous);
  const url = a.url.trim() && a.url.trim() !== SERVICES[a.service]?.url ? a.url.trim() : null;
  out = updateEnv(out, {
    [`MARGIN_AI_SERVICE_${a.name}`]: a.service, [`MARGIN_AI_MODEL_${a.name}`]: a.model.trim() || null,
    [`MARGIN_AI_KEY_${a.name}`]: a.key.trim() || null, [`MARGIN_AI_URL_${a.name}`]: url,
    [`MARGIN_AI_PLAN_${a.name}`]: a.plan, [`MARGIN_AI_LIMIT_${a.name}`]: formatLimit(a.limit) || null,
  });
  const first = !accounts.some(x => x.name !== previous);
  return first || active === previous ? setActive(out, a.name) : out;
}
export const removeAccount = (text, name) => updateEnv(text, {
  ...Object.fromEntries(FIELDS.map(f => [`MARGIN_AI_${f}_${name}`, null])),
  ...(parseEnv(text)[ACTIVE] === name ? { [ACTIVE]: null } : {}),
});
export const setActive = (text, name) => updateEnv(text, { [ACTIVE]: name });
// Accounts from another .env (a download from the browser version, say) added to this one.
export function mergeAccounts(text, other) {
  const { accounts } = accountsIn(other);
  return { text: accounts.reduce((out, a) => saveAccount(out, a), text), count: accounts.length };
}

// Usage, counted per UTC day and month (when most services reset their limits).
const today = () => new Date().toISOString().slice(0, 10);
const ZERO = { requests: 0, tokens: 0 };
export function loadUsage() { try { return JSON.parse(localStorage.getItem(USAGE)) || {}; } catch { return {}; } }
export function saveUsage(usage) { try { localStorage.setItem(USAGE, JSON.stringify(usage)); } catch { /* storage full or blocked */ } }
// { day, month, error, lastUsed } with counts that are still current.
export function usageOf(usage, name) {
  const u = usage[name] || {}, d = today();
  return { day: u.date === d ? u.day : ZERO, month: u.date?.slice(0, 7) === d.slice(0, 7) ? u.month : ZERO, error: u.error ?? null, lastUsed: u.lastUsed ?? 0 };
}
export function record(usage, name, { tokens = 0, error = null }) {
  const u = usageOf(usage, name), n = error ? 0 : 1;
  const add = c => ({ requests: c.requests + n, tokens: c.tokens + tokens });
  return { ...usage, [name]: { date: today(), day: add(u.day), month: add(u.month), lastUsed: Date.now(), error: error ? { at: Date.now(), message: error } : null } };
}
export const forgetUsage = (usage, name) => { const { [name]: gone, ...rest } = usage; return rest; };
// How far into its limit an account is: { used, count, unit, per } or null without a limit.
export function limitUse(usage, a) {
  if (!a.limit) return null;
  const c = usageOf(usage, a.name)[a.limit.per];
  return { ...a.limit, used: a.limit.unit === 'requests' ? c.requests : c.tokens };
}
export const overLimit = (usage, a) => { const l = limitUse(usage, a); return Boolean(l && l.used >= l.count); };

// The service says this account is out of credit or allowance, rate-limited, or not
// accepted: worth trying the next one. Anything else (a typo in a prompt) would fail anywhere.
export const accountProblem = err => [401, 402, 403, 429].includes(err.status) || /quota|credit|billing|balance|rate.?limit|insufficient|exceeded|too many requests/i.test(err.message);

export const count = n => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n));
