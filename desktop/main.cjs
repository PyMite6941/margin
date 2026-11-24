// Desktop shell. Serves the built web app from dist/ and gives it native open and save
// dialogs, plus what an installed app needs to sit in the taskbar or Dock: one window per
// app, files opened from the system, a jump list / Dock menu, recent documents, and on
// macOS a proper menu bar. Everything else lives in src/ and is shared with the web build.
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_ID = 'io.github.pymite6941.margin';   // same as build.appId in package.json
const DIST = path.join(__dirname, '..', 'dist');
const DEV_URL = process.env.DEV_URL;   // set to the Vite dev server address for live reload
const GUIDE = 'https://pymite6941.github.io/margin/docs/';
const TEXT_FILE = /\.(md|markdown|txt|html?)$/i;
const preload = path.join(__dirname, 'preload.cjs');
const granted = new Set();   // paths the user picked or opened; the page may only write to these
const mac = process.platform === 'darwin';

// Windows groups taskbar buttons and pinned shortcuts by this id. It has to match the id
// the installer gives the Start menu shortcut (electron-builder uses appId), or a pinned
// icon and the running window show up as two different buttons.
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// One Margin at a time: opening a file or "New document" from the taskbar while it is
// running goes to the window that is already open (see second-instance below), and this
// copy ends at once. app.quit() would wait for ready and open a second window first.
if (!app.requestSingleInstanceLock()) app.exit(0);

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function serve(request) {
  let file = path.join(DIST, decodeURIComponent(new URL(request.url).pathname));
  if (file.endsWith(path.sep)) file = path.join(file, 'index.html');
  if (file !== DIST && !file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 });
  return net.fetch(pathToFileURL(file).toString()).catch(() => new Response('Not found', { status: 404 }));
}

// Window size and position, remembered between launches.
const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const visible = screen.getAllDisplays().some(d => b.x < d.workArea.x + d.workArea.width - 80 && b.x + b.width > d.workArea.x + 80 && b.y >= d.workArea.y - 10 && b.y < d.workArea.y + d.workArea.height - 80);
    return visible ? b : { width: b.width, height: b.height, maximized: b.maximized };
  } catch { return { width: 1280, height: 820 }; }
}
function keepBounds(win) {
  const save = () => { try { fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })); } catch { /* not worth failing over */ } };
  win.on('close', save);
}

// Things for the page to do (open a file, new document, a menu command). They wait until
// the page says it is listening (launch:ready), so nothing sent during start-up is lost.
let win = null, listening = false;
const pending = [];
function deliver(action) {
  if (!app.isReady()) { pending.push(action); return; }
  if (!win) createWindow();
  if (listening) win.webContents.send('launch:action', action); else pending.push(action);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function openPath(file) {
  try {
    const full = path.resolve(file);
    if (!TEXT_FILE.test(full) || !fs.statSync(full).isFile()) return;
    granted.add(full);
    app.addRecentDocument(full);
    deliver({ kind: 'file', path: full, name: path.basename(full), text: fs.readFileSync(full, 'utf8') });
  } catch (err) {
    dialog.showErrorBox('Margin', `Could not open ${file}: ${err.message}`);
  }
}

// Files and --new from a command line: the first launch, or a second one forwarded here.
function handleArgs(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2);
  if (args.includes('--new')) deliver({ kind: 'new' });
  for (const a of args) if (!a.startsWith('-') && TEXT_FILE.test(a)) openPath(a);
}

// Margin's own pages: the built app, or the Vite server while developing. Only these may
// use the IPC handlers below or stay in a window; anything else opens in the system browser.
const ours = url => {
  try { const u = new URL(url); return (u.protocol === 'app:' && u.host === 'margin') || Boolean(DEV_URL && u.origin === new URL(DEV_URL).origin); }
  catch { return false; }
};
// Only web and mail links go to the system; file:, custom schemes and the like could run programs.
const openOutside = url => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); };
const fromUs = event => ours(event.senderFrame?.url || '');
const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
  if (!fromUs(event)) throw new Error('Not allowed');
  return fn(event, ...args);
});

// Every window: no navigating away from Margin (a dropped file, a stray link), since a page
// shown there would get window.desktop and with it the .env file.
app.on('web-contents-created', (e, contents) => {
  contents.on('will-navigate', (event, url) => { if (!ours(url)) { event.preventDefault(); openOutside(url); } });
  contents.on('will-redirect', (event, url) => { if (!ours(url)) event.preventDefault(); });
  contents.on('will-attach-webview', event => event.preventDefault());
});

function createWindow() {
  const b = loadBounds();
  win = new BrowserWindow({
    ...b, minWidth: 360, minHeight: 300, title: 'Margin', show: false, backgroundColor: '#fbfaf7',
    autoHideMenuBar: true, webPreferences: { preload },
    ...(process.platform === 'linux' && { icon: path.join(__dirname, '..', 'build', 'icon.png') }),
  });
  if (b.maximized) win.maximize();
  keepBounds(win);
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-start-navigation', (e) => { if (e.isMainFrame && !e.isSameDocument) listening = false; });
  win.on('closed', () => { win = null; listening = false; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (ours(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { preload } } };
    openOutside(url);
    return { action: 'deny' };
  });
  win.loadURL(DEV_URL || 'app://margin/');
}

