// Controllo del mattino: per ogni utente con le notifiche attive calcola le cose da fare
// e manda una notifica ai suoi dispositivi. Gira su GitHub Actions ogni giorno.
// Se qualcosa non va, scrive il motivo (senza chiavi) in .github/stato-promemoria.txt.
import fs from 'fs';
import webpush from 'web-push';
import { promemoria, oggi } from '../logica.js';

const ESITO = '.github/stato-promemoria.txt';
const log = [];
const scrivi = m => { console.log(m); log.push(m); };
function fine(codice, motivo) {
  if (motivo) scrivi('ERRORE: ' + motivo);
  try { fs.writeFileSync(ESITO, `${new Date().toISOString()}\n${log.join('\n')}\n`); } catch {}
  process.exit(codice);
}

// Pulizia dei segreti: spazi, a capo e virgolette incollati per sbaglio.
const pulisci = v => String(v || '').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').replace(/\s+/g, '');
let SUPABASE_URL = pulisci(process.env.SUPABASE_URL);
let KEY = pulisci(process.env.SUPABASE_SERVICE_ROLE_KEY).replace(/^Bearer/i, '');
const VAPID_PUBLIC_KEY = pulisci(process.env.VAPID_PUBLIC_KEY);
const VAPID_PRIVATE_KEY = pulisci(process.env.VAPID_PRIVATE_KEY);
let VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');

const descr = (v, nome) => v ? `${nome}: presente (${v.length} caratteri, inizia con "${nome.includes('URL') ? v.slice(0, 12) : v.slice(0, 3)}…")` : `${nome}: MANCANTE`;
scrivi(descr(SUPABASE_URL, 'SUPABASE_URL'));
scrivi(descr(KEY, 'SUPABASE_SERVICE_ROLE_KEY'));
scrivi(descr(VAPID_PUBLIC_KEY, 'VAPID_PUBLIC_KEY'));
scrivi(descr(VAPID_PRIVATE_KEY, 'VAPID_PRIVATE_KEY'));
scrivi(`VAPID_SUBJECT: ${VAPID_SUBJECT ? 'presente' : 'mancante (uso un valore predefinito)'}`);

const mancanti = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].filter((n, i) => ![SUPABASE_URL, KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY][i]);
if (mancanti.length) fine(1, `mancano questi segreti nel repository (controlla anche i nomi): ${mancanti.join(', ')}`);

if (/^[a-z0-9]{20}$/.test(SUPABASE_URL)) SUPABASE_URL = `https://${SUPABASE_URL}.supabase.co`;
if (!/^https?:\/\//.test(SUPABASE_URL)) SUPABASE_URL = 'https://' + SUPABASE_URL;
SUPABASE_URL = SUPABASE_URL.replace(/\/(rest\/v1)?\/?$/, '');
try { new URL(SUPABASE_URL); } catch { fine(1, 'SUPABASE_URL non è un indirizzo valido'); }
if (!VAPID_SUBJECT) VAPID_SUBJECT = 'mailto:info@casseroinstallazioni.it';
if (!/^(mailto:|https:)/.test(VAPID_SUBJECT)) VAPID_SUBJECT = VAPID_SUBJECT.includes('@') ? 'mailto:' + VAPID_SUBJECT.replace(/^mailto/i, '').replace(/^:/, '') : 'mailto:info@casseroinstallazioni.it';

try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY); }
catch (e) { fine(1, 'chiavi delle notifiche (VAPID) non valide: ' + e.message); }

// Le chiavi nuove di Supabase (sb_secret_…) vanno solo nell'intestazione apikey.
const headers = KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` };
const base = SUPABASE_URL + '/rest/v1';
async function get(path, extra = {}) {
  let r;
  try { r = await fetch(base + path, { headers: { ...headers, ...extra } }); }
  catch (e) { fine(1, `il database non risponde (${e.cause?.code || e.message}). Se il progetto Supabase è in pausa, premi Restore su supabase.com`); }
  if (r.status === 401 || r.status === 403) fine(1, `il database rifiuta la chiave (errore ${r.status}): SUPABASE_SERVICE_ROLE_KEY deve essere la chiave "service_role" o "secret", non quella "anon"`);
  if (!r.ok) fine(1, `errore del database ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function del(path) { await fetch(base + path, { method: 'DELETE', headers }).catch(() => {}); }

const forza = process.argv.includes('--prova');
const today = oggi();
const subs = await get('/push_subscriptions?select=endpoint,user_id,subscription');
const users = [...new Set(subs.map(s => s.user_id))];
scrivi(`${today}: ${subs.length} dispositivi, ${users.length} utenti`);

let inviate = 0, errori = 0;
for (const uid of users) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await get(`/records?user_id=eq.${uid}&deleted=eq.false&select=kind,id,data`, { Range: `${from}-${from + 999}` });
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const S = { lavori: [], interventi: [], movimenti: [], magazzino: [], preventivi: [], eventi: [], furgone: {} };
  for (const r of rows) {
    if (r.kind === 'cfg') { if (r.id === 'furgone') S.furgone = r.data; }
    else if (S[r.kind]) S[r.kind].push({ id: r.id, ...r.data });
  }
  const todo = promemoria(S, today);
  scrivi(`Cose da fare per un utente: ${todo.length}`);
  if (!todo.length && !forza) continue;
  const urgenti = todo.filter(t => t.lvl === 'bad').length;
  const payload = JSON.stringify({
    title: todo.length ? `Diario di Posa · ${todo.length} ${todo.length === 1 ? 'cosa da fare' : 'cose da fare'}${urgenti ? ' (' + urgenti + ' urgenti)' : ''}` : 'Diario di Posa · notifiche attive',
    body: todo.length ? todo.slice(0, 5).map(t => '• ' + t.txt).join('\n') : 'Le notifiche funzionano. Ogni mattina ti scrivo solo se c\'è qualcosa da fare.',
    url: './#cal',
    tag: 'promemoria-' + today,
  });
  for (const s of subs.filter(x => x.user_id === uid)) {
    const dove = /apple/.test(s.endpoint) ? 'dispositivo Apple' : 'dispositivo';
    try { await webpush.sendNotification(s.subscription, payload, { TTL: 6 * 3600 }); inviate++; scrivi(`Notifica inviata a un ${dove}`); }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { await del(`/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`); scrivi(`Un ${dove} non è più registrato: rimosso`); }
      else { errori++; scrivi(`Invio a un ${dove} non riuscito: ${e.statusCode || ''} ${String(e.body || e.message).slice(0, 200)}`); }
    }
  }
}
if (errori && !inviate) fine(1, 'nessuna notifica è stata consegnata');
fine(0);
