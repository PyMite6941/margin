// Reading and writing files. Three backends, best one first:
//   1. the desktop app's native dialogs (window.desktop, see desktop/preload.cjs)
//   2. the browser File System Access API (Chrome, Edge): saves go back to the same file
//   3. a plain upload and download (Firefox, Safari)
// To support another file type, add its extension here and convert to or from text
// in openFile and saveFile.

const desktop = window.desktop;
const EXTENSIONS = ['md', 'markdown', 'txt'];
const PICKER_TYPES = [{ description: 'Text', accept: { 'text/plain': EXTENSIONS.map(e => `.${e}`) } }];
const DIALOG_FILTERS = [{ name: 'Text', extensions: EXTENSIONS }];
const handles = new Map();   // doc id -> browser file handle, for this session

const cancelled = err => err.name === 'AbortError';
export const isTextFile = file => file.type.startsWith('text/') || new RegExp(`\\.(${EXTENSIONS.join('|')})$`, 'i').test(file.name);
export const linkHandle = (id, handle) => { if (handle) handles.set(id, handle); };

function pickUpload(accept) {
  return new Promise(resolve => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.onchange = () => resolve(input.files[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function download(text, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

// Resolves to { text, name, path?, handle? }, or null if the user cancelled.
export async function openFile() {
  if (desktop) return desktop.open(DIALOG_FILTERS);
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES });
      const file = await handle.getFile();
      return { text: await file.text(), name: file.name, handle };
    } catch (err) {
      if (cancelled(err)) return null;
      throw err;
    }
  }
  const file = await pickUpload(EXTENSIONS.map(e => `.${e}`).join(','));
  return file && { text: await file.text(), name: file.name };
}

// Resolves to { name, path?, downloaded? }, or null if the user cancelled.
export async function saveFile(doc, suggestedName) {
  const name = doc.file || suggestedName;
  if (desktop) return desktop.save({ path: doc.path, name, text: doc.text, filters: DIALOG_FILTERS });
  let handle = handles.get(doc.id);
  if (!handle && window.showSaveFilePicker) {
    try {
      handle = await window.showSaveFilePicker({ suggestedName: name, types: PICKER_TYPES });
    } catch (err) {
      if (cancelled(err)) return null;
      throw err;
    }
    handles.set(doc.id, handle);
  }
  if (!handle) {
    download(doc.text, name);
    return { name, downloaded: true };
  }
  const out = await handle.createWritable();
  await out.write(doc.text);
  await out.close();
  return { name: handle.name };
}
