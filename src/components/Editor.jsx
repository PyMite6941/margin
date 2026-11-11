import { useEffect, useRef, useState } from 'react';
import { continueList, findNext, indent, replaceAll, replaceOne, wrap } from '../lib/editing.js';

// Find and replace. Enter and Shift+Enter step through matches; Esc closes.
function FindBar({ ta, onClose }) {
  const [query, setQuery] = useState(() => {
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    return sel.includes('\n') ? '' : sel;
  });
  const [replacement, setReplacement] = useState('');
  const [note, setNote] = useState('');
  const input = useRef(null);
  useEffect(() => { input.current.select(); }, []);

  const step = dir => setNote(findNext(ta, query, dir) ? '' : 'No matches');
  const onKeyDown = e => {
    if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  };

  return (
    <div id="find" role="search" onKeyDown={onKeyDown}>
      <input ref={input} autoFocus placeholder="Find" aria-label="Find" value={query} onChange={e => { setQuery(e.target.value); setNote(''); }} />
      <button onClick={() => step(-1)} title="Previous (Shift+Enter)" aria-label="Previous match">‹</button>
      <button onClick={() => step(1)} title="Next (Enter)" aria-label="Next match">›</button>
      <input placeholder="Replace with" aria-label="Replace with" value={replacement} onChange={e => setReplacement(e.target.value)} />
      <button onClick={() => setNote(replaceOne(ta, query, replacement) ? '' : 'No more matches')}>Replace</button>
      <button onClick={() => { const n = replaceAll(ta, query, replacement); setNote(n ? `Replaced ${n}` : 'No matches'); }}>All</button>
      <span>{note}</span>
      <button onClick={onClose} title="Close (Esc)" aria-label="Close find">×</button>
    </div>
  );
}

// The textarea is uncontrolled on purpose: the browser owns its value, so native
// undo and the caret survive every keystroke. React only pushes text in when it differs.
export default function Editor({ doc, onChange, onCursor }) {
  const ref = useRef(null);
  const [finding, setFinding] = useState(false);
  const closeFind = () => { setFinding(false); ref.current.focus(); };

  useEffect(() => {
    if (ref.current.value !== doc.text) ref.current.value = doc.text;
  }, [doc.id, doc.text]);
  useEffect(() => { ref.current.scrollTop = 0; }, [doc.id]);
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setFinding(true); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  function onKeyDown(e) {
    const ta = ref.current, mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (key === 'tab' && !mod && !e.altKey) { e.preventDefault(); indent(ta, e.shiftKey); }
    else if (key === 'enter' && !mod && !e.shiftKey && !e.nativeEvent.isComposing && continueList(ta)) e.preventDefault();
    else if (mod && key === 'b') { e.preventDefault(); wrap(ta, '**'); }
    else if (mod && key === 'i') { e.preventDefault(); wrap(ta, '*'); }
  }

  function reportCursor() {
    const ta = ref.current, before = ta.value.slice(0, ta.selectionStart);
    onCursor({ line: before.split('\n').length, col: before.length - before.lastIndexOf('\n') });
  }

  return (<>
    {finding && <FindBar ta={ref.current} onClose={closeFind} />}
    <textarea
      id="ed" ref={ref} defaultValue={doc.text} spellCheck aria-label="Document text" placeholder="Start writing"
      onInput={e => { onChange(e.currentTarget.value); reportCursor(); }}
      onKeyDown={onKeyDown} onSelect={reportCursor}
    />
  </>);
}
