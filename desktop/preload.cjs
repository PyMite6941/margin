// The only bridge between the page and the operating system.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  open: filters => ipcRenderer.invoke('file:open', filters),
  save: request => ipcRenderer.invoke('file:save', request),
  request: options => ipcRenderer.invoke('net:request', options),   // AI calls, free of browser CORS
  // The AI accounts' .env file in the app's data folder (src/lib/keys.js).
  env: {
    read: () => ipcRenderer.invoke('env:read'),
    write: text => ipcRenderer.invoke('env:write', text),
    reveal: () => ipcRenderer.invoke('env:reveal'),
  },
  // Files opened from the system, New document from the taskbar or Dock, macOS menu commands.
  // Returns a function that stops listening.
  onAction: handle => {
    const listener = (event, action) => handle(action);
    ipcRenderer.on('launch:action', listener);
    ipcRenderer.invoke('launch:ready').then(waiting => waiting.forEach(handle));
    return () => ipcRenderer.off('launch:action', listener);
  },
});
