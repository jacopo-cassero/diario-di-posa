// Controllo del mattino: per ogni utente con le notifiche attive calcola le cose da fare
// e manda una notifica ai suoi dispositivi. Gira su GitHub Actions ogni giorno.
import webpush from 'web-push';
import { promemoria, oggi } from '../logica.js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY })) {
  if (!v) { console.error(`Manca il segreto ${k} nelle impostazioni del repository.`); process.exit(1); }
}
webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:diario@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const base = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1';
const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
async function get(path) {
  const r = await fetch(base + path, { headers });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
async function del(path) { await fetch(base + path, { method: 'DELETE', headers }); }

const forza = process.argv.includes('--prova');
const today = oggi();
const subs = await get('/push_subscriptions?select=endpoint,user_id,subscription');
const users = [...new Set(subs.map(s => s.user_id))];
console.log(`${today}: ${subs.length} dispositivi, ${users.length} utenti`);

for (const uid of users) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${base}/records?user_id=eq.${uid}&deleted=eq.false&select=kind,id,data`, { headers: { ...headers, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const page = await r.json(); rows.push(...page);
    if (page.length < 1000) break;
  }
  const S = { lavori: [], interventi: [], movimenti: [], magazzino: [], furgone: {} };
  for (const r of rows) {
    if (r.kind === 'cfg') { if (r.id === 'furgone') S.furgone = r.data; }
    else if (S[r.kind]) S[r.kind].push({ id: r.id, ...r.data });
  }
  const todo = promemoria(S, today);
  if (!todo.length && !forza) { console.log('Niente da segnalare per un utente'); continue; }
  const urgenti = todo.filter(t => t.lvl === 'bad').length;
  const payload = JSON.stringify({
    title: todo.length ? `Diario di Posa · ${todo.length} ${todo.length === 1 ? 'cosa da fare' : 'cose da fare'}${urgenti ? ' (' + urgenti + ' urgenti)' : ''}` : 'Diario di Posa · notifiche attive',
    body: todo.length ? todo.slice(0, 5).map(t => '• ' + t.txt).join('\n') : 'Le notifiche funzionano. Ogni mattina ti scrivo solo se c\'è qualcosa da fare.',
    url: './#cal',
    tag: 'promemoria-' + today,
  });
  for (const s of subs.filter(x => x.user_id === uid)) {
    try { await webpush.sendNotification(s.subscription, payload, { TTL: 6 * 3600 }); console.log('Notifica inviata'); }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { await del(`/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`); console.log('Dispositivo non più valido, rimosso'); }
      else console.error('Invio non riuscito:', e.statusCode, e.body || e.message);
    }
  }
}