handle('launch:ready', () => {
  listening = true;
  return pending.splice(0);
});

handle('file:open', async (event, filters) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { properties: ['openFile'], filters });
  if (result.canceled) return null;
  const file = result.filePaths[0];
  granted.add(file);
  app.addRecentDocument(file);
  return { path: file, name: path.basename(file), text: await fs.promises.readFile(file, 'utf8') };
});

handle('file:save', async (event, { path: wanted, name, text, filters }) => {
  let file = wanted;
  if (!granted.has(file)) {
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), { defaultPath: wanted || name, filters });
    if (result.canceled) return null;
    file = result.filePath;
    granted.add(file);
  }
  await fs.promises.writeFile(file, text, 'utf8');
  if (TEXT_FILE.test(file)) app.addRecentDocument(file);
  return { path: file, name: path.basename(file) };
});

// The AI accounts' .env file (src/lib/keys.js): one fixed file in the app's data folder, so the
// page can read and write it but no other path. Owner-only permissions on macOS and Linux.
const envFile = () => path.join(app.getPath('userData'), '.env');
let envWrites = Promise.resolve();
handle('env:read', async () => {
  const file = envFile();
  try { return { path: file, text: await fs.promises.readFile(file, 'utf8') }; }
  catch (err) { if (err.code === 'ENOENT') return { path: file, text: '' }; throw err; }
});
handle('env:write', async (event, text) => {
  if (typeof text !== 'string' || text.length > 1e6) throw new Error('Not a .env file');
  const file = envFile();
  // One write at a time, each to a new owner-only file renamed over the old one, so the file
  // is never half written and never readable by others, even for a moment.
  const write = envWrites.then(async () => {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await fs.promises.writeFile(temp, text, { encoding: 'utf8', mode: 0o600 });
    try { await fs.promises.rename(temp, file); }
    catch (err) { await fs.promises.rm(temp, { force: true }); throw err; }
  });
  envWrites = write.catch(() => {});
  await write;
  return { path: file };
});
handle('env:reveal', async () => {
  const file = envFile();
  if (fs.existsSync(file)) shell.showItemInFolder(file); else await shell.openPath(path.dirname(file));
});

// Used only by the optional AI feature (src/lib/ai.js), to reach the provider the user configured.
handle('net:request', async (event, { method, url, headers, body }) => {
  if (!/^https?:\/\//i.test(url)) throw new Error('Only http and https addresses are allowed');
  const res = await net.fetch(url, { method, headers, body });
  return { status: res.status, text: await res.text() };
});

// Right-click on the taskbar button (Windows) or the Dock icon (macOS): New document,
// plus recent files, which Windows fills from addRecentDocument.
function taskbarMenu() {
  if (process.platform === 'win32') {
    const task = {
      type: 'task', title: 'New document', description: 'Start a new document',
      program: process.execPath, args: app.isPackaged ? '--new' : `"${app.getAppPath()}" --new`,
      iconPath: process.execPath, iconIndex: 0,
    };
    // The Recent list needs Margin registered for .md files, which only the installer does.
    if (app.setJumpList([{ type: 'recent' }, { type: 'tasks', items: [task] }]) !== 'ok') app.setJumpList([{ type: 'tasks', items: [task] }]);
  }
  if (mac) app.dock.setMenu(Menu.buildFromTemplate([{ label: 'New Document', click: () => deliver({ kind: 'new' }) }]));
}

// macOS needs a menu bar: without an Edit menu, Cmd+C, Cmd+V and Cmd+Z do nothing.
// Windows and Linux get none, so Alt shortcuts reach the page instead of opening a menu.
function menuBar() {
  if (!mac) { Menu.setApplicationMenu(null); return; }
  const send = kind => () => deliver({ kind });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu', submenu: [
      { role: 'about' }, { type: 'separator' },
      { label: 'Settings…', accelerator: 'Cmd+,', click: send('settings') }, { type: 'separator' },
      { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
    ] },
    { label: 'File', submenu: [
      { label: 'New Document', accelerator: 'Cmd+N', click: send('new') },
      { label: 'Open…', accelerator: 'Cmd+O', click: send('open') },
      { role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments' }] },
      { type: 'separator' },
      { label: 'Save', accelerator: 'Cmd+S', click: send('save') },
      { label: 'Version History', accelerator: 'Cmd+Shift+H', click: send('history') },
      { type: 'separator' },
      { label: 'Print…', accelerator: 'Cmd+P', click: send('print') },
      { type: 'separator' }, { role: 'close' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Margin Guide', click: () => shell.openExternal(GUIDE) }] },
  ]));
}

// macOS hands over files (double-click, Open With, drop on the Dock icon) through this event,
// which can fire before the app is ready.
app.on('open-file', (event, file) => { event.preventDefault(); openPath(file); });
app.on('second-instance', (event, argv) => {
  handleArgs(argv);
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(() => {
  protocol.handle('app', serve);
  menuBar();
  taskbarMenu();
  createWindow();
  handleArgs(process.argv);
  app.on('activate', () => { if (!win) createWindow(); });
});
app.on('window-all-closed', () => { if (!mac) app.quit(); });
