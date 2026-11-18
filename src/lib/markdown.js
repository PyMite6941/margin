// Small Markdown renderer. Covers what notes actually use: headings, emphasis,
// code, links, images, nested lists, task lists, tables, quotes and rules.
// No raw HTML (everything is escaped).
// md(text, { tasks: true }) makes task checkboxes clickable: each carries data-task,
// the source line it came from, so the preview can tick it in the text.

export const md = (() => {
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Only web, mail and relative links; blocks javascript: and friends.
  const safe = u => !/^\s*[a-z][a-z0-9+.-]*:/i.test(u) || /^(https?|mailto):/i.test(u);
  const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)/;
  const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
  const BLOCK = /^(#{1,6}\s|>|```)/;
  const SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
  const cells = row => row.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));

  function inline(s) {
    const code = [];
    return esc(s)
      .replace(/`([^`]+)`/g, (_, c) => `\0${code.push(c) - 1}\0`)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => safe(u) ? `<img alt="${alt}" src="${u}">` : m)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => safe(u) ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>` : m)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*/g, '$1<em>$2</em>')
      .replace(/(^|\W)_([^_\s](?:[^_]*[^_\s])?)_(?=\W|$)/g, '$1<em>$2</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/\0(\d+)\0/g, (_, i) => `<code>${code[i]}</code>`);
  }

  return function render(src, opts = {}, base = 0) {
    const lines = src.replace(/\r/g, '').split('\n');
    let out = '', i = 0, m;
    const isTable = k => lines[k].includes('|') && lines[k + 1]?.includes('|') && SEP.test(lines[k + 1]);

    const table = () => {
      const head = cells(lines[i]);
      const align = cells(lines[i + 1]).map(c => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : ''));
      const cell = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}>${inline(c)}</${tag}>`;
      out += `<table><thead><tr>${head.map((c, k) => cell('th', c, k)).join('')}</tr></thead><tbody>`;
      for (i += 2; i < lines.length && lines[i].trim() && lines[i].includes('|'); i++) {
        const row = cells(lines[i]);
        out += `<tr>${head.map((_, k) => cell('td', row[k] ?? '', k)).join('')}</tr>`;
      }
      out += '</tbody></table>';
    };

    const list = () => {
      const open = [];
      while (i < lines.length && !RULE.test(lines[i]) && (m = lines[i].match(LIST))) {
        const depth = m[1].replace(/\t/g, '  ').length, tag = /\d/.test(m[2]) ? 'ol' : 'ul';
        while (open.length && depth < open.at(-1).depth) out += `</li></${open.pop().tag}>`;
        if (!open.length || depth > open.at(-1).depth) { out += `<${tag}>`; open.push({ depth, tag }); }
        else out += '</li>';
        const task = m[3].match(/^\[([ xX])\]\s+(.*)/);
        out += task
          ? `<li class="task"><input type="checkbox"${opts.tasks ? ` data-task="${base + i}" title="Tick or untick"` : ' disabled'}${task[1] === ' ' ? '' : ' checked'}> ${inline(task[2])}`
          : `<li>${inline(m[3])}`;
        i++;
      }
      while (open.length) out += `</li></${open.pop().tag}>`;
    };

    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      if (l.startsWith('```')) {
        const buf = [];
        for (i++; i < lines.length && !lines[i].startsWith('```'); i++) buf.push(lines[i]);
        i++;
        out += `<pre><code>${esc(buf.join('\n'))}</code></pre>`;
      } else if ((m = l.match(/^(#{1,6})\s+(.*)/))) {
        out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; i++;
      } else if (RULE.test(l)) {
        out += '<hr>'; i++;
      } else if (l.startsWith('>')) {
        const buf = [], start = i;
        for (; i < lines.length && lines[i].startsWith('>'); i++) buf.push(lines[i].replace(/^>\s?/, ''));
        out += `<blockquote>${render(buf.join('\n'), opts, base + start)}</blockquote>`;
      } else if (LIST.test(l)) {
        list();
      } else if (isTable(i)) {
        table();
      } else {
        const buf = [];
        for (; i < lines.length && lines[i].trim() && !BLOCK.test(lines[i]) && !LIST.test(lines[i]) && !RULE.test(lines[i]) && !(buf.length && isTable(i)); i++) buf.push(inline(lines[i]));
        out += `<p>${buf.join('<br>')}</p>`;
      }
    }
    return out;
  };
})();
