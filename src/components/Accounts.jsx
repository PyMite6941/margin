import { useState } from 'react';
import { PLANS, SERVICES, serviceOf } from '../lib/ai.js';
import { accountName, count, limitUse, overLimit, usageOf } from '../lib/keys.js';

// Settings → AI: the accounts in the .env file (keys.js), what each has used, and which is in use.
// ring: { accounts, active, path, usage, autoSwitch, desktop, on* handlers } from App.

const BLANK = { name: '', service: 'openai', model: '', key: '', url: '', plan: 'payg', limit: null };

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

function Form({ start, taken, onSave, onCancel }) {
  const [a, setA] = useState(start);
  const set = (k, v) => setA(x => ({ ...x, [k]: v }));
  const service = serviceOf(a);
  const name = accountName(a.name);
  const clash = name !== start.name && taken.includes(name);
  const needsUrl = !service.url;
  const ok = name && !clash && a.model.trim() && (!needsUrl || a.url.trim());
  // Subscriptions and free tiers usually cap requests a day; pay as you go is counted in tokens.
  const [limit, setLimitDraft] = useState(start.limit || { count: '', unit: start.plan === 'payg' ? 'tokens' : 'requests', per: start.plan === 'payg' ? 'month' : 'day' });
  const setLimit = (k, v) => setLimitDraft(l => ({ ...l, [k]: v }));
  const pickService = s => {
    setA(x => ({ ...x, service: s, plan: SERVICES[s].plan, url: '' }));
    if (!limit.count) setLimitDraft({ count: '', unit: SERVICES[s].plan === 'payg' ? 'tokens' : 'requests', per: SERVICES[s].plan === 'payg' ? 'month' : 'day' });
  };
  const finished = () => ({ ...a, name, limit: +limit.count > 0 ? { ...limit, count: Math.floor(+limit.count) } : null });

  return (
    <form className="account-form" onSubmit={e => { e.preventDefault(); if (ok) onSave(finished(), start.name || null); }}>
      <label>Name <input autoFocus placeholder="Work, Personal, Copilot…" value={a.name} onChange={e => set('name', e.target.value)} /></label>
      {clash && <p className="hint warn">There is already an account called {name}.</p>}
      <label>Service
        <select value={a.service} onChange={e => pickService(e.target.value)}>
          {Object.entries(SERVICES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
      </label>
      {service.hint && <p className="hint">{service.hint}</p>}
      <label>Address <input type="url" required={needsUrl} placeholder={service.url || 'https://…/v1'} value={a.url} onChange={e => set('url', e.target.value)} /></label>
      <label>Model <input placeholder="The service's name for the model" value={a.model} onChange={e => set('model', e.target.value)} /></label>
      {service.models && <p className="hint"><a href={service.models} target="_blank" rel="noreferrer">{SERVICES[a.service].label.replace(/ \(.*/, '')} model list ↗</a></p>}
      {!service.local && <label>{service.credential || 'API key'} <input type="password" autoComplete="off" value={a.key} onChange={e => set('key', e.target.value)} /></label>}
      <label>Plan
        <select value={a.plan} onChange={e => set('plan', e.target.value)}>
          {Object.entries(PLANS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </label>
      <div className="limit">
        <span>Limit</span>
        <input type="number" min="0" placeholder="None" aria-label="Limit" value={limit.count} onChange={e => setLimit('count', e.target.value)} />
        <select aria-label="Counted in" value={limit.unit} onChange={e => setLimit('unit', e.target.value)}>
          <option value="requests">requests</option><option value="tokens">tokens</option>
        </select>
        <span>a</span>
        <select aria-label="Per" value={limit.per} onChange={e => setLimit('per', e.target.value)}>
          <option value="day">day</option><option value="month">month</option>
        </select>
      </div>
      <p className="hint">Set it to your plan's allowance, or a budget of your own. Margin counts what this account uses and treats it as used up at the limit.</p>
      <div className="row">
        <button className="btn" type="submit" disabled={!ok}>{start.name ? 'Save account' : 'Add account'}</button>
        <button className="btn" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function Accounts({ ring, onTest }) {
  const [editing, setEditing] = useState(null);   // null, BLANK for a new account, or an account
  const [tests, setTests] = useState({});
  const { accounts, active, usage } = ring;

  async function test(a) {
    setTests(t => ({ ...t, [a.name]: 'Testing…' }));
    try { const reply = await onTest(a); setTests(t => ({ ...t, [a.name]: `Connected: “${reply.trim().slice(0, 40)}”` })); }
    catch (err) { setTests(t => ({ ...t, [a.name]: `Failed: ${err.message}` })); }
  }

  return (
    <>
      <p className="hint">
        Optional, and off until you add an account. Use API keys, the allowance in a plan that includes API access (such as GitHub Models with a GitHub or Copilot plan), free tiers, or models on this computer.
        {' '}{ring.desktop
          ? <>Accounts are kept in <code>{ring.path || '.env'}</code> on this computer; you can edit that file yourself, and Margin rereads it when Settings opens.</>
          : <>Accounts are kept in this browser only, as a <code>.env</code> file you can download.</>}
        {' '}Each key is sent only to its own service.
      </p>

      {accounts.length > 0 && <ul className="accounts">
        {accounts.map(a => {
          const u = usageOf(usage, a.name), l = limitUse(usage, a), over = overLimit(usage, a);
          const recent = u.error && Date.now() - u.error.at < 864e5;
          return (
            <li key={a.name} className={a.name === active ? 'on' : undefined}>
              <label className="pick">
                <input type="radio" name="active-account" checked={a.name === active} onChange={() => ring.onActive(a.name)} />
                <strong>{a.name}</strong>
                <span className="dim">{serviceOf(a).label.replace(/ \(.*/, '')} · {a.model || 'no model'} · {PLANS[a.plan]}</span>
              </label>
              <span className="dim">
                {u.day.requests} today · {u.month.requests} this month · {count(u.month.tokens)} tokens this month
                {l && <> · limit {count(l.count)} {l.unit} a {l.per}</>}
              </span>
              {l && <meter min="0" max={l.count} value={Math.min(l.used, l.count)} low={l.count * 0.6} high={l.count * 0.85} optimum={0} title={`${l.used} of ${l.count} ${l.unit} this ${l.per}`} />}
              {over ? <span className="warn">Limit reached for this {l.per}</span>
                : recent && <span className="warn" title={u.error.message}>Error {ago(u.error.at)}: {u.error.message.slice(0, 90)}</span>}
              {!serviceOf(a).local && !a.key && <span className="warn">No key yet</span>}
              <span className="row">
                <button className="link" onClick={() => test(a)} disabled={!a.model}>Test</button>
                <button className="link" onClick={() => setEditing(a)}>Edit</button>
                <button className="link" onClick={() => ring.onRemove(a.name)}>Remove</button>
                {tests[a.name] && <span className="hint" role="status">{tests[a.name]}</span>}
              </span>
            </li>
          );
        })}
      </ul>}

      {editing
        ? <Form key={editing.name || 'new'} start={editing} taken={accounts.map(a => a.name)} onCancel={() => setEditing(null)} onSave={(a, previous) => { ring.onSave(a, previous); setEditing(null); }} />
        : <div className="row"><button className="btn" onClick={() => setEditing(BLANK)}>Add an account</button></div>}

      {accounts.length > 1 && (
        <label className="toggle">
          <input type="checkbox" checked={ring.autoSwitch} onChange={e => ring.onAutoSwitch(e.target.checked)} />
          <span>Switch accounts automatically<small>When the account in use reaches its limit, runs out of credit or allowance, is rate-limited or refused, the next account is tried, and becomes the one in use.</small></span>
        </label>
      )}

      <div className="row">
        {ring.desktop
          ? <button className="btn" onClick={ring.onReveal}>Show the .env file</button>
          : <button className="btn" disabled={!accounts.length} onClick={ring.onDownload}>Download .env</button>}
        <button className="btn" onClick={ring.onLoad}>Load accounts from a .env…</button>
      </div>
    </>
  );
}

