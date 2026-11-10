// Controllo del mattino: per ogni utente con le notifiche attive calcola le cose da fare
// e manda una notifica ai suoi dispositivi. Gira su GitHub Actions ogni giorno.
// Se qualcosa non va, scrive il motivo (senza chiavi) in .github/stato-promemoria.txt.
import fs from 'fs';
import webpush from 'web-push';
import { promemoria, oggi, impostazioni } from '../logica.js';

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
const ora = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hour12: false }).format(new Date()) % 24;
const dow = new Date(today + 'T12:00:00').getDay();
const subs = await get('/push_subscriptions?select=endpoint,user_id,subscription');
const users = [...new Set(subs.map(s => s.user_id))];
scrivi(`${today} ore ${ora}: ${subs.length} dispositivi, ${users.length} utenti`);

/** Ricorda quali promemoria sono già partiti oggi, per non mandarli due volte. */
async function segnaInviato(uid, log) {
  await fetch(base + '/records?on_conflict=user_id,kind,id', {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: uid, kind: 'cfg', id: 'notifiche-log', data: log, deleted: false, updated_at: new Date().toISOString() }),
  }).catch(e => scrivi('Registro invii non aggiornato: ' + e.message));
}

let inviate = 0, errori = 0;
async function manda(uid, payload) {
  for (const s of subs.filter(x => x.user_id === uid)) {
    const dove = /apple/.test(s.endpoint) ? 'dispositivo Apple' : 'dispositivo';
    try { await webpush.sendNotification(s.subscription, payload, { TTL: 6 * 3600 }); inviate++; scrivi(`Notifica inviata a un ${dove}`); }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { await del(`/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`); scrivi(`Un ${dove} non è più registrato: rimosso`); }
      else { errori++; scrivi(`Invio a un ${dove} non riuscito: ${e.statusCode || ''} ${String(e.body || e.message).slice(0, 200)}`); }
    }
  }
}

// Novità degli accessi: richieste di accesso e prenotazioni dei rivenditori (avviso subito, a qualsiasi ora).
async function leggiSeEsiste(path) {
  try { const r = await fetch(base + path, { headers }); return r.ok ? r.json() : null; } catch { return null; }
}
async function segnaNotificato(tab, ids) {
  if (!ids.length) return;
  await fetch(`${base}/${tab}?id=in.(${ids.join(',')})`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ notificato: true }) }).catch(() => {});
}
const nuoveRich = await leggiSeEsiste('/richieste_accesso?notificato=eq.false&stato=eq.nuova&select=id,titolare,nome,azienda,ruolo');
const nuovePren = await leggiSeEsiste('/prenotazioni?notificato=eq.false&stato=eq.richiesta&select=id,titolare,data,data_fine,tipo,cliente,rivenditore');
const nuoviPrev = await leggiSeEsiste('/richieste_preventivo?notificato=eq.false&stato=eq.nuova&select=id,titolare,rivenditore,indirizzo,cliente,righe');
// richieste di preventivo che il rivenditore ha modificato dopo averle mandate (o a cui ha aggiunto foto)
const modPrev = await leggiSeEsiste('/richieste_preventivo?modifica_notificata=eq.false&stato=neq.chiusa&select=id,titolare,rivenditore,cliente,indirizzo,telefono,piano,ascensore,tiro,righe,note,precedente');
const membri = (nuoveRich?.length || nuovePren?.length || nuoviPrev?.length || modPrev?.length) ? (await leggiSeEsiste('/membri?select=user_id,titolare,ruolo,nome,azienda,stato')) || [] : [];
const dataIt = s => new Date(s + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
for (const tit of new Set([...(nuoveRich || []), ...(nuovePren || []), ...(nuoviPrev || [])].map(x => x.titolare))) {
  const R = (nuoveRich || []).filter(x => x.titolare === tit), P = (nuovePren || []).filter(x => x.titolare === tit), Q = (nuoviPrev || []).filter(x => x.titolare === tit);
  const righe = [
    ...P.map(p => { const r = membri.find(m => m.user_id === p.rivenditore); return `• ${r?.azienda || r?.nome || 'Un rivenditore'}: ${p.tipo} ${p.data_fine > p.data ? `dal ${dataIt(p.data)} al ${dataIt(p.data_fine)}` : `il ${dataIt(p.data)}`}${p.cliente ? ' · ' + p.cliente : ''}`; }),
    ...Q.map(q => { const r = membri.find(m => m.user_id === q.rivenditore); const pz = (q.righe || []).reduce((s, x) => s + (+x.qta || 0), 0); return `• ${r?.azienda || r?.nome || 'Un rivenditore'} chiede un preventivo: ${pz} pz · ${q.indirizzo || ''}`; }),
    ...R.map(r => `• ${r.nome}${r.azienda ? ' (' + r.azienda + ')' : ''} chiede l'accesso${r.ruolo !== 'altro' ? ' come ' + r.ruolo : ''}`),
  ];
  const titolo = Q.length && !P.length ? `${Q.length} ${Q.length === 1 ? 'richiesta di preventivo' : 'richieste di preventivo'}` : P.length ? `${P.length} ${P.length === 1 ? 'prenotazione da confermare' : 'prenotazioni da confermare'}` : `${R.length} ${R.length === 1 ? 'richiesta di accesso' : 'richieste di accesso'}`;
  const payload = JSON.stringify({ title: titolo, body: righe.slice(0, 6).join('\n'), url: P.length || Q.length ? './#richieste' : './#accessi', tag: `accessi-${Date.now()}` });
  // al proprietario e ai titolari attivi
  for (const uid of [tit, ...membri.filter(m => m.titolare === tit && m.ruolo === 'titolare' && m.stato === 'attivo').map(m => m.user_id)]) await manda(uid, payload);
  await segnaNotificato('richieste_accesso', R.map(x => x.id));
  await segnaNotificato('prenotazioni', P.map(x => x.id));
  await segnaNotificato('richieste_preventivo', Q.map(x => x.id));
  scrivi(`Accessi: ${R.length} richieste e ${P.length} prenotazioni segnalate`);
}

// Richieste di preventivo modificate: un avviso al titolare, con chi l'ha modificata e per quale cantiere.
const soloFoto = q => { const p = q.precedente || {}; return !!p.foto && ['cliente', 'indirizzo', 'telefono', 'piano', 'ascensore', 'note'].every(k => String(p[k] ?? '').trim() === String(q[k] ?? '').trim()) && !!p.tiro === !!q.tiro && JSON.stringify(p.righe || []) === JSON.stringify(q.righe || []); };
for (const tit of new Set((modPrev || []).map(x => x.titolare))) {
  const M = modPrev.filter(x => x.titolare === tit);
  const righe = M.map(q => { const r = membri.find(m => m.user_id === q.rivenditore); return `• ${r?.azienda || r?.nome || 'Un rivenditore'} ${soloFoto(q) ? 'ha aggiunto foto' : 'ha modificato la richiesta'}: ${[q.cliente, q.indirizzo].filter(Boolean).join(' · ') || 'preventivo'}`; });
  const titolo = M.length === 1 ? (soloFoto(M[0]) ? 'Nuove foto in una richiesta di preventivo' : 'Richiesta di preventivo modificata') : `${M.length} richieste di preventivo modificate`;
  const payload = JSON.stringify({ title: titolo, body: righe.slice(0, 6).join('\n'), url: './#richieste', tag: `prevmod-${Date.now()}` });
  for (const uid of [tit, ...membri.filter(m => m.titolare === tit && m.ruolo === 'titolare' && m.stato === 'attivo').map(m => m.user_id)]) await manda(uid, payload);
  await fetch(`${base}/richieste_preventivo?id=in.(${M.map(x => x.id).join(',')})`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ modifica_notificata: true }) }).catch(() => {});
  scrivi(`Preventivi: ${M.length} ${M.length === 1 ? 'richiesta modificata segnalata' : 'richieste modificate segnalate'}`);
}

