import { useEffect, useRef } from 'react';
import { continueList, indent, wrap } from '../lib/editing.js';

// The textarea is uncontrolled on purpose: the browser owns its value, so native
// undo and the caret survive every keystroke. React only pushes text in when it differs.
export default function Editor({ doc, onChange, onCursor }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current.value !== doc.text) ref.current.value = doc.text;
  }, [doc.id, doc.text]);
  useEffect(() => { ref.current.scrollTop = 0; }, [doc.id]);

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

  return (
    <textarea
      id="ed" ref={ref} defaultValue={doc.text} spellCheck aria-label="Document text" placeholder="Start writing"
      onInput={e => { onChange(e.currentTarget.value); reportCursor(); }}
      onKeyDown={onKeyDown} onSelect={reportCursor}
    />
  );
}
