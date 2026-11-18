import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ask } from '../lib/ai.js';
import { autoPair, continueList, findNext, heading, indent, link, listify, matches, pattern, replace, replaceAll, replaceOne, unpair, wrap } from '../lib/editing.js';

const INDENT = { 2: '  ', 4: '    ', tab: '\t' };
const LISTS = { Digit7: 'number', Digit8: 'bullet', Digit9: 'task' };

// Find and replace. Enter and Shift+Enter step through matches; Esc closes.
// Aa matches case, W whole words only, .* regular expressions (replacements may use $1).
function FindBar({ ta, text, onClose, onCheckpoint }) {
  const [query, setQuery] = useState(() => {
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    return sel.includes('\n') ? '' : sel;
  });
  const [replacement, setReplacement] = useState('');
  const [opts, setOpts] = useState({ caseSens: false, word: false, regex: false });
  const [note, setNote] = useState('');
  const input = useRef(null);
  useEffect(() => { input.current.select(); }, []);

  const re = useMemo(() => pattern(query, opts), [query, opts]);
  const total = useMemo(() => (re ? matches(text, re).length : 0), [re, text]);
  const bad = Boolean(query) && !re;
  const report = hit => setNote(hit ? `${hit.at} of ${hit.total}` : 'No matches');
  const step = dir => re && report(findNext(ta, re, dir));
  const onKeyDown = e => {
    if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  };
  const flip = key => { setOpts(o => ({ ...o, [key]: !o[key] })); setNote(''); };
  const opt = (k, label, title) => <button className="opt" aria-pressed={opts[k]} onClick={() => flip(k)} title={title}>{label}</button>;

  return (
    <div id="find" role="search" onKeyDown={onKeyDown}>
      <input ref={input} autoFocus placeholder="Find" aria-label="Find" aria-invalid={bad} value={query} onChange={e => { setQuery(e.target.value); setNote(''); }} />
      {opt('caseSens', 'Aa', 'Match case')}
      {opt('word', 'W', 'Whole words only')}
      {opt('regex', '.*', 'Regular expression ($1 works in the replacement)')}
      <button onClick={() => step(-1)} title="Previous (Shift+Enter)" aria-label="Previous match">‹</button>
      <button onClick={() => step(1)} title="Next (Enter)" aria-label="Next match">›</button>
      <input placeholder="Replace with" aria-label="Replace with" value={replacement} onChange={e => setReplacement(e.target.value)} />
      <button disabled={!total} onClick={() => report(replaceOne(ta, re, replacement, opts.regex))}>Replace</button>
      <button disabled={!total} onClick={() => { onCheckpoint(); setNote(`Replaced ${replaceAll(ta, re, replacement, opts.regex)}`); }}>All</button>
      <span role="status">{bad ? 'Invalid pattern' : note || (query ? `${total >= 10000 ? '10000+' : total} found` : '')}</span>
      <button onClick={onClose} title="Close (Esc)" aria-label="Close find">×</button>
    </div>
  );
}

// One instruction to the user's own AI. It works on the selection, or the whole document
// when nothing is selected, and the reply replaces that text (Ctrl+Z undoes it).
function AiBar({ ta, cfg, onClose, onCheckpoint }) {
  const [instruction, setInstruction] = useState('');
  const [note, setNote] = useState('');
  const job = useRef(null);
  useEffect(() => () => job.current?.abort(), []);

  async function run() {
    if (!instruction.trim() || job.current) return;
    let from = ta.selectionStart, to = ta.selectionEnd;
    if (from === to) { from = 0; to = ta.value.length; }
    const text = ta.value.slice(from, to);
    job.current = new AbortController();
    setNote('Working…');
    try {
      const reply = await ask(cfg, instruction.trim(), text, job.current.signal);
      if (ta.value.slice(from, to) !== text) throw new Error('The text changed while waiting, so nothing was replaced');
      onCheckpoint();
      replace(ta, from, to, reply);
      ta.setSelectionRange(from, from + reply.length);
      onClose();
    } catch (err) {
      setNote(err.name === 'AbortError' ? 'Stopped' : err.message);
    } finally {
      job.current = null;
    }
  }
  const onKeyDown = e => {
    if (e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'Escape') { e.stopPropagation(); if (job.current) job.current.abort(); else onClose(); }
  };

  return (
    <div id="find" className="ai" role="dialog" aria-label="Ask AI" onKeyDown={onKeyDown}>
      <input autoFocus placeholder={ta.selectionStart === ta.selectionEnd ? 'What should happen to the document?' : 'What should happen to the selection?'} aria-label="Instruction" value={instruction} onChange={e => setInstruction(e.target.value)} />
      <button onClick={run}>Run</button>
      <span>{note}</span>
      <button onClick={onClose} title="Close (Esc)" aria-label="Close">×</button>
    </div>
  );
}

