// Reading and writing files. Three backends, best one first:
//   1. the desktop app's native dialogs (window.desktop: desktop/preload.cjs for Electron,
//      java/src/margin/Margin.java for the Java window, which adds it after the page loads)
//   2. the browser File System Access API (Chrome, Edge): saves go back to the same file
//   3. a plain upload and download (Firefox, Safari)
// File types come from the document modes in modes.js; add new types there.
import { ALL_EXTENSIONS, MODES, modeOf } from './modes.js';

const dots = exts => exts.map(e => `.${e}`);
const OPEN_PICKER = [{ description: 'Documents', accept: { 'text/plain': dots(ALL_EXTENSIONS) } }];
const OPEN_FILTERS = [{ name: 'Documents', extensions: ALL_EXTENSIONS }];
const savePicker = m => [{ description: m.label, accept: { [m.mime]: dots(m.extensions) } }];
const saveFilters = m => [{ name: m.label, extensions: m.extensions }];
const handles = new Map();   // doc id -> browser file handle, for this session
const granted = new Set();   // desktop paths picked in a dialog this session; the shell writes these without asking

const cancelled = err => err.name === 'AbortError';
export const isTextFile = file => file.type.startsWith('text/') || new RegExp(`\\.(${ALL_EXTENSIONS.join('|')})$`, 'i').test(file.name);
export const linkHandle = (id, handle) => { if (handle) handles.set(id, handle); };
export const forgetHandle = id => handles.delete(id);
// True when Save would write straight to the document's file, with no dialog (for auto-write).
export const canWriteSilently = doc => handles.has(doc.id) || (Boolean(window.desktop) && granted.has(doc.path));
const remember = r => { if (r?.path) granted.add(r.path); return r; };
// A file the desktop shell opened for us (double-click, Open With, the Dock): Save may write to it.
export const grantPath = path => { if (path) granted.add(path); };

function pickUpload(accept) {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.onchange = () => resolve(input.files[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function download(text, name, mime) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

// Resolves to { text, name, path?, handle? }, or null if the user cancelled.
export async function openFile() {
  if (window.desktop) return remember(await window.desktop.open(OPEN_FILTERS));
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: OPEN_PICKER });
      const file = await handle.getFile();
      return { text: await file.text(), name: file.name, handle };
    } catch (err) {
      if (cancelled(err)) return null;
      throw err;
    }
  }
  const file = await pickUpload(dots(ALL_EXTENSIONS).join(','));
  return file && { text: await file.text(), name: file.name };
}

// Resolves to { name, path?, downloaded? }, or null if the user cancelled.
export async function saveFile(doc, suggestedName) {
  const name = doc.file || suggestedName, mode = MODES[modeOf(doc)];
  if (window.desktop) return remember(await window.desktop.save({ path: doc.path, name, text: doc.text, filters: saveFilters(mode) }));
  let handle = handles.get(doc.id);
  if (!handle && window.showSaveFilePicker) {
    try {
      handle = await window.showSaveFilePicker({ suggestedName: name, types: savePicker(mode) });
    } catch (err) {
      if (cancelled(err)) return null;
      throw err;
    }
    handles.set(doc.id, handle);
  }
  if (!handle) {
    download(doc.text, name, mode.mime);
    return { name, downloaded: true };
  }
  const out = await handle.createWritable();
  await out.write(doc.text);
  await out.close();
  return { name: handle.name };
}

// One-off files that are not documents, such as backups. type = { label, ext, mime }.
// Resolves to the name written, or null if the user cancelled.
export async function exportText(text, name, type) {
  if (window.desktop) return (await window.desktop.save({ name, text, filters: [{ name: type.label, extensions: [type.ext] }] }))?.name ?? null;
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: type.label, accept: { [type.mime]: [`.${type.ext}`] } }] });
      const out = await handle.createWritable();
      await out.write(text);
      await out.close();
      return handle.name;
    } catch (err) {
      if (cancelled(err)) return null;
      throw err;
    }
  }
  download(text, name, type.mime);
  return name;
}

// Resolves to the text of a file the user picks, or null.
export async function importText(type) {
  if (window.desktop) return (await window.desktop.open([{ name: type.label, extensions: [type.ext] }]))?.text ?? null;
  const file = await pickUpload(`.${type.ext},${type.mime}`);
  return file ? file.text() : null;
}
