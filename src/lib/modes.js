// Document modes. Each document is Markdown, HTML or plain text; the mode decides
// how the preview renders it and which file type Save writes.
// To add a mode, add it here and give it a preview branch in App.jsx.

export const MODES = {
  md: { label: 'Markdown', ext: 'md', extensions: ['md', 'markdown'], mime: 'text/markdown' },
  html: { label: 'HTML', ext: 'html', extensions: ['html', 'htm'], mime: 'text/html' },
  txt: { label: 'Plain text', ext: 'txt', extensions: ['txt'], mime: 'text/plain' },
};

export const ALL_EXTENSIONS = Object.values(MODES).flatMap(m => m.extensions);

export function modeFromName(name) {
  const ext = name?.match(/\.([^.]+)$/)?.[1].toLowerCase();
  return Object.keys(MODES).find(k => MODES[k].extensions.includes(ext));
}

export const modeOf = doc => doc.mode || modeFromName(doc.file) || 'md';

// Swap a file name's extension for the one the mode saves as.
export const withExt = (name, mode) => name.replace(/(\.[^./\\]+)?$/, `.${MODES[mode].ext}`);
