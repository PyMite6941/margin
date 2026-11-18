// A small .env reader and writer: NAME=value lines, # comments, optional "export " and quotes.
// Writing changes only the variables asked for and keeps every other line as it was, so a
// file the user edits by hand (or shares with other tools) is not reformatted.
const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

function unquote(raw) {
  const v = raw.trim();
  if (v.length > 1 && v[0] === '"' && v.at(-1) === '"') return v.slice(1, -1).replace(/\\(["\\n])/g, (m, c) => (c === 'n' ? '\n' : c));
  if (v.length > 1 && v[0] === "'" && v.at(-1) === "'") return v.slice(1, -1);
  return v.replace(/\s+#.*$/, '');   // an unquoted value ends at " #"
}

const quote = v => (/^[\w.\-/:+=@,]*$/.test(v) ? v : `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);

// { NAME: value }. A name set twice keeps its last value, as dotenv does.
export function parseEnv(text) {
  const vars = {};
  for (const line of (text || '').split(/\r?\n/)) {
    const m = line.match(LINE);
    if (m) vars[m[1]] = unquote(m[2]);
  }
  return vars;
}

// changes: { NAME: value }, where null removes the variable. New names go at the end.
export function updateEnv(text, changes) {
  const pending = new Map(Object.entries(changes));
  const written = new Set();
  const lines = (text || '').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  const out = [];
  for (const line of lines) {
    const name = line.match(LINE)?.[1];
    if (!name || !pending.has(name)) { out.push(line); continue; }
    if (written.has(name)) continue;   // a duplicate of a line already rewritten
    written.add(name);
    const value = pending.get(name);
    if (value != null) out.push(`${name}=${quote(String(value))}`);
  }
  for (const [name, value] of pending) if (!written.has(name) && value != null) out.push(`${name}=${quote(String(value))}`);
  return `${out.join('\n')}\n`;
}
