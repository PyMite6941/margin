import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Editor from './components/Editor.jsx';
import History from './components/History.jsx';
import Menu from './components/Menu.jsx';
import Settings from './components/Settings.jsx';
import Sidebar from './components/Sidebar.jsx';
import { SERVICES, ask, loadAI, saveAI } from './lib/ai.js';
import { ENV_FILE, accountProblem, accountsIn, count as amount, forgetUsage, loadUsage, mergeAccounts, overLimit, readEnv, record, removeAccount, saveAccount, saveUsage, setActive, writeEnv } from './lib/keys.js';
import { goTo, replace, toggleTask } from './lib/editing.js';
import { plainExport, webPage } from './lib/exporting.js';
import { canWriteSilently, exportText, forgetHandle, grantPath, importText, isTextFile, linkHandle, openFile, saveFile } from './lib/files.js';
import { forget, loadHistory, renameVersion, saveHistory, snapshot } from './lib/history.js';
import { md } from './lib/markdown.js';
import { MODES, modeFromName, modeOf, withExt } from './lib/modes.js';
import { headings } from './lib/outline.js';
import { tidy } from './lib/tidy.js';
import { DEFAULT_PREFS, ensureLive, isLive, loadDocs, loadLastId, loadPrefs, newDoc, plainText, saveDocs, saveLastId, savePrefs, titleOf } from './lib/storage.js';

const VIEWS = ['write', 'split', 'read'];
const BACKUP = { label: 'Margin backup', ext: 'json', mime: 'application/json' };
const WEB_PAGE = { label: 'Web page', ext: 'html', mime: 'text/html' };
const TEXT = { label: 'Plain text', ext: 'txt', mime: 'text/plain' };
const baseName = doc => titleOf(doc).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'untitled';
const fileName = doc => `${baseName(doc)}.${MODES[modeOf(doc)].ext}`;
const count = text => (text.match(/\S+/g) || []).length;

