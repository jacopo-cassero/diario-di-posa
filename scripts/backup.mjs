// Backup dei dati del Diario di Posa: ogni notte copia tutto il database in un file JSON
// nella cartella privata del titolare (file/<titolare>/backup/), e tiene gli ultimi 30.
// Dall'app (Cartelle, account e installazione › Backup) il titolare lo scarica sul telefono o sul computer.
// Nei registri di GitHub non scrive mai dati, solo quanti sono.
const pulisci = v => String(v || '').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').replace(/\s+/g, '');
let URLB = pulisci(process.env.SUPABASE_URL);
const KEY = pulisci(process.env.SUPABASE_SERVICE_ROLE_KEY).replace(/^Bearer/i, '');
if (!URLB || !KEY) { console.log('Mancano SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (/^[a-z0-9]{20}$/.test(URLB)) URLB = `https://${URLB}.supabase.co`;
if (!/^https?:\/\//.test(URLB)) URLB = 'https://' + URLB;
URLB = URLB.replace(/\/(rest\/v1)?\/?$/, '');
const H = KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` };
const TENERE = 30;

async function tutto(tab, ordine) {
  const out = [];
  for (let da = 0; ; da += 1000) {
    const r = await fetch(`${URLB}/rest/v1/${tab}?select=*&order=${ordine}`, { headers: { ...H, Range: `${da}-${da + 999}`, 'Range-Unit': 'items' } });
    if (r.status === 404 || r.status === 400) return null;   // tabella non presente in questo progetto
    if (!r.ok) throw new Error(`${tab}: errore ${r.status}`);
    const L = await r.json(); out.push(...L);
    if (L.length < 1000) return out;
  }
}
const records = await tutto('records', 'user_id,kind,id');
if (!records) { console.log('Tabella records non trovata'); process.exit(1); }
const extra = {};
for (const [t, o] of [['membri', 'user_id'], ['prenotazioni', 'creato'], ['richieste_preventivo', 'creato'], ['richieste_accesso', 'creato'], ['documenti_cliente', 'creato']]) {
  try { const L = await tutto(t, o); if (L) extra[t] = L; } catch (e) { console.log(`${t}: non letto (${e.message})`); }
}
const quando = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(' ', '_').replace(':', '-');

// un file per ogni titolare, con i suoi dati soltanto
const titolari = [...new Set(records.filter(r => r.kind !== 'cfg' || r.id !== 'notifiche-log').map(r => r.user_id))];
for (const tit of titolari) {
  const suoi = records.filter(r => r.user_id === tit && !(r.kind === 'cfg' && r.id === 'notifiche-log'));
  const membri = (extra.membri || []).filter(m => m.titolare === tit);
  const conTit = t => (extra[t] || []).filter(x => x.titolare === tit);
  // l'elenco dei file salvati (foto, allegati, PDF): i file restano dove sono, qui c'è dove trovarli
  let files = [];
  for (const cart of [tit, ...membri.map(m => m.user_id)]) {
    const r = await fetch(`${URLB}/storage/v1/object/list/file`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: cart, limit: 1000, sortBy: { column: 'name', order: 'asc' } }) }).catch(() => null);
    if (r?.ok) files.push(...(await r.json()).map(f => `${cart}/${f.name}`));
  }
  const dati = {
    app: 'Diario di Posa', versione: 1, creato: new Date().toISOString(), titolare: tit,
    conteggio: Object.fromEntries([...new Set(suoi.map(r => r.kind))].map(k => [k, suoi.filter(r => r.kind === k && !r.deleted).length])),
    records: suoi, membri, prenotazioni: conTit('prenotazioni'), richieste_preventivo: conTit('richieste_preventivo'), richieste_accesso: conTit('richieste_accesso'), documenti_cliente: conTit('documenti_cliente'), cartelle_file: files,
  };
  const nome = `${tit}/backup/backup-${quando}.json`;
  const up = await fetch(`${URLB}/storage/v1/object/file/${nome}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify(dati) });
  if (!up.ok) { console.log(`Backup non salvato (errore ${up.status}): ${(await up.text()).slice(0, 200)}`); process.exitCode = 1; continue; }
  console.log(`Backup salvato: ${suoi.length} schede, ${membri.length} accessi, ${files.length} file elencati`);
  // tengo gli ultimi 30
  const r = await fetch(`${URLB}/storage/v1/object/list/file`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: `${tit}/backup`, limit: 1000, sortBy: { column: 'name', order: 'desc' } }) });
  if (r.ok) {
    const vecchi = (await r.json()).filter(f => /^backup-.*\.json$/.test(f.name)).slice(TENERE).map(f => `${tit}/backup/${f.name}`);
    if (vecchi.length) { await fetch(`${URLB}/storage/v1/object/file`, { method: 'DELETE', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: vecchi }) }); console.log(`Tolti ${vecchi.length} backup vecchi`); }
  }
}