// Lavori corretti dai rivenditori (cliente, indirizzo, telefono): il database prepara l'avviso, qui lo mando.
const avvTit = await leggiSeEsiste('/avvisi_titolare?notificato=eq.false&select=id,titolare,titolo,testo&order=creato.asc');
for (const tit of new Set((avvTit || []).map(x => x.titolare))) {
  const A = avvTit.filter(x => x.titolare === tit);
  const payload = JSON.stringify({ title: A.length === 1 ? A[0].titolo : `${A.length} lavori modificati dai rivenditori`, body: A.slice(0, 5).map(x => x.testo || '').join('\n'), url: './#cal', tag: `lavriv-${Date.now()}` });
  const tit2 = (await leggiSeEsiste(`/membri?titolare=eq.${tit}&ruolo=eq.titolare&stato=eq.attivo&select=user_id`)) || [];
  for (const uid of [tit, ...tit2.map(m => m.user_id)]) await manda(uid, payload);
  await segnaNotificato('avvisi_titolare', A.map(x => x.id));
  scrivi(`Lavori modificati dai rivenditori: ${A.length} ${A.length === 1 ? 'avviso' : 'avvisi'}`);
}

// Avvisi al rivenditore: prenotazione confermata, spostata, rifiutata o annullata; preventivo pronto o richiesta chiusa.
// (avviso_riv ricorda l'ultima situazione già comunicata, così ogni cambiamento si avvisa una volta sola)
async function segnaAvvisoRiv(tab, id, firma) {
  await fetch(`${base}/${tab}?id=eq.${id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ avviso_riv: firma }) }).catch(() => {});
}
const TIPO = { posa: 'Posa', intervento: 'Intervento', sopralluogo: 'Sopralluogo' };
const quando = p => p.data_fine > p.data ? `dal ${dataIt(p.data)} al ${dataIt(p.data_fine)}` : `il ${dataIt(p.data)}`;
const cambiPren = await leggiSeEsiste('/prenotazioni?stato=in.(confermata,rifiutata)&select=id,rivenditore,data,data_fine,tipo,cliente,stato,risposta,avviso_riv');
for (const p of cambiPren || []) {
  const firma = `${p.stato}|${p.data}|${p.data_fine}`;
  if (p.avviso_riv === firma) continue;
  const chi = p.cliente ? ` · ${p.cliente}` : '';
  let title, body;
  if (p.stato === 'confermata') {
    const prima = String(p.avviso_riv || '').startsWith('confermata|');
    title = prima ? 'Prenotazione spostata' : 'Prenotazione confermata';
    body = `${TIPO[p.tipo] || 'Lavoro'} ${quando(p)}${chi}`;
  } else {
    const annullata = /^Annullata dall'installatore/.test(p.risposta || '');
    const motivo = String(p.risposta || '').replace(/^Annullata dall'installatore:?\s*/, '');
    title = annullata ? 'Data annullata' : 'Prenotazione non accettata';
    body = `${TIPO[p.tipo] || 'Lavoro'} ${quando(p)}${chi}${motivo ? '\n' + motivo : ''}`;
  }
  await manda(p.rivenditore, JSON.stringify({ title, body, url: './', tag: `pren-${p.id}` }));
  await segnaAvvisoRiv('prenotazioni', p.id, firma);
  scrivi(`Rivenditore avvisato: ${title.toLowerCase()}`);
}
const cambiPrev = await leggiSeEsiste('/richieste_preventivo?stato=in.(inviato,chiusa)&select=id,rivenditore,indirizzo,cliente,stato,risposta,avviso_riv');
for (const q of cambiPrev || []) {
  if (q.avviso_riv === q.stato) continue;
  const dove = q.cliente || q.indirizzo || 'la tua richiesta';
  if (q.stato === 'inviato') await manda(q.rivenditore, JSON.stringify({ title: 'Preventivo pronto', body: `${dove}${q.risposta ? '\n' + q.risposta : ''}`, url: './', tag: `prev-${q.id}` }));
  else if (q.avviso_riv !== 'inviato') await manda(q.rivenditore, JSON.stringify({ title: 'Richiesta di preventivo chiusa', body: `${dove}${q.risposta ? '\n' + q.risposta : ''}`, url: './', tag: `prev-${q.id}` }));
  await segnaAvvisoRiv('richieste_preventivo', q.id, q.stato);
  scrivi(`Rivenditore avvisato: preventivo ${q.stato}`);
}

// rivenditori e dipendenti ricevono solo gli avvisi che li riguardano, non i promemoria del titolare
const soloAvvisi = new Set(((await leggiSeEsiste('/membri?ruolo=in.(rivenditore,dipendente)&select=user_id')) || []).map(m => m.user_id));
for (const uid of users) {
  if (soloAvvisi.has(uid)) continue;
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await get(`/records?user_id=eq.${uid}&deleted=eq.false&select=kind,id,data`, { Range: `${from}-${from + 999}` });
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const S = { lavori: [], interventi: [], movimenti: [], magazzino: [], preventivi: [], eventi: [], furgone: {}, impostazioni: null };
  let log = {};
  for (const r of rows) {
    if (r.kind === 'cfg') { if (r.id === 'furgone') S.furgone = r.data; if (r.id === 'impostazioni') S.impostazioni = r.data; if (r.id === 'documentiRiv') S.documentiRiv = r.data; if (r.id === 'notifiche-log') log = r.data || {}; }
    else if (S[r.kind]) S[r.kind].push({ id: r.id, ...r.data });
  }
  const N = impostazioni(S).notifiche;
  const festivo = dow === 0 || dow === 6;
  // quali promemoria tocca mandare adesso
  const momenti = [];
  if (forza) momenti.push('mattino');
  else {
    if (N.mattino && ora >= +N.oraMattino && ora < 23 && log.mattino !== today && (N.weekend || !festivo)) momenti.push('mattino');
    if (N.sera && ora >= +N.oraSera && log.sera !== today && (N.weekend || !festivo)) momenti.push('sera');
  }
  if (!momenti.length) { scrivi('Niente da mandare adesso per un utente'); continue; }
  for (const momento of momenti) {
    const todo = promemoria(S, today, momento);
    scrivi(`Promemoria ${momento}: ${todo.length} voci`);
    log[momento] = today;
    if (!todo.length && !forza) continue;
    const urgenti = todo.filter(t => t.lvl === 'bad').length;
    const titolo = momento === 'sera' ? 'Fine giornata' : 'Buongiorno';
    const payload = JSON.stringify({
      title: todo.length ? `${titolo} · ${todo.length} ${todo.length === 1 ? 'cosa da fare' : 'cose da fare'}${urgenti ? ' (' + urgenti + ' urgenti)' : ''}` : 'Diario di Posa · notifiche attive',
      body: todo.length ? todo.slice(0, 6).map(t => '• ' + t.txt).join('\n') : 'Le notifiche funzionano. Ti scrivo solo quando c\'è qualcosa da fare.',
      url: momento === 'sera' ? './#cal' : './#cal',
      tag: `promemoria-${momento}-${today}`,
    });
    await manda(uid, payload);
  }
  if (!forza) await segnaInviato(uid, log);
}
if (errori && !inviate) fine(1, 'nessuna notifica è stata consegnata');
fine(0);