function Preview({ doc, mode, show, onTask }) {
  const html = useMemo(() => (show && mode === 'md' ? md(doc.text, { tasks: true }) : ''), [show, mode, doc.text]);
  if (!show) return <article id="preview" />;
  // HTML runs in a sandbox with scripts off, so a document cannot reach the app or its storage.
  if (mode === 'html') return <article id="preview" className="html"><iframe title="HTML preview" sandbox="" srcDoc={doc.text} /></article>;
  if (mode === 'txt') return <article id="preview" className="plain">{doc.text}</article>;
  // Ticking a checkbox ticks the task in the text; the preview then re-renders from it.
  const onClick = e => {
    const box = e.target.closest('input[data-task]');
    if (box) { e.preventDefault(); onTask(+box.dataset.task); }
  };
  return <article id="preview" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

// Headings of the document; a click jumps to one. The one holding the caret is marked.
function Outline({ items, active, onJump }) {
  const top = Math.min(...items.map(h => h.level));
  return (
    <nav id="outline" aria-label="Outline">
      <strong>Outline</strong>
      {items.length ? items.map((h, k) => (
        <button key={k} className={k === active ? 'on' : undefined} style={{ '--lvl': h.level - top }} onClick={() => onJump(k)} title={h.text}>{h.text}</button>
      )) : <p className="hint">Headings show up here. In Markdown start a line with #, in HTML use &lt;h1&gt; to &lt;h6&gt;.</p>}
    </nav>
  );
}

export default function App() {
  const [docs, setDocs] = useState(loadDocs);
  const [id, setId] = useState(loadLastId);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [ai, setAI] = useState(loadAI);
  const [env, setEnv] = useState({ path: null, text: '' });   // the AI accounts' .env file (keys.js)
  const [usage, setUsage] = useState(loadUsage);
  const ring = useMemo(() => accountsIn(env.text), [env.text]);
  const [history, setHistory] = useState(loadHistory);
  const [focus, setFocus] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [settings, setSettings] = useState(false);
  const [versions, setVersions] = useState(false);
  const [asking, setAsking] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1, from: 0, to: 0 });
  const [note, setNote] = useState({ text: '' });
  const noteTimer = useRef(0);
  const ta = useRef(null);
  const [barSlot, setBarSlot] = useState(null);

  const live = useMemo(() => docs.filter(isLive), [docs]);
  const trash = useMemo(() => docs.filter(d => !isLive(d)), [docs]);
  // Fall back to the most recent document if the chosen one is gone.
  const doc = live.find(d => d.id === id) || live.reduce((a, b) => (b.updated > a.updated ? b : a));
  const mode = modeOf(doc);
  const words = useMemo(() => count(plainText(doc)), [doc.text, mode]);
  const selected = cursor.to > cursor.from ? count(doc.text.slice(cursor.from, cursor.to)) : 0;
  const account = ring.accounts.find(a => a.name === ring.active);
  const aiOn = Boolean(account?.model);
  const outlineOn = prefs.outline && (mode === 'md' || (mode === 'html' && prefs.view !== 'read'));
  const outline = useMemo(() => (outlineOn ? headings(doc.text, mode) : []), [outlineOn, doc.text, mode]);
  const activeHeading = outline.findLastIndex(h => h.index <= cursor.from);

  // opt: true keeps the message up; { label, run } adds a button (such as Undo) for a few seconds.
  function say(text, opt) {
    clearTimeout(noteTimer.current);
    setNote({ text, action: typeof opt === 'object' ? opt : null });
    if (text && opt !== true) noteTimer.current = setTimeout(() => setNote({ text: '' }), typeof opt === 'object' ? 8000 : 3000);
  }
  const setPref = (key, value) => setPrefs(p => ({ ...p, [key]: value }));
  const resetPrefs = () => setPrefs(p => ({ ...p, ...DEFAULT_PREFS }));
  const patch = (change, target = doc.id) => setDocs(all => all.map(d => (d.id === target ? { ...d, ...change } : d)));

  // Keep a version before anything replaces the text wholesale, so it can be got back.
  const checkpoint = name => setHistory(h => snapshot(h, { id: doc.id, text: ta.current?.value ?? doc.text }, { force: true, name }));

  function addDoc(text = '', extra) {
    const created = newDoc(text, extra);
    setDocs(all => [...all, created]);
    setId(created.id);
    return created;
  }
  // Deleting moves a document to the trash; the status bar offers Undo.
  function removeDoc(target) {
    if (prefs.confirmTrash && !confirm(`Move "${titleOf(target)}" to the trash?`)) return;
    setDocs(all => ensureLive(all.map(d => (d.id === target.id ? { ...d, trashed: Date.now(), pinned: undefined } : d))));
    say(`Moved "${titleOf(target)}" to the trash`, { label: 'Undo', run: () => restoreDoc(target.id) });
  }
  function restoreDoc(target) {
    setDocs(all => all.map(d => (d.id === target ? (({ trashed, ...rest }) => rest)(d) : d)));
    setId(target);
    say('Put back');
  }
  function purge(ids) {
    setDocs(all => ensureLive(all.filter(d => !ids.includes(d.id))));
    setHistory(h => forget(h, ids));
  }
  const togglePin = target => patch({ pinned: !target.pinned || undefined }, target.id);

  // Backup: every document in one JSON file.
  const storedBytes = useMemo(() => (settings ? new Blob([JSON.stringify(live)]).size : 0), [settings, live]);
  const historyBytes = useMemo(() => (settings ? new Blob([JSON.stringify(history)]).size : 0), [settings, history]);
  async function exportAll() {
    try {
      const name = await exportText(JSON.stringify({ app: 'margin', version: 1, exported: new Date().toISOString(), docs: live }, null, 2), `margin-backup-${new Date().toISOString().slice(0, 10)}.json`, BACKUP);
      if (name) say(`Exported ${live.length} documents to ${name}`);
    } catch (err) {
      say(`Could not export: ${err.message}`);
    }
  }
  async function importAll() {
    try {
      const text = await importText(BACKUP);
      if (text == null) return;
      const incoming = JSON.parse(text)?.docs;
      if (!Array.isArray(incoming)) throw new Error('that is not a Margin backup');
      const have = new Set(docs.map(d => d.text));
      const fresh = incoming.filter(d => typeof d?.text === 'string' && !d.trashed && !have.has(d.text))
        .map(d => newDoc(d.text, { mode: d.mode, file: d.file, pinned: d.pinned, updated: d.updated || Date.now(), created: d.created }));
      setDocs(all => [...all, ...fresh]);
      say(`Imported ${fresh.length} ${fresh.length === 1 ? 'document' : 'documents'}${incoming.length > fresh.length ? `, skipped ${incoming.length - fresh.length} already here` : ''}`);
    } catch (err) {
      say(`Could not import: ${err.message}`);
    }
  }
  function deleteAll() {
    if (!confirm(`Delete all ${docs.length} documents from this device, including the trash and version history? Files you saved are not touched. This cannot be undone.`)) return;
    setDocs([newDoc('', { mode: prefs.newMode })]);
    setHistory({});
    setSettings(false);
  }
  // Everything Margin keeps where it runs, before uninstalling or handing the device on:
  // documents, history, settings, AI accounts and keys, and in a browser the offline copy.
  // Only Margin's own storage, since the web version shares its site with other pages.
  async function removeEverything() {
    const where = window.desktop ? 'app' : 'browser';
    if (!confirm(`Remove everything Margin keeps in this ${where}: all documents, version history, settings, and AI accounts with their keys? Files you saved are not touched. This cannot be undone.`)) return;
    await (envQueue.current = envQueue.current.then(() => writeEnv('')).catch(() => {}));
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('margin.')) localStorage.removeItem(k); } catch { /* storage blocked */ }
    if (!window.desktop) {
      try {
        for (const reg of await navigator.serviceWorker?.getRegistrations() ?? []) if (new URL(reg.scope).pathname.startsWith(new URL('.', location.href).pathname)) await reg.unregister();
        for (const name of await caches.keys()) if (name.startsWith('margin-')) await caches.delete(name);
      } catch { /* no offline copy */ }
    }
    location.reload();
  }
  function clearHistory() {
    if (!confirm('Clear the version history of every document? The documents themselves are kept.')) return;
    setHistory({});
  }

  // AI accounts live in a .env file (keys.js). Changes rewrite it at once; Settings rereads it
  // when it opens, so edits made to the file by hand show up. envText is the latest text, so
  // two quick changes do not overwrite each other.
  const envText = useRef(null);
  async function reloadEnv() {
    try {
      const r = await readEnv();
      envText.current = r.text || '';
      setEnv({ path: r.path, text: envText.current });
      return envText.current;
    } catch (err) {
      say(`Could not read the .env file: ${err.message}`);
      return null;
    }
  }
  // Changes run one after another, each on the text the last one left.
  const envQueue = useRef(Promise.resolve());
  function changeEnv(edit) {
    const run = async () => {
      if (envText.current == null && (await reloadEnv()) == null) return;
      const text = edit(envText.current);
      envText.current = text;
      setEnv(e => ({ ...e, text }));
      try { const r = await writeEnv(text); if (r?.path) setEnv(e => ({ ...e, path: r.path })); }
      catch (err) { say(`Could not write the .env file: ${err.message}`, true); }
    };
    return (envQueue.current = envQueue.current.then(run, run));
  }

  // One AI request with the account in use. With automatic switching, a used-up or refused
  // account hands over to the next, which then becomes the one in use.
  async function askAI(instruction, text, signal, only) {
    const first = only || account;
    const order = only || !ai.autoSwitch ? [first] : [first, ...ring.accounts.filter(a => a !== first && a.model)];
    const reasons = [];   // why each account could not be used, for the message if none can
    for (const a of order) {
      if (!a) throw new Error('Add an AI account in Settings → AI');
      if (overLimit(usage, a) && !only) {
        reasons.push(`${a.name} has reached its limit of ${amount(a.limit.count)} ${a.limit.unit} a ${a.limit.per}.`);
        continue;
      }
      try {
        const reply = await ask(a, instruction, text, signal);
        setUsage(u => record(u, a.name, { tokens: reply.tokens }));
        if (a !== first) { changeEnv(t => setActive(t, a.name)); say(`${first.name} could not be used, so Margin switched to ${a.name}`); }
        return reply.text;
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        setUsage(u => record(u, a.name, { error: err.message }));
        if (only || !ai.autoSwitch || !accountProblem(err)) throw order.length > 1 ? Object.assign(new Error(`${a.name}: ${err.message}`), { status: err.status }) : err;
        reasons.push(`${a.name}: ${err.message}.`.replace(/\.\.$/, '.'));
      }
    }
    throw new Error(order.length > 1
      ? `No account could be used. ${reasons.join(' ')}`
      : `${reasons[0]} Pick another account or raise the limit in Settings → AI, or turn on automatic switching.`);
  }

  const accounts = {
    ...ring, path: env.path, usage, autoSwitch: ai.autoSwitch, desktop: Boolean(window.desktop?.env),
    onSave: (a, previous) => {
      changeEnv(t => saveAccount(t, a, previous));
      if (previous && previous !== a.name) setUsage(u => ({ ...forgetUsage(u, previous), ...(u[previous] && { [a.name]: u[previous] }) }));
    },
    onRemove: name => {
      if (!confirm(`Remove the ${name} account and its key from the .env file?`)) return;
      changeEnv(t => removeAccount(t, name));
      setUsage(u => forgetUsage(u, name));
    },
    onActive: name => changeEnv(t => setActive(t, name)),
    onAutoSwitch: on => setAI(c => ({ ...c, autoSwitch: on })),
    onReveal: () => window.desktop.env.reveal(),
    onDownload: async () => {
      try { const name = await exportText(envText.current || '', 'margin.env', ENV_FILE); if (name) say(`Saved ${name}. It holds your keys: keep it private.`); }
      catch (err) { say(`Could not save: ${err.message}`); }
    },
    onLoad: async () => {
      try {
        const text = await importText(ENV_FILE);
        if (text == null) return;
        let n = 0;
        await changeEnv(t => { const m = mergeAccounts(t, text); n = m.count; return m.text; });
        say(n ? `Loaded ${n} ${n === 1 ? 'account' : 'accounts'}` : 'That file has no Margin accounts in it');
      } catch (err) { say(`Could not load: ${err.message}`); }
    },
  };

  // Rewrite the whole document through the textarea so Ctrl+Z can undo it.
  const rewrite = text => replace(ta.current, 0, ta.current.value.length, text);
  const tidyDoc = () => { checkpoint(); rewrite(tidy(ta.current.value)); };

  // A new mode means a new file type, so the next Save asks where to put it.
  // Markdown that becomes HTML is converted, unless it already contains tags.
  function setMode(next) {
    forgetHandle(doc.id);
    if (mode === 'md' && next === 'html' && doc.text.trim() && !/<[a-z!][^>]*>/i.test(doc.text)) { checkpoint(); rewrite(tidy(md(doc.text))); }
    patch({ mode: next, file: doc.file && withExt(doc.file, next), path: undefined });
  }

  function restoreVersion(text) {
    flushSync(() => setVersions(false));   // the editor cannot take focus behind an open dialog
    checkpoint();
    rewrite(text);
    say('Restored that version. Ctrl+Z undoes it.');
  }
  function nameVersion(t, name) {
    if (t === 'now') { if (name) checkpoint(name); }
    else setHistory(h => renameVersion(h, doc.id, t, name));
  }
  function copyDoc(text = doc.text) {
    setVersions(false);
    addDoc(text, { mode });
    say('Opened a copy');
  }

  function jump(k) {
    if (prefs.view !== 'read') goTo(ta.current, outline[k].index);
    if (prefs.view !== 'write' && mode === 'md') document.querySelectorAll('#preview :is(h1, h2, h3, h4, h5, h6)')[k]?.scrollIntoView({ block: 'start' });
  }

  async function open() {
    try {
      const file = await openFile();
      if (!file) return;
      linkHandle(addDoc(file.text, { file: file.name, path: file.path, mode: modeFromName(file.name) || 'txt' }).id, file.handle);
    } catch (err) {
      say(`Could not open: ${err.message}`);
    }
  }
  // A file handed over by the system: double-click, Open With, the taskbar or Dock, or the
  // installed web app's file handler. One already in the list is switched to, not duplicated.
  function openFromSystem({ name, text, path, handle }) {
    const same = live.find(d => (path ? d.path === path : d.file === name && d.text === text));
    if (same) { setId(same.id); linkHandle(same.id, handle); }
    else linkHandle(addDoc(text, { file: name, path, mode: modeFromName(name) || 'txt' }).id, handle);
    grantPath(path);
  }
  async function save(quiet) {
    try {
      const saved = await saveFile(doc, fileName(doc));
      if (!saved) return;
      patch({ file: saved.name, path: saved.path, mode: modeFromName(saved.name) || mode });
      say(quiet ? `Written to ${saved.name}` : saved.downloaded ? `Downloaded ${saved.name}` : `Saved to ${saved.name}`);
    } catch (err) {
      say(`Could not save: ${err.message}`);
    }
  }
  async function exportAs(type) {
    try {
      const text = type === WEB_PAGE ? webPage(doc.text, mode, titleOf(doc)) : plainExport(doc.text, mode);
      const name = await exportText(text, `${baseName(doc)}.${type.ext}`, type);
      if (name) say(`Exported ${name}`);
    } catch (err) {
      say(`Could not export: ${err.message}`);
    }
  }

  const cycleView = () => setPref('view', VIEWS[(VIEWS.indexOf(prefs.view) + 1) % VIEWS.length]);
  const toggleSidebar = () => setPref('sidebar', !prefs.sidebar);
  const toggleOutline = () => setPref('outline', !prefs.outline);

  // Persist. Typing is debounced so a long document is not rewritten on every key.
  useEffect(() => {
    const t = setTimeout(() => { if (!saveDocs(docs)) say('Storage is full. Save this document to a file.', true); }, 300);
    return () => clearTimeout(t);
  }, [docs]);
  useEffect(() => {
    const t = setTimeout(() => { const kept = saveHistory(history); if (kept !== history) setHistory(kept); }, 1000);
    return () => clearTimeout(t);
  }, [history]);
  // Versions: the text as it was when the document was opened, then one every few minutes of editing.
  useEffect(() => { setHistory(h => snapshot(h, doc, { force: true })); }, [doc.id]);
  useEffect(() => {
    const t = setTimeout(() => setHistory(h => snapshot(h, live_.current.doc)), 3000);
    return () => clearTimeout(t);
  }, [doc.text]);
  // Keep saved files up to date: write back to the linked file a moment after typing stops.
  useEffect(() => {
    if (!prefs.autoWrite || !canWriteSilently(doc)) return;
    const t = setTimeout(() => live_.current.save(true), 1200);
    return () => clearTimeout(t);
  }, [doc.text, prefs.autoWrite]);
  useEffect(() => { saveLastId(doc.id); setCursor({ line: 1, col: 1, from: 0, to: 0 }); }, [doc.id]);
  useEffect(() => { saveAI(ai); }, [ai]);
  useEffect(() => { saveUsage(usage); }, [usage]);
  useEffect(() => {
    savePrefs(prefs);
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.font = prefs.font;
    root.style.setProperty('--size', `${prefs.size}px`);
    root.style.setProperty('--width', prefs.width);
    root.style.setProperty('--leading', prefs.leading);
  }, [prefs]);
  useEffect(() => { document.title = `${titleOf(doc)} · Margin`; }, [doc]);

  // Window-level behaviour. The handlers live in a ref so the listeners are attached once.
  const live_ = useRef({});
  live_.current = { doc, open, save, addDoc, openFromSystem, cycleView, toggleSidebar, toggleOutline, focus, aiOn, tidyDoc, mode, newMode: prefs.newMode };
  useEffect(() => {
    const onKey = e => {
      const a = live_.current, mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      const alt = e.altKey && !mod && !e.shiftKey && { KeyN: () => a.addDoc('', { mode: a.newMode }), KeyO: a.toggleOutline, KeyP: a.cycleView, KeyF: () => setFocus(f => !f), KeyL: a.toggleSidebar }[e.code];
      if (mod && !e.shiftKey && key === 's') { e.preventDefault(); a.save(); }
      else if (mod && !e.shiftKey && key === 'o') { e.preventDefault(); a.open(); }
      else if (mod && e.shiftKey && !e.altKey && key === 'h') { e.preventDefault(); setVersions(true); }
      else if (e.shiftKey && e.altKey && !mod && e.code === 'KeyF' && a.mode === 'html') { e.preventDefault(); a.tidyDoc(); }
      else if (mod && key === ',') { e.preventDefault(); setSettings(true); }
      else if (mod && key === 'j' && a.aiOn) { e.preventDefault(); setAsking(true); }
      else if (alt) { e.preventDefault(); alt(); }
      else if (key === 'escape' && a.focus) setFocus(false);
    };
    const onDrop = async e => {
      e.preventDefault();
      for (const file of e.dataTransfer.files) if (isTextFile(file)) live_.current.addDoc(await file.text(), { file: file.name, mode: modeFromName(file.name) || 'txt' });
    };
    const stop = e => e.preventDefault();
    const onStorage = e => { if (e.key === 'margin.docs') setDocs(loadDocs()); };   // another tab saved
    const beforePrint = () => flushSync(() => setPrinting(true));
    const afterPrint = () => setPrinting(false);
    const events = [['keydown', onKey], ['drop', onDrop], ['dragover', stop], ['storage', onStorage], ['beforeprint', beforePrint], ['afterprint', afterPrint]];
    for (const [name, fn] of events) addEventListener(name, fn);
    return () => { for (const [name, fn] of events) removeEventListener(name, fn); };
  }, []);

  const freeName = (t, base) => { const taken = accountsIn(t).accounts.map(a => a.name); let n = base, k = 1; while (taken.includes(n)) n = `${base}_${++k}`; return n; };

  // Load the AI accounts, and move a key saved by an older version (one account in
  // localStorage) into the .env file. The Java window adds window.desktop after the page has
  // started, so there it waits for desktop-ready rather than reading the browser copy.
  useEffect(() => {
    const load = async () => {
      const text = await reloadEnv();
      const { format, url, model, key, ...rest } = loadAI();
      if (text == null || !(model || key)) return;
      if (!accountsIn(text).accounts.some(a => a.key === key && a.model === model)) {
        const service = format === 'anthropic' ? (url && url !== SERVICES.anthropic.url ? 'custom-anthropic' : 'anthropic') : (url && url !== SERVICES.openai.url ? 'custom' : 'openai');
        await changeEnv(t => saveAccount(t, { name: freeName(t, 'MAIN'), service, model: model || '', key: key || '', url: url || '', plan: SERVICES[service].plan, limit: null }));
      }
      setAI(rest);
      saveAI(rest);
    };
    const javaWindow = !window.desktop && /JavaFX/.test(navigator.userAgent);
    if (!javaWindow) load();
    addEventListener('desktop-ready', load);
    return () => removeEventListener('desktop-ready', load);
  }, []);
  useEffect(() => { if (settings) envQueue.current = envQueue.current.then(reloadEnv); }, [settings]);

  // Requests from outside the page: the desktop shell (files opened from the system, New
  // document from the taskbar jump list or Dock, the macOS menu bar), or, for the installed
  // web app, its "New document" shortcut (?new) and files opened with it (launchQueue).
  useEffect(() => {
    const run = action => {
      const a = live_.current;
      if (action.kind === 'file') a.openFromSystem(action);
      else if (action.kind === 'new') a.addDoc('', { mode: a.newMode });
      else if (action.kind === 'open') a.open();
      else if (action.kind === 'save') a.save();
      else if (action.kind === 'settings') setSettings(true);
      else if (action.kind === 'history') setVersions(true);
      else if (action.kind === 'print') print();
    };
    if (window.desktop?.onAction) return window.desktop.onAction(run);
    if (new URLSearchParams(location.search).has('new')) {
      run({ kind: 'new' });
      window.history.replaceState(null, '', location.pathname);
    }
    window.launchQueue?.setConsumer(async ({ files }) => {
      for (const handle of files || []) {
        const file = await handle.getFile();
        if (isTextFile(file)) run({ kind: 'file', name: file.name, text: await file.text(), handle });
      }
    });
  }, []);

  const status = note.text || (focus ? 'Esc leaves focus mode' : doc.file ? `${doc.file} · autosaved here` : 'Autosaved on this device');
  const classes = [!prefs.sidebar && 'no-side', focus && 'focus'].filter(Boolean).join(' ');
  const chars = doc.text.length, details = `${chars} characters, ${chars - (doc.text.match(/\s/g) || []).length} without spaces, ${doc.text.split('\n').length} lines`;

  return (
    <div id="app" className={classes} data-view={prefs.view}>
      <Sidebar
        docs={live} trash={trash} sort={prefs.sort} currentId={doc.id} onNew={() => addDoc('', { mode: prefs.newMode })}
        onDelete={removeDoc} onPin={togglePin} onRestore={restoreDoc} onPurge={purge} onSettings={() => setSettings(true)}
        onPick={picked => { setId(picked); if (innerWidth <= 700) setPref('sidebar', false); }}
      />
      <main>
        <header id="bar">
          <button onClick={toggleSidebar} title="Document list (Alt+L)" aria-label="Toggle document list">&#9776;</button>
          {mode !== 'txt' && <button onClick={toggleOutline} aria-pressed={prefs.outline} title="Outline: the document's headings (Alt+O)">Outline</button>}
          <span className="grow" />
          <select id="mode" value={mode} onChange={e => setMode(e.target.value)} title="Document type" aria-label="Document type">
            {Object.entries(MODES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
          {mode === 'html' && <button onClick={tidyDoc} title="Indent the HTML tags (Shift+Alt+F)">Tidy</button>}
          {aiOn && <button onClick={() => setAsking(a => !a)} title={`Ask AI (Ctrl+J), using ${account.name}`}>AI</button>}
          <button onClick={open} title="Open a file (Ctrl+O)">Open</button>
          <button onClick={() => save()} title="Save to a file (Ctrl+S)">Save</button>
          <button onClick={cycleView} title="Switch view (Alt+P)">{prefs.view[0].toUpperCase() + prefs.view.slice(1)}</button>
          <button onClick={() => setFocus(true)} title="Focus mode (Alt+F)">Focus</button>
          <Menu label="⋯" title="More" items={[
            { label: 'Version history', keys: 'Ctrl+Shift+H', run: () => setVersions(true) },
            { label: 'Make a copy', run: () => copyDoc() },
            '-',
            { label: 'Export as web page (.html)', run: () => exportAs(WEB_PAGE) },
            mode !== 'txt' && { label: 'Export as plain text (.txt)', run: () => exportAs(TEXT) },
            { label: 'Print or save as PDF', keys: 'Ctrl+P', run: () => print() },
            '-',
            { label: 'Move to trash', run: () => removeDoc(doc) },
          ]} />
        </header>

        <div id="bars" ref={setBarSlot} />
        <div id="work">
          {outlineOn && <Outline items={outline} active={activeHeading} onJump={jump} />}
          <div id="panes">
            <Editor
              taRef={ta} doc={doc} mode={mode} prefs={prefs} barSlot={barSlot} onChange={text => patch({ text, updated: Date.now() })} onCursor={setCursor}
              onCheckpoint={() => checkpoint()} ai={aiOn ? askAI : null} asking={asking} setAsking={setAsking}
            />
            <Preview doc={doc} mode={mode} show={prefs.view !== 'write' || printing} onTask={line => toggleTask(ta.current, line)} />
          </div>
        </div>

        <footer id="status">
          <span title={details}>{selected ? `${selected} of ${words}` : words} {words === 1 ? 'word' : 'words'} · {Math.max(1, Math.round(words / 230))} min read</span>
          <span id="pos">Ln {cursor.line}, Col {cursor.col}</span>
          <span className="grow" />
          <span role="status">{status}</span>
          {note.action && <button className="link" onClick={() => { note.action.run(); }}>{note.action.label}</button>}
        </footer>
      </main>

      <Settings
        open={settings} onClose={() => setSettings(false)} prefs={prefs} setPref={setPref} onReset={resetPrefs}
        accounts={accounts} onTestAI={a => askAI('Reply with exactly one word: ready', 'ready', undefined, a)}
        backup={{ count: live.length, bytes: storedBytes, historyBytes, onExport: exportAll, onImport: importAll, onDeleteAll: deleteAll, onClearHistory: clearHistory, onRemoveEverything: removeEverything }}
      />
      <History
        open={versions} onClose={() => setVersions(false)} doc={doc} versions={history[doc.id] || []}
        onRestore={restoreVersion} onCopy={copyDoc} onName={nameVersion}
      />
    </div>
  );
}
