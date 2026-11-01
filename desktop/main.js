// Diario di Posa per Windows e Mac: apre l'app di sempre in una finestra sua.
// I contenuti arrivano dal sito, quindi ogni aggiornamento dell'app è subito anche qui.
const { app, BrowserWindow, shell, Menu, session } = require('electron');

const SITO = 'https://jacopo-cassero.github.io/diario-di-posa/';
const nostro = u => u.startsWith(SITO) || u.startsWith('https://jacopo-cassero.github.io/diario-di-posa');

// una sola finestra: se riapri l'app torna su quella aperta
if (!app.requestSingleInstanceLock()) app.quit();

function crea() {
  const win = new BrowserWindow({
    width: 1200, height: 860, minWidth: 380, minHeight: 600,
    title: 'Diario di Posa', backgroundColor: '#000000', show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(SITO);

  // collegamenti esterni (mappe, WhatsApp, email, telefono, PDF firmati): nel programma giusto del computer
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:') || nostro(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true } };
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (nostro(url) || url.startsWith('https://uolcdcvszeeaeoviovjb.supabase.co')) return;
    e.preventDefault(); shell.openExternal(url);
  });
  // F5 o Ctrl/Cmd+R per ricaricare, Ctrl/Cmd +/- per lo zoom
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const mod = i.control || i.meta;
    if (i.key === 'F5' || (mod && i.key.toLowerCase() === 'r')) { win.webContents.reload(); e.preventDefault(); }
    else if (mod && (i.key === '+' || i.key === '=')) { win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5); e.preventDefault(); }
    else if (mod && i.key === '-') { win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5); e.preventDefault(); }
    else if (mod && i.key === '0') { win.webContents.setZoomLevel(0); e.preventDefault(); }
  });
  // se manca la rete all'avvio, riprova da solo
  win.webContents.on('did-fail-load', (_e, code) => { if (code !== -3) setTimeout(() => win.loadURL(SITO), 4000); });
  return win;
}

app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });

app.whenReady().then(() => {
  // notifiche, fotocamera e posizione: consentite solo al Diario di Posa
  session.defaultSession.setPermissionRequestHandler((wc, perm, ok) => ok(nostro(wc.getURL()) && ['notifications', 'media', 'clipboard-sanitized-write', 'fullscreen'].includes(perm)));
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' }, { role: 'editMenu' },
      { label: 'Vista', submenu: [{ role: 'reload', label: 'Aggiorna' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
    ]));
  } else Menu.setApplicationMenu(null);
  crea();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) crea(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
