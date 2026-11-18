// Export a document as another kind of file: a standalone web page, or plain text
// with the Markdown or HTML markup taken out. Saving in the document's own type is files.js.
import { md } from './markdown.js';
import { tidy } from './tidy.js';

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const STYLE = `body { max-width: 42rem; margin: 3rem auto; padding: 0 1rem; font: 18px/1.65 Georgia, serif; color: #1f1d1a; background: #fff; }
h1, h2, h3 { line-height: 1.25; } a { color: #a8431a; } img { max-width: 100%; }
code { font: .88em ui-monospace, Consolas, monospace; background: #f1efea; padding: .1em .35em; border-radius: 4px; }
pre { background: #f1efea; padding: 12px 14px; border-radius: 8px; overflow-x: auto; } pre code { padding: 0; }
blockquote { margin-left: 0; padding-left: 1em; border-left: 3px solid #dedad2; color: #736e64; }
table { border-collapse: collapse; } th, td { border: 1px solid #dedad2; padding: 6px 10px; }
li.task { list-style: none; margin-left: -1.4em; }`;

// A complete .html file. HTML documents are already one and come back unchanged.
export function webPage(text, mode, title) {
  if (mode === 'html') return text;
  const body = mode === 'md' ? md(text) : `<pre>${esc(text)}</pre>`;
  return tidy(`<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n<style>\n${STYLE}\n</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`);
}

const ENTITIES = { nbsp: ' ', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", amp: '&' };

// Readable text with the markup removed.
export function plainExport(text, mode) {
  if (mode === 'md') {
    return text
      .replace(/^```.*$\n?/gm, '')
      .replace(/^(#{1,6})\s+/gm, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
      .replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
      .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1$2')
      .replace(/`([^`\n]+)`/g, '$1');
  }
  if (mode === 'html') {
    return `${text
      .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|section|article|header|footer|ul|ol|table|title)>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&(nbsp|lt|gt|quot|#39|apos|amp);/g, (_, e) => ENTITIES[e])
      .replace(/[ \t]+\n/g, '\n')
      .replace(/^[ \t]+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()}\n`;
  }
  return text;
}