// The textarea is uncontrolled on purpose: the browser owns its value, so native
// undo and the caret survive every keystroke. React only pushes text in when it differs.
// Find and AI bars render into barSlot, a strip above the panes, so they never sit over a scrollbar.
export default function Editor({ taRef: ref, doc, mode, prefs, barSlot, onChange, onCursor, onCheckpoint, ai, asking, setAsking }) {
  const [finding, setFinding] = useState(false);
  const closeFind = () => { setFinding(false); ref.current.focus(); };
  const closeAsk = () => { setAsking(false); ref.current.focus(); };

  useEffect(() => {
    if (ref.current.value !== doc.text) ref.current.value = doc.text;
  }, [doc.id, doc.text]);
  useEffect(() => { ref.current.scrollTop = 0; }, [doc.id]);
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setAsking(false); setFinding(true); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  function onKeyDown(e) {
    const ta = ref.current, mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase(), plain = mod && !e.shiftKey && !e.altKey;
    if (e.nativeEvent.isComposing) return;
    if (key === 'tab' && !mod && !e.altKey) { e.preventDefault(); indent(ta, e.shiftKey, INDENT[prefs.indent]); }
    else if (key === 'enter' && !mod && !e.shiftKey && prefs.lists && continueList(ta)) e.preventDefault();
    else if (prefs.pairs && !mod && !e.altKey && e.key.length === 1 && autoPair(ta, e.key, mode)) e.preventDefault();
    else if (prefs.pairs && key === 'backspace' && !mod && unpair(ta)) e.preventDefault();
    else if (plain && key === 'k' && mode !== 'txt') { e.preventDefault(); link(ta, mode); }
    else if (mode !== 'md') return;
    else if (plain && key === 'b') { e.preventDefault(); wrap(ta, '**'); }
    else if (plain && key === 'i') { e.preventDefault(); wrap(ta, '*'); }
    else if (mod && e.shiftKey && !e.altKey && key === 'x') { e.preventDefault(); wrap(ta, '~~'); }
    else if (mod && e.shiftKey && !e.altKey && LISTS[e.code]) { e.preventDefault(); listify(ta, LISTS[e.code]); }
    // Ctrl+Alt is AltGr on some layouts; only act when the key really is a digit.
    else if (mod && e.altKey && /^[0-6]$/.test(e.key)) { e.preventDefault(); heading(ta, +e.key); }
  }

  function reportCursor() {
    const ta = ref.current, before = ta.value.slice(0, ta.selectionStart);
    onCursor({ line: before.split('\n').length, col: before.length - before.lastIndexOf('\n'), from: ta.selectionStart, to: ta.selectionEnd });
  }

  const bar = (finding && !asking && <FindBar ta={ref.current} text={doc.text} onClose={closeFind} onCheckpoint={onCheckpoint} />)
    || (asking && ai && <AiBar ta={ref.current} cfg={ai} onClose={closeAsk} onCheckpoint={onCheckpoint} />);
  return (<>
    {bar && barSlot && createPortal(bar, barSlot)}
    <textarea
      id="ed" ref={ref} defaultValue={doc.text} spellCheck={prefs.spell} wrap={prefs.wrap ? 'soft' : 'off'} aria-label="Document text" placeholder="Start writing"
      onInput={e => { onChange(e.currentTarget.value); reportCursor(); }}
      onKeyDown={onKeyDown} onSelect={reportCursor}
    />
  </>);
}
