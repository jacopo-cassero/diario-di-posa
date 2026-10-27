// Service worker: fa funzionare l'app senza rete e riceve le notifiche.
const VERSIONE = 'ddp-v14';
const FILE = ['./', 'index.html', 'styles.css', 'app.js', 'store.js', 'logica.js', 'listino.js', 'pdf.js', 'pdf-metrics.js', 'documento.js', 'config.js', 'manifest.webmanifest',
  'icone/icona-192.png', 'icone/icona-512.png', 'icone/apple-touch-icon.png', 'icone/logo-cassero.jpg', 'icone/badge-posaclima.jpg', 'icone/badge-dekra.jpg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSIONE).then(c => Promise.all(FILE.map(f => c.add(f).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSIONE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// File dell'app: prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata.
// Librerie e font: prima la copia salvata.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const proprio = url.origin === location.origin;
  const statico = /cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (!proprio && !statico) return; // dati e file di Supabase: sempre dalla rete
  if (statico) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const c = res.clone(); caches.open(VERSIONE).then(x => x.put(req, c)); return res; })));
    return;
  }
  // cache: 'no-cache' chiede sempre al server se il file è cambiato, così gli aggiornamenti arrivano subito
  e.respondWith(fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then(res => {
    if (res.ok) { const c = res.clone(); caches.open(VERSIONE).then(x => x.put(req, c)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Diario di Posa', {
    body: d.body || 'Hai delle cose da fare.',
    icon: 'icone/icona-192.png',
    badge: 'icone/icona-192.png',
    tag: d.tag || 'promemoria',
    data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if (c.url.startsWith(self.registration.scope)) return c.focus();
    return self.clients.openWindow(url);
  }));
});
