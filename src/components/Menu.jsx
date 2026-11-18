import { useEffect, useRef, useState } from 'react';

// A small drop-down menu. items: [{ label, run, keys? }] or '-' for a divider; falsy items are skipped.
// It closes on a click elsewhere, on Esc, and after an item runs.
export default function Menu({ label, title, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = e => { if (!ref.current.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); ref.current.firstChild.focus(); } };
    addEventListener('pointerdown', away);
    ref.current.addEventListener('keydown', esc);
    ref.current.querySelector('[role="menuitem"]')?.focus();
    const node = ref.current;
    return () => { removeEventListener('pointerdown', away); node.removeEventListener('keydown', esc); };
  }, [open]);

  // Up and down arrows move between items, like a native menu.
  const onKeyDown = e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const all = [...ref.current.querySelectorAll('[role="menuitem"]')], k = all.indexOf(document.activeElement);
    all[(k + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus();
  };

  return (
    <div className="menu" ref={ref}>
      <button aria-haspopup="menu" aria-expanded={open} title={title} onClick={() => setOpen(o => !o)}>{label}</button>
      {open && (
        <div role="menu" onKeyDown={onKeyDown}>
          {items.filter(Boolean).map((it, i) => (it === '-' ? <hr key={i} /> : (
            <button key={it.label} role="menuitem" onClick={() => { setOpen(false); it.run(); }}>
              {it.label}{it.keys && <kbd>{it.keys}</kbd>}
            </button>
          )))}
        </div>
      )}
    </div>
  );
}
