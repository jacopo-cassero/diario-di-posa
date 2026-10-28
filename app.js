import { MESI, AMM, STATI, URG, CAT, SCAD, oggi, pd, iso, n2, sum, slug, eur, promemoria, leggiScontrino, impostazioni, oreGiornata } from './logica.js';
import { LISTINO_BASE, AZIENDA_BASE, IVA, ivaOf, totali, totaleRiga, prezzoUnitario, rigaDaVoce, prossimoNumero } from './listino.js';
import { creaDocumento, docDaLavoro, creaListino } from './documento.js';
import { MODELLI_BASE, TIPI_CAMPO, creaModulo, MODELLI_UFFICIALI, campiUfficiali, creaModuloUfficiale } from './moduli.js';
import { POSIZIONI } from './moduli-posizioni.js';
import { creaCalendario } from './calendario-ics.js';
import { createStore } from './store.js';

/* ---------- utilità ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n, d = 1) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: d }).format(+n || 0);
let TODAY = oggi();
const fmtD = (s, o = { day: 'numeric', month: 'short', year: 'numeric' }) => s ? pd(s).toLocaleDateString('it-IT', o) : '—';
const daysTo = s => Math.round((pd(s) - pd(TODAY)) / 864e5);
const addYears = (s, n) => { const d = pd(s || TODAY); d.setFullYear(d.getFullYear() + n); return iso(d); };
const monthName = k => { const [y, m] = k.split('-'); return MESI[+m - 1] + ' ' + y; };
const shiftMonth = (k, n) => { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const catName = k => (CAT.find(c => c[0] === k) || [k, k])[1].split(' (')[0];
const ammOf = k => AMM.find(a => a[0] === (k || 'da_cons')) || AMM[0];
const isUrl = u => /^https?:\/\/\S+$/i.test(String(u || '').trim());
const ICON = {
  cal: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>',
  int: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  conti: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
  van: '<path d="M2 7h11v9H2zM13 10h4l3 3v3h-7M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
  an: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  l: '<path d="M15 6l-6 6 6 6"/>', r: '<path d="M9 6l6 6-6 6"/>',
  box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8"/>',
  doc: '<path d="M6 3h9l4 4v14H6zM14 3v5h5"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  clip: '<path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
  prev: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h6M9 16h6"/>',
  cli: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 8 2 8H4s2-2 2-8zM10 21a2 2 0 0 0 4 0"/>',
  clock: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>',
  clip2: '<path d="M8 4h8v3H8zM6 5H5v16h14V5h-1M8.5 12l2 2 4-4M8.5 17h7"/>',
};
const svg = (k, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${ICON[k]}</svg>`;

/* ---------- stato ---------- */
const CFG = window.DIARIO_CONFIG || {};
const store = createStore(CFG, () => { render(); if (GESTORE()) { aggiornaCalendario(); caricaAccessi(); } });
const S = store.S;
const UI = { tab: 'cal', month: TODAY.slice(0, 7), day: TODAY, intFilter: 'aperti', prevFilter: 'aperti', sel: null, calCli: null, cerca: '', cliTipo: 'tutti', cliOrd: 'recenti', seg: 'mov', cMonth: TODAY.slice(0, 7), anYear: +TODAY.slice(0, 4), anMonth: 'all', authView: 'login', authMsg: '', authErr: '' };
const TABS = [['cal', 'Calendario', 'cal'], ['int', 'Interventi', 'int'], ['prev', 'Preventivi', 'prev'], ['cli', 'Clienti', 'cli'], ['conti', 'Conti', 'conti'], ['van', 'Furgone', 'van'], ['an', 'Analisi', 'an']];
function readHash() {
  const h = location.hash.slice(1);
  if (TABS.some(t => t[0] === h) || ['set', 'cantieri', 'moduli', 'accessi'].includes(h)) UI.tab = h;
  if (h === 'fatture') { UI.tab = 'conti'; UI.seg = 'fatt'; }
  if (h === 'magazzino') { UI.tab = 'conti'; UI.seg = 'mag'; }
}
readHash();
window.addEventListener('hashchange', () => { readHash(); render(); });

/* =====================================================================
   ACCESSI: titolari, rivenditori e dipendenti
   ===================================================================== */
const RUOLI = [['titolare', 'Titolare', 'vede e modifica tutto, come te'], ['rivenditore', 'Rivenditore', 'vede solo libero/occupato e prenota le giornate libere'], ['dipendente', 'Dipendente', 'vede solo i lavori assegnati a lui, senza prezzi']];
const nomeRuolo = k => (RUOLI.find(r => r[0] === k) || [k, k])[1];
const GESTORE = () => ['proprietario', 'titolare'].includes(store.st.ruolo);
const piuGiorni = (k, n) => iso(new Date(pd(k).getTime() + n * 864e5));
const INVITO = (() => { let c = ''; try { c = new URLSearchParams(location.search).get('invito') || ''; if (c) localStorage.setItem('ddp:invito', c); else c = localStorage.getItem('ddp:invito') || ''; } catch {} return c; })();
if (INVITO && !location.hash) UI.authView = 'richiesta';
const linkApp = codice => `${location.origin}${location.pathname}${codice ? `?invito=${codice}` : ''}`;
const telWa = t => { let d = String(t || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.length === 10 && d.startsWith('3')) d = '39' + d; return d; };

/* festività nazionali italiane (giorni chiusi per i rivenditori) */
function festivi(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  const pasquetta = iso(new Date(y, mese - 1, giorno + 1));
  return new Set(['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'].map(x => `${y}-${x}`).concat(pasquetta));
}

/* ---------- scheda cantiere compilata dal rivenditore ---------- */
const SCHEDA = [
  ['referente', 'Referente in cantiere', 'testo'], ['telReferente', 'Telefono referente', 'tel'],
  ['email', 'Email del cliente', 'email'],
  ['piano', 'Piano', ['Piano terra', '1° piano', '2° piano', '3° piano', '4° piano', '5° piano o più', 'Su più piani']],
  ['ascensore', 'Ascensore', ['Sì', 'No']],
  ['tiro', 'Tiro al piano', ['Non serve', 'Serve, con le scale', 'Serve gru o montacarichi', 'Da valutare']],
  ['parcheggio', 'Parcheggio', ['Comodo, davanti al cantiere', 'Vicino', 'Difficile', 'ZTL o serve permesso']],
  ['materialeDove', 'Il materiale', ['È già in cantiere', 'Arriva con il rivenditore', 'Da ritirare in magazzino']],
  ['smaltimento', 'Smaltimento vecchi serramenti', ['Sì', 'No']],
  ['orari', 'Orari o vincoli di accesso', 'testo'],
];
const TIPI_MAT = POSIZIONI['verbale-collaudo'].campi.prod1_tipo.opz;
function schedaTesto(p) {
  const s = p.scheda || {};
  const mat = (s.materiale || []).filter(r => r.tipo || r.qta).map(r => `${n2(r.qta) || ''} ${r.tipo || ''}${r.note ? ' (' + r.note + ')' : ''}`.trim());
  return [
    p.cliente && `Cliente finale: ${p.cliente}`, p.telefono && `Tel. ${p.telefono}`,
    ...SCHEDA.filter(([k]) => s[k]).map(([k, l]) => `${l}: ${s[k]}`),
    mat.length && `Materiale: ${mat.join(', ')}`, s.misure && `Misure e dettagli: ${s.misure}`,
    s.descrizione && `Lavoro: ${s.descrizione}`, s.note && `Note: ${s.note}`,
  ].filter(Boolean).join('\n');
}
const rigaMat = (r = {}) => `<div class="matr g3"><select name="pm_tipo" aria-label="Tipologia"><option value="">Tipologia…</option>${TIPI_MAT.map(o => `<option ${o === r.tipo ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select><input name="pm_qta" type="number" inputmode="numeric" placeholder="Q.tà" value="${esc(r.qta || '')}" aria-label="Quantità"><input name="pm_note" placeholder="Note (misure, colore…)" value="${esc(r.note || '')}" aria-label="Note"></div>`;

/* ---------- stato condiviso per chi gestisce ---------- */
const ACC = { membri: [], richieste: [], pren: [], t: 0, ok: null, err: '' };
async function caricaAccessi(forza) {
  if (store.st.auth !== 'in' || !GESTORE() || store.st.mode === 'demo') return;
  if (!forza && Date.now() - ACC.t < 30000) return;
  ACC.t = Date.now();
  try {
    const [m, r, p] = await Promise.all([
      store.tabella('membri').select('*').order('creato'),
      store.tabella('richieste_accesso').select('*').eq('stato', 'nuova').order('creato'),
      store.tabella('prenotazioni').select('*').gte('data_fine', piuGiorni(TODAY, -60)).order('data'),
    ]);
    for (const x of [m, r, p]) if (x.error) throw x.error;
    ACC.membri = m.data; ACC.richieste = r.data; ACC.pren = p.data; ACC.ok = true; ACC.err = '';
    await caricaRichiestePrev();
  } catch (e) { console.warn(e); ACC.ok = false; ACC.err = /relation|does not exist|schema cache|not find/i.test(e.message || '') ? 'manca' : 'rete'; }
  render();
}
store.onAccessi = () => caricaAccessi(true);
const dipendenti = () => ACC.membri.filter(m => m.ruolo === 'dipendente' && m.stato === 'attivo');
const nomeMembro = id => { const m = ACC.membri.find(x => x.user_id === id); return m ? (m.nome || m.email) : 'Dipendente'; };
const daFareAccessi = () => ACC.richieste.length + ACC.pren.filter(p => p.stato === 'richiesta').length + ACC_PREV.L.filter(r => r.stato === 'nuova').length;

/** Avviso in cima al calendario quando ci sono richieste da guardare. */
function avvisoAccessi() {
  const r = ACC.richieste.length, p = ACC.pren.filter(x => x.stato === 'richiesta').length, q = ACC_PREV.L.filter(x => x.stato === 'nuova').length;
  if (!r && !p && !q) return '';
  return `<button type="button" class="notice accnote" data-act="menuGo" data-arg="accessi">${svg('cli', 'i')} <span>${[p && `<b>${p}</b> ${p === 1 ? 'prenotazione' : 'prenotazioni'} dei rivenditori da confermare`, q && `<b>${q}</b> ${q === 1 ? 'richiesta' : 'richieste'} di preventivo`, r && `<b>${r}</b> ${r === 1 ? 'richiesta' : 'richieste'} di accesso`].filter(Boolean).join(' · ')}</span><span class="go">›</span></button>`;
}

/* ---------- squadra sui lavori ---------- */
function campoSquadra(x = {}) {
  const dip = dipendenti(); const sc = new Set(x.assegnati || []);
  const vecchi = [...sc].filter(id => !dip.some(d => d.user_id === id));
  if (!dip.length && !vecchi.length) return '';
  return `<div class="fieldset"><span class="fs-t">Squadra</span>
    <div class="squadra">${[...dip.map(d => [d.user_id, d.nome || d.email]), ...vecchi.map(id => [id, nomeMembro(id)])].map(([id, n]) => `<label class="chipcheck"><input type="checkbox" name="squadra" value="${esc(id)}" ${sc.has(id) ? 'checked' : ''}><span>${esc(n)}</span></label>`).join('')}</div>
    <div class="small muted">I dipendenti scelti vedono questo lavoro nel loro calendario (senza prezzi).</div>
    ${rapportiSquadra(x)}</div>`;
}
function rapportiSquadra(x) {
  const R = Object.values(x.lavoroSquadra || {});
  if (!R.length) return '';
  return `<div class="stack">${R.map(r => `<div class="squadrar"><div class="row between"><b>${esc(r.nome || 'Dipendente')}</b>${r.fatto ? '<span class="chip ok">Fatto</span>' : '<span class="chip">In corso</span>'}</div>
    <div class="small muted">${[n2(r.ore) ? num(r.ore, 2) + ' ore' : '', r.aggiornato ? 'aggiornato ' + new Date(r.aggiornato).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''].filter(Boolean).join(' · ')}</div>
    ${r.note ? `<div class="small">${esc(r.note)}</div>` : ''}
    ${(r.foto || []).length ? `<div class="thumbs">${r.foto.map(f => `<a href="#" data-act="apriFile" data-arg="${esc(f)}"><img data-file="${esc(f)}" alt="Foto dal cantiere"></a>`).join('')}</div>` : ''}</div>`).join('')}</div>`;
}
/** Tiene i dati scritti dai dipendenti quando il titolare salva il lavoro. */
function conSquadra(kind, id, d, fd) {
  d.assegnati = fd.getAll('squadra').map(String);
  const cur = id && S[kind].find(x => x.id === id);
  if (cur?.lavoroSquadra) d.lavoroSquadra = cur.lavoroSquadra;
  if (cur?.prenotazioneId) { d.prenotazioneId = cur.prenotazioneId; d.clienteFinale = cur.clienteFinale; }
  return d;
}

/* ---------- pagina Accessi (titolare) ---------- */
function rAccessi() {
  const a = S.impostazioni?.accessi || {};
  if (store.st.mode === 'demo') return `<h2>Accessi</h2><div class="empty">Gli accessi funzionano dopo il collegamento al database.</div>`;
  if (ACC.ok === false && ACC.err === 'manca') return `<h2>Accessi</h2><div class="notice"><b>Manca un passaggio su Supabase.</b> Lancia lo script <code>accessi.sql</code> nel SQL Editor del progetto (te l'ho mandato in chat), poi riapri questa pagina.</div>`;
  if (ACC.ok === null) { caricaAccessi(true); return `<h2>Accessi</h2><div class="empty">Caricamento…</div>`; }
  const link = a.codice ? linkApp(a.codice) : '';
  const rich = ACC.richieste;
  const prenR = ACC.pren.filter(p => p.stato === 'richiesta');
  const prenC = ACC.pren.filter(p => p.stato === 'confermata' && p.data_fine >= TODAY);
  const perRuolo = RUOLI.map(([k, l]) => [k, l, ACC.membri.filter(m => m.ruolo === k)]);
  return `<div class="row between"><h2>Accessi</h2><button class="btn primary" data-act="accNuovo" type="button">${svg('plus')} Persona</button></div>
  ${ACC.ok === false ? `<div class="notice small">Non riesco a leggere gli accessi: controlla la rete.</div>` : ''}
  <section class="panel stack"><b>Link per scaricare l'app e chiedere l'accesso</b>
    ${link ? `<div class="small muted">Chi apre questo link può installare l'app e chiederti l'accesso. Entra solo chi approvi tu, con il ruolo che scegli.</div>
      <div class="linkbox num small">${esc(link)}</div>
      <div class="row"><button class="btn sm primary" data-act="accCondividi" type="button">Condividi link</button><button class="btn sm" data-act="accCopia" type="button">Copia</button><button class="btn sm" data-act="accLinkNuovo" type="button">Cambia link</button><button class="btn sm" data-act="accChiudi" type="button">Chiudi richieste</button></div>`
    : `<div class="small muted">Crea un link da mandare a rivenditori, dipendenti e soci: aprendolo possono installare l'app e chiederti l'accesso.</div><div class="row"><button class="btn sm primary" data-act="accApri" type="button">Crea il link</button></div>`}
    <div class="g2">${F('Preavviso minimo per le prenotazioni', selN('accPre', [[1, '1 giorno'], [2, '2 giorni'], [3, '3 giorni'], [5, '5 giorni'], [7, '1 settimana'], [14, '2 settimane']], a.preavviso ?? 2))}${F('I rivenditori vedono', selN('accMesi', [[1, '1 mese avanti'], [2, '2 mesi avanti'], [3, '3 mesi avanti'], [4, '4 mesi avanti'], [6, '6 mesi avanti'], [12, '1 anno avanti']], a.mesi ?? 4))}</div>
    ${tog('accListino', 'I rivenditori vedono il listino', a.listino !== false, 'lo consultano e lo scaricano in PDF; serve anche per la stima dei preventivi')}
    <div class="row"><button class="btn sm" data-act="listinoPdf" type="button">${svg('doc', 'i')} Listino in PDF</button></div>
  </section>
  ${ACC_PREV.L.length ? `<section class="stack"><h3>Richieste di preventivo</h3>${ACC_PREV.L.map(cardRichPrev).join('')}</section>` : ''}
  ${prenR.length ? `<section class="stack"><h3>Prenotazioni da confermare</h3>${prenR.map(p => cardPren(p, true)).join('')}</section>` : ''}
  ${rich.length ? `<section class="stack"><h3>Richieste di accesso</h3>${rich.map(r => `<div class="card"><div class="row between"><span class="t">${esc(r.nome)}${r.azienda ? ' · ' + esc(r.azienda) : ''}</span><span class="chip">${r.ruolo === 'altro' ? 'da decidere' : nomeRuolo(r.ruolo)}</span></div>
      <div class="small muted">${esc(r.email)}${r.telefono ? ' · ' + esc(r.telefono) : ''} · ${new Date(r.creato).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</div>
      ${r.messaggio ? `<div class="small">${esc(r.messaggio)}</div>` : ''}
      <div class="row"><button class="btn sm primary" data-act="accDai" data-id="${r.id}" type="button">Dai accesso</button><button class="btn sm" data-act="accRifiuta" data-id="${r.id}" type="button">Rifiuta</button></div></div>`).join('')}</section>` : ''}
  <section class="stack"><h3>Persone con accesso</h3>
    ${perRuolo.map(([k, l, L]) => L.length ? `<div class="panel"><div class="fs-t">${L.length > 1 ? { titolare: 'Titolari', rivenditore: 'Rivenditori', dipendente: 'Dipendenti' }[k] : l}</div>${L.map(m => `<div class="list-line" role="button" tabindex="0" data-act="accMembro" data-id="${m.user_id}"><div><b>${esc(m.nome || m.email)}</b><div class="small muted">${[m.azienda, m.email, m.telefono].filter(Boolean).map(esc).join(' · ')}</div></div><span class="chip ${m.stato === 'attivo' ? 'ok' : 'bad'}">${m.stato === 'attivo' ? (m.cambio_password ? 'primo accesso' : 'attivo') : 'sospeso'}</span></div>`).join('')}</div>` : '').join('') || `<div class="empty small">Ancora nessuno. Manda il link o tocca <b>+ Persona</b>.</div>`}
  </section>
  ${prenC.length ? `<section class="stack"><h3>Prenotazioni confermate</h3>${prenC.map(p => cardPren(p, false)).join('')}</section>` : ''}`;
}
function cardPren(p, azioni) {
  const r = ACC.membri.find(m => m.user_id === p.rivenditore);
  const giorni = p.data_fine > p.data ? `dal ${fmtD(p.data, { day: 'numeric', month: 'short' })} al ${fmtD(p.data_fine, { day: 'numeric', month: 'short' })}` : fmtD(p.data, { weekday: 'long', day: 'numeric', month: 'long' });
  return `<div class="card"><div class="row between"><span class="t">${esc(r?.azienda || r?.nome || 'Rivenditore')}</span><span class="chip ${p.stato === 'confermata' ? 'ok' : 'warn'}">${{ posa: 'Posa', intervento: 'Intervento', sopralluogo: 'Sopralluogo' }[p.tipo]}</span></div>
    <div class="small"><b>${giorni}</b> · ${esc(p.cliente || '')} · ${esc(p.indirizzo || '')}</div>
    <details class="small"><summary>Scheda del cantiere</summary><div class="prewrap">${esc(schedaTesto(p))}</div></details>
    ${azioni ? `<div class="row"><button class="btn sm primary" data-act="prenConferma" data-id="${p.id}" type="button">Conferma e metti in calendario</button><button class="btn sm" data-act="prenRifiuta" data-id="${p.id}" type="button">Rifiuta</button></div>` : p.lavoro_id ? `<button class="linkbtn small" data-act="prenApri" data-id="${p.id}" type="button">Apri nel calendario</button>` : ''}</div>`;
}
const pwProvvisoria = () => 'Posa-' + String(crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000) + '-' + Array.from(crypto.getRandomValues(new Uint8Array(3)), b => 'abcdefghjkmnpqrstuvwxyz'[b % 23]).join('');
function sheetDaiAccesso(r = {}) {
  openSheet(r.id ? 'Dai accesso' : 'Nuova persona', `
    <div class="g2">${F('Nome e cognome', inp('anome', r.nome, 'text', 'required'))}${F('Azienda', inp('aazienda', r.azienda))}</div>
    <div class="g2">${F('Email (per accedere)', inp('aemail', r.email, 'email', 'required'))}${F('Telefono', inp('atel', r.telefono, 'tel'))}</div>
    <div class="fieldset"><span class="fs-t">Che accesso gli dai</span>${RUOLI.map(([k, l, d]) => `<label class="radiorow"><input type="radio" name="aruolo" value="${k}" ${k === (['rivenditore', 'dipendente'].includes(r.ruolo) ? r.ruolo : 'rivenditore') ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div>
    ${F('Password provvisoria', inp('apw', pwProvvisoria(), 'text', 'required minlength="8" autocomplete="off"'))}
    <div class="small muted">Al primo accesso gli chiede di sceglierne una sua. Dopo il salvataggio ti preparo il messaggio con email e password da mandargli.</div>`,
  async fd => {
    const email = String(fd.get('aemail')).trim().toLowerCase(), pw = String(fd.get('apw')).trim(), ruolo = fd.get('aruolo');
    if (pw.length < 8) throw Object.assign(new Error('pw'), { userMsg: 'La password provvisoria deve avere almeno 8 caratteri' });
    const acc = await store.creaAccount(email, pw);
    await store.rpc('aggiungi_membro', { email, ruolo, nome: String(fd.get('anome')).trim(), azienda: String(fd.get('aazienda')).trim(), telefono: String(fd.get('atel')).trim(), provvisoria: !acc.esistente, richiesta: r.id || null });
    await caricaAccessi(true);
    setTimeout(() => sheetCredenziali({ nome: String(fd.get('anome')).trim(), email, pw: acc.esistente ? '' : pw, ruolo, tel: String(fd.get('atel')).trim(), conferma: acc.conferma }), 50);
  }, { saveLabel: 'Crea accesso' });
}
function sheetCredenziali(c) {
  const t = [`Ciao ${c.nome.split(' ')[0]}, ti ho dato l'accesso al Diario di Posa di ${AZ().ragioneSociale || 'Cassero Installazioni'} come ${nomeRuolo(c.ruolo).toLowerCase()}.`, '',
    `1. Apri: ${linkApp('')}`, `   Su iPhone: Condividi › Aggiungi alla schermata Home, così l'hai come app.`,
    c.conferma ? `2. Ti arriva un'email per confermare l'indirizzo: apri il link che contiene.` : '',
    `${c.conferma ? '3' : '2'}. Accedi con:`, `   Email: ${c.email}`, c.pw ? `   Password provvisoria: ${c.pw}` : `   la password che usi già con questa email`,
    c.pw ? `Al primo accesso ti chiede di sceglierne una tua. Poi resti collegato.` : ''].filter(x => x !== '').join('\n');
  openSheet('Accesso creato', `<div class="notice small">${c.pw ? 'Manda questo messaggio alla persona: contiene la password provvisoria.' : 'Questa email aveva già un account: entra con la password che usa già.'}</div>
    <pre class="cred" id="credTxt">${esc(t)}</pre>
    <div class="row">${navigator.share ? `<button type="button" class="btn primary" data-act="credShare">Invia…</button>` : ''}${c.tel ? `<a class="btn" href="https://wa.me/${telWa(c.tel)}?text=${encodeURIComponent(t)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<a class="btn" href="mailto:${esc(c.email)}?subject=${encodeURIComponent('Accesso al Diario di Posa')}&body=${encodeURIComponent(t)}">Email</a><button type="button" class="btn" data-act="credCopia">Copia</button></div>`, null);
}
function sheetMembro(m) {
  openSheet(m.nome || m.email, `
    <div class="small muted">${[m.azienda, m.email, m.telefono].filter(Boolean).map(esc).join(' · ')}</div>
    <div class="fieldset"><span class="fs-t">Accesso</span>${RUOLI.map(([k, l, d]) => `<label class="radiorow"><input type="radio" name="mruolo" value="${k}" ${k === m.ruolo ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div>
    ${tog('mattivo', 'Accesso attivo', m.stato === 'attivo', 'spento: non vede più niente finché non lo riattivi')}
    <div class="g2">${F('Nome', inp('mnome2', m.nome))}${F('Telefono', inp('mtel2', m.telefono, 'tel'))}</div>`,
  async fd => {
    const { error } = await store.tabella('membri').update({ ruolo: fd.get('mruolo'), stato: fd.get('mattivo') ? 'attivo' : 'sospeso', nome: String(fd.get('mnome2')).trim(), telefono: String(fd.get('mtel2')).trim() }).eq('user_id', m.user_id);
    if (error) throw Object.assign(error, { userMsg: 'Non sono riuscito a salvare' });
    toast('Accesso aggiornato'); caricaAccessi(true);
  }, { del: async () => { const { error } = await store.tabella('membri').delete().eq('user_id', m.user_id); if (error) throw Object.assign(error, { userMsg: 'Non sono riuscito a togliere l\'accesso' }); toast('Accesso tolto'); caricaAccessi(true); } });
}
async function confermaPren(p) {
  const r = ACC.membri.find(m => m.user_id === p.rivenditore) || {};
  const chi = r.azienda || r.nome || 'Rivenditore';
  const s = p.scheda || {};
  const testo = schedaTesto(p);
  const mat = (s.materiale || []).filter(x => x.tipo || x.qta).map(x => `${n2(x.qta) || ''} ${x.tipo || ''}`.trim()).join(', ');
  const base = { cliente: chi, indirizzo: p.indirizzo || '', telefono: p.telefono || '', prenotazioneId: p.id, clienteFinale: p.cliente || '', amm: 'da_cons' };
  base.clienteId = assicuraCliente(chi, { tipo: 'rivenditore', telefono: r.telefono, email: r.email });
  let kind, d;
  if (p.tipo === 'posa') { kind = 'lavori'; d = { ...base, data: p.data, dataFine: p.data_fine > p.data ? p.data_fine : '', soloFeriali: true, calcolo: 'pezzo', righe: [], installato: mat ? `Da posare: ${mat}` : '', note: testo.replace(/\n/g, ' · ') }; }
  else { kind = 'interventi'; d = { ...base, data: TODAY, dataProg: p.data, stato: 'programmato', urgenza: 'normale', descrizione: `${p.tipo === 'sopralluogo' ? 'SOPRALLUOGO\n' : ''}${testo}` }; }
  const id = store.put(kind, null, d);
  const { error } = await store.tabella('prenotazioni').update({ stato: 'confermata', lavoro_id: id, aggiornato: new Date().toISOString() }).eq('id', p.id);
  if (error) { store.drop(kind, id); throw Object.assign(error, { userMsg: 'Non sono riuscito a confermare, riprova' }); }
  toast(`Confermata: ${p.tipo === 'posa' ? 'posa' : 'intervento'} in calendario`);
  await caricaAccessi(true);
  return { kind, id };
}

/* ---------- vista RIVENDITORE ---------- */
const RIV = { mese: TODAY.slice(0, 7), occ: new Set(), mesiCaricati: new Set(), mie: [], da: '', a: '', carico: false, err: '', listino: null, listinoCarico: false, listinoErr: '', prev: null };
async function caricaRiv(forza) {
  const A = store.st.accesso;
  if (forza) { RIV.mesiCaricati.clear(); RIV.occ.clear(); }
  try {
    const da = RIV.mese + '-01', a = iso(new Date(+RIV.mese.slice(0, 4), +RIV.mese.slice(5, 7) + 1, 0));
    if (!RIV.mesiCaricati.has(RIV.mese)) {
      const occ = await store.rpc('disponibilita', { da, a: piuGiorni(a, 7) });
      (occ || []).forEach(g => RIV.occ.add(String(g).slice(0, 10)));
      RIV.mesiCaricati.add(RIV.mese);
    }
    const { data, error } = await store.tabella('prenotazioni').select('*').order('data', { ascending: false }).limit(60);
    if (error) throw error;
    RIV.mie = data; RIV.err = '';
  } catch (e) { console.warn(e); RIV.err = e.userMsg || 'Non riesco a leggere il calendario: controlla la rete.'; }
  RIV.carico = true; render(); void A;
}
function statoGiorno(k) {
  const A = store.st.accesso, dow = pd(k).getDay();
  const mia = RIV.mie.find(p => ['richiesta', 'confermata'].includes(p.stato) && k >= p.data && k <= p.data_fine);
  if (mia) return ['mia', mia.stato === 'confermata' ? 'Tua · confermata' : 'Tua · da confermare'];
  if (!(A.giorni || [1, 2, 3, 4, 5]).includes(dow) || festivi(+k.slice(0, 4)).has(k)) return ['chiuso', 'Chiuso'];
  if (RIV.occ.has(k)) return ['occ', 'Occupato'];
  if (k < piuGiorni(TODAY, A.preavviso ?? 2)) return ['no', k < TODAY ? '' : 'Preavviso troppo breve'];
  const max = new Date(pd(TODAY)); max.setMonth(max.getMonth() + (A.mesi ?? 4));
  if (k > iso(max)) return ['no', 'Non ancora prenotabile'];
  return ['lib', 'Libero'];
}
function rRivenditore() {
  const A = store.st.accesso;
  if (!RIV.carico) { caricaRiv(); return `<div class="empty">Caricamento del calendario…</div>`; }
  const [y, m] = RIV.mese.split('-').map(Number);
  const first = new Date(y, m - 1, 1), off = (first.getDay() + 6) % 7, dim = new Date(y, m, 0).getDate();
  let cells = ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < off; i++) cells += '<div class="day blank"></div>';
  for (let d = 1; d <= dim; d++) {
    const k = `${RIV.mese}-${String(d).padStart(2, '0')}`; const [s, l] = statoGiorno(k);
    const sel = RIV.da && (k === RIV.da || (RIV.a && k >= RIV.da && k <= RIV.a));
    cells += `<button class="day rv-${s} ${sel ? 'sel' : ''} ${k === TODAY ? 'today' : ''}" data-act="rivGiorno" data-arg="${k}" ${s === 'lib' || sel ? '' : 'aria-disabled="true"'} aria-label="${fmtD(k)}: ${l}" title="${l}" type="button"><span class="n">${d}</span><span class="rvl">${s === 'lib' ? 'libero' : s === 'occ' ? 'occupato' : s === 'mia' ? 'tua' : ''}</span></button>`;
  }
  const lavorative = RIV.da ? giorniLavorativi(RIV.da, RIV.a || RIV.da).length : 0;
  const attive = RIV.mie.filter(p => p.stato !== 'annullata' && p.data_fine >= TODAY);
  const vecchie = RIV.mie.filter(p => !attive.includes(p)).slice(0, 10);
  return `<div class="rivhead"><div><div class="small muted">Calendario di</div><h2>${esc(A.installatore || 'Cassero Installazioni')}</h2></div>${A.telefonoInstallatore ? `<a class="btn sm" href="tel:${esc(A.telefonoInstallatore)}">Chiama</a>` : ''}</div>
  <div class="small muted">Ciao ${esc(A.azienda || A.nome || '')}: le giornate <b>libere</b> si possono prenotare. Tocca il primo giorno e, se ti servono più giorni, l'ultimo. Ogni prenotazione la confermo io.</div>
  ${RIV.err ? `<div class="notice small">${esc(RIV.err)}</div>` : ''}
  <section class="stack">
    <div class="cal-head"><button class="iconbtn" data-act="rivMese" data-arg="-1" aria-label="Mese precedente" type="button" ${RIV.mese <= TODAY.slice(0, 7) ? 'disabled' : ''}>${svg('l')}</button><h2>${monthName(RIV.mese)}</h2><button class="iconbtn" data-act="rivMese" data-arg="1" aria-label="Mese successivo" type="button">${svg('r')}</button></div>
    <div class="cal rivcal">${cells}</div>
    <div class="legend"><span><i class="lg rv-lib"></i> libero</span><span><i class="lg rv-occ"></i> occupato</span><span><i class="lg rv-mia"></i> tue prenotazioni</span><span><i class="lg rv-chiuso"></i> chiuso</span></div>
    ${RIV.da ? `<div class="selbar"><div><b>${RIV.a && RIV.a !== RIV.da ? `Dal ${fmtD(RIV.da, { day: 'numeric', month: 'short' })} al ${fmtD(RIV.a, { day: 'numeric', month: 'short' })}` : fmtD(RIV.da, { weekday: 'long', day: 'numeric', month: 'long' })}</b><div class="small">${lavorative} ${lavorative === 1 ? 'giornata' : 'giornate'} di lavoro${RIV.a ? '' : ' · tocca un altro giorno per prenderne di più'}</div></div><div class="row"><button class="btn sm" data-act="rivAnnullaSel" type="button">Annulla</button><button class="btn sm primary" data-act="rivPrenota" type="button">Prenota</button></div></div>` : ''}
  </section>
  <section class="stack"><h3>Le tue prenotazioni</h3>
    ${attive.map(cardMiaPren).join('') || `<div class="empty small">Nessuna prenotazione in corso.</div>`}
    ${vecchie.length ? `<details><summary class="small muted">Precedenti e annullate</summary><div class="stack">${vecchie.map(cardMiaPren).join('')}</div></details>` : ''}
  </section>
  <div class="row between small muted"><span>${esc(store.st.email)}</span><button class="linkbtn" data-act="logout" type="button">Esci</button></div>`;
}
function giorniLavorativi(da, a) {
  const g = store.st.accesso.giorni || [1, 2, 3, 4, 5], out = [];
  for (let k = da; k <= a; k = piuGiorni(k, 1)) if (g.includes(pd(k).getDay()) && !festivi(+k.slice(0, 4)).has(k)) out.push(k);
  return out;
}
function cardMiaPren(p) {
  const st = { richiesta: ['warn', 'Da confermare'], confermata: ['ok', 'Confermata'], rifiutata: ['bad', 'Non disponibile'], annullata: ['', 'Annullata'] }[p.stato];
  return `<div class="card"><div class="row between"><span class="t">${p.data_fine > p.data ? `${fmtD(p.data, { day: 'numeric', month: 'short' })} – ${fmtD(p.data_fine, { day: 'numeric', month: 'short' })}` : fmtD(p.data, { weekday: 'short', day: 'numeric', month: 'short' })}</span><span class="chip ${st[0]}">${st[1]}</span></div>
    <div class="small muted">${{ posa: 'Posa', intervento: 'Intervento', sopralluogo: 'Sopralluogo' }[p.tipo]} · ${esc(p.cliente || '')} · ${esc(p.indirizzo || '')}</div>
    ${p.risposta ? `<div class="small">Risposta: ${esc(p.risposta)}</div>` : ''}
    ${p.stato === 'richiesta' ? `<button class="linkbtn small" data-act="rivAnnulla" data-id="${p.id}" type="button">Annulla la richiesta</button>` : ''}</div>`;
}
function sheetPrenota() {
  const da = RIV.da, a = RIV.a || RIV.da;
  openSheet('Prenota', `
    <div class="notice small"><b>${a > da ? `Dal ${fmtD(da, { day: 'numeric', month: 'long' })} al ${fmtD(a, { day: 'numeric', month: 'long' })}` : fmtD(da, { weekday: 'long', day: 'numeric', month: 'long' })}</b> · le giornate restano bloccate per te finché non confermo.</div>
    ${F('Cosa serve', sel('ptipo', [['posa', 'Posa'], ['intervento', 'Intervento / assistenza'], ['sopralluogo', 'Sopralluogo / misure']], 'posa'))}
    <div class="fieldset"><span class="fs-t">Cliente e cantiere</span>
      <div class="g2">${F('Cliente finale', inp('pcliente', '', 'text', 'required'))}${F('Telefono cliente', inp('ptel', '', 'tel', 'required'))}</div>
      ${F('Indirizzo del cantiere', inp('pind', '', 'text', 'required placeholder="Via, civico, comune"'))}
      <div class="g2">${SCHEDA.slice(0, 3).map(([k, l, t]) => F(l, inp('ps_' + k, '', t === 'testo' ? 'text' : t))).join('')}</div>
    </div>
    <div class="fieldset"><span class="fs-t">Accesso al cantiere</span>
      <div class="g2">${SCHEDA.slice(3, 9).map(([k, l, o]) => F(l, sel('ps_' + k, [['', '—'], ...o.map(x => [x, x])], ''))).join('')}</div>
      ${F(SCHEDA[9][1], inp('ps_orari', '', 'text', 'placeholder="Es. dopo le 9, chiavi dal vicino, ZTL fino alle 10"'))}
    </div>
    <div class="fieldset"><span class="fs-t">Materiale da posare</span>
      <div id="pmat" class="stack">${rigaMat()}${rigaMat()}</div>
      <button type="button" class="btn sm" data-act="pmAdd">+ Riga</button>
      ${F('Misure e dettagli', `<textarea id="f_pmisure" name="pmisure" rows="2" placeholder="Misure, colori, tipo di posa, controtelai…"></textarea>`)}
    </div>
    ${F('Lavoro da fare', `<textarea id="f_pdescr" name="pdescr" rows="3" placeholder="Cosa c'è da fare, cosa togliere, finiture…"></textarea>`)}
    ${F('Note per l\'installatore', `<textarea id="f_pnote" name="pnote" rows="2"></textarea>`)}`,
  async fd => {
    const scheda = Object.fromEntries(SCHEDA.map(([k]) => [k, String(fd.get('ps_' + k) || '').trim()]).filter(([, v]) => v));
    const mt = fd.getAll('pm_tipo'), mq = fd.getAll('pm_qta'), mn = fd.getAll('pm_note');
    scheda.materiale = mt.map((t, i) => ({ tipo: t, qta: mq[i], note: String(mn[i] || '').trim() })).filter(r => r.tipo || r.qta || r.note);
    scheda.misure = String(fd.get('pmisure') || '').trim(); scheda.descrizione = String(fd.get('pdescr') || '').trim(); scheda.note = String(fd.get('pnote') || '').trim();
    await store.rpc('prenota', { da, a, tipo: fd.get('ptipo'), cliente: String(fd.get('pcliente')).trim(), indirizzo: String(fd.get('pind')).trim(), telefono: String(fd.get('ptel')).trim(), scheda });
    RIV.da = RIV.a = ''; toast('Prenotazione inviata: ti confermo appena possibile');
    await caricaRiv(true);
  }, { saveLabel: 'Invia prenotazione' });
}

/* ---------- vista DIPENDENTE ---------- */
const DIP = { lavori: [], moduli: [], carico: false, err: '' };
async function caricaDip() {
  try {
    const [l, m] = await Promise.all([store.rpc('miei_lavori', { da: piuGiorni(TODAY, -21), a: piuGiorni(TODAY, 180) }), store.rpc('miei_moduli')]);
    DIP.lavori = l || []; DIP.moduli = m || []; DIP.err = '';
  } catch (e) { console.warn(e); DIP.err = e.userMsg || 'Non riesco a leggere i lavori: controlla la rete.'; }
  DIP.carico = true; render();
}
const fineLav = x => x.dataFine && x.dataFine > x.data ? x.dataFine : x.data;
function rDipendente() {
  const A = store.st.accesso;
  if (!DIP.carico) { caricaDip(); return `<div class="empty">Caricamento dei tuoi lavori…</div>`; }
  const L = DIP.lavori;
  const oggiL = L.filter(x => x.data <= TODAY && fineLav(x) >= TODAY);
  const pross = L.filter(x => x.data > TODAY);
  const fatti = L.filter(x => fineLav(x) < TODAY).reverse();
  return `<div class="rivhead"><div><div class="small muted">Ciao ${esc((A.nome || '').split(' ')[0])}</div><h2>I tuoi lavori</h2></div><button class="btn sm" data-act="dipAggiorna" type="button">Aggiorna</button></div>
  ${DIP.err ? `<div class="notice small">${esc(DIP.err)}</div>` : ''}
  <section class="stack"><h3>Oggi</h3>${oggiL.map(cardDip).join('') || '<div class="empty small">Oggi niente in calendario per te.</div>'}</section>
  <section class="stack"><h3>Prossimi</h3>${pross.map(cardDip).join('') || '<div class="empty small">Nessun lavoro in programma.</div>'}</section>
  ${fatti.length ? `<section class="stack"><h3>Ultimi giorni</h3>${fatti.slice(0, 15).map(cardDip).join('')}</section>` : ''}
  <section class="stack"><h3>Moduli che hai compilato</h3>${DIP.moduli.map(m => `<div class="card" role="button" tabindex="0" data-act="dipMod" data-id="${esc(m.id)}"><div class="row between"><span class="t">${esc(m.titolo)}</span><span class="chip ${m.stato === 'firmato' ? 'ok' : ''}">${m.stato === 'firmato' ? 'Firmato' : 'Da firmare'}</span></div><div class="small muted">${esc(m.cliente || '')} · ${fmtD(m.data)}</div></div>`).join('') || '<div class="empty small">Ancora nessuno: li compili dal lavoro, con il tasto Modulo.</div>'}</section>
  <div class="row between small muted"><span>${esc(store.st.email)}</span><button class="linkbtn" data-act="logout" type="button">Esci</button></div>`;
}
function cardDip(x) {
  const mio = x.mio || {};
  const giorni = x.dataFine && x.dataFine > x.data ? `dal ${fmtD(x.data, { weekday: 'short', day: 'numeric', month: 'short' })} al ${fmtD(x.dataFine, { weekday: 'short', day: 'numeric', month: 'short' })}` : fmtD(x.data, { weekday: 'long', day: 'numeric', month: 'long' });
  const voci = (x.voci || []).filter(v => v.descr);
  const altri = (x.squadra || []).map(s => s.nome).filter(n => n && n !== store.st.accesso.nome);
  return `<div class="card dipcard"><div class="row between"><span class="t">${x.kind === 'lavori' ? 'Posa' : 'Intervento'} · ${esc(x.cliente || '')}</span>${mio.fatto ? '<span class="chip ok">Fatto</span>' : x.urgente ? '<span class="chip bad">Urgente</span>' : ''}</div>
    <div class="small"><b>${giorni}</b></div>
    ${x.indirizzo ? `<div class="small">${svg('pin', 'i')} ${esc(x.indirizzo)}</div>` : ''}
    ${x.telefono ? `<div class="small"><a href="tel:${esc(x.telefono)}">${esc(x.telefono)}</a></div>` : ''}
    ${voci.length ? `<div class="small">${voci.map(v => `${num(v.qta)} ${esc(v.unita || '')} ${esc(v.descr)}`).join(' · ')}</div>` : x.installato ? `<div class="small">${esc(x.installato)}</div>` : ''}
    ${x.descrizione ? `<div class="small prewrap">${esc(x.descrizione)}</div>` : ''}
    ${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}
    ${(x.materiali || []).length ? `<div class="small muted">Materiale: ${x.materiali.map(m => `${esc(m.nome)} ${num(m.qta)}`).join(', ')}</div>` : ''}
    ${altri.length ? `<div class="small muted">Con: ${altri.map(esc).join(', ')}</div>` : ''}
    ${mio.ore || mio.note ? `<div class="small muted">Tu: ${mio.ore ? num(mio.ore, 2) + ' ore' : ''}${mio.note ? ' · ' + esc(mio.note) : ''}</div>` : ''}
    ${x.indirizzo ? bottoniNav(x.indirizzo) : ''}
    <div class="row"><button class="btn sm primary" data-act="dipSegna" data-arg="${x.kind}" data-id="${esc(x.id)}" type="button">Ore e foto</button><button class="btn sm" data-act="dipModulo" data-arg="${x.kind}" data-id="${esc(x.id)}" type="button">Modulo</button></div></div>`;
}
let dipFoto = [];
function sheetSegna(x) {
  const mio = x.mio || {};
  dipFoto = [...(mio.foto || [])];
  const ore = mio.ore ?? oreGiornata(store.st.accesso.giornata && store.st.accesso.giornata.inizio ? store.st.accesso.giornata : IMP().giornata);
  openSheet(`${x.cliente || 'Lavoro'}`, `
    <div class="g2">${F('Ore lavorate', inp('dore', ore, 'number'))}<div class="f"><span>&nbsp;</span>${tog('dfatto', 'Lavoro finito', !!mio.fatto)}</div></div>
    ${F('Note per il titolare', `<textarea id="f_dnote" name="dnote" rows="3" placeholder="Cosa hai fatto, cosa manca, problemi…">${esc(mio.note || '')}</textarea>`)}
    <div class="fieldset"><span class="fs-t">Foto del cantiere</span><div class="thumbs" id="dipThumbs">${dipFoto.map(f => `<img data-file="${esc(f)}" alt="">`).join('')}</div>
      <label class="btn sm">${svg('cam', 'i')} Aggiungi foto<input type="file" id="dipFotoIn" accept="image/*" multiple hidden></label></div>`,
  async fd => {
    await store.rpc('segna_lavoro', { k: x.kind, rid: x.id, dati: { ore: n2(fd.get('dore')), fatto: !!fd.get('dfatto'), note: String(fd.get('dnote') || '').trim(), foto: dipFoto } });
    toast('Inviato al titolare'); caricaDip();
  }, { saveLabel: 'Invia' });
}
async function aggiungiFotoDip(files) {
  for (const f of files) {
    try {
      toast('Carico la foto…');
      const blob = await rimpicciolisci(f);
      const p = await store.uploadFile(blob, 'foto.jpg'); dipFoto.push(p);
      $('#dipThumbs')?.insertAdjacentHTML('beforeend', `<img data-file="${esc(p)}" alt="">`);
      hydrateFiles($('#dipThumbs'));
    } catch (e) { toast(e.userMsg || 'Foto non caricata'); }
  }
  toast(`${files.length === 1 ? 'Foto pronta' : 'Foto pronte'}: tocca Invia`);
}
function rimpicciolisci(file) {
  return new Promise(res => {
    const im = new Image(); const u = URL.createObjectURL(file);
    im.onload = () => { const s = Math.min(1, 1600 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(b => res(b || file), 'image/jpeg', 0.8); };
    im.onerror = () => res(file); im.src = u;
  });
}


/* ---------- listino e preventivi per i rivenditori ---------- */
const PIANI = ['Piano terra', '1° piano', '2° piano', '3° piano', '4° piano', '5° piano o più', 'Su più piani'];
const GRUPPI_ESCLUSI = ['Smontaggio, scarico, tiro al piano e tariffa oraria', 'Assistenza e manutenzione'];
const vociPrev = L => L.voci.filter(v => !GRUPPI_ESCLUSI.includes(v.gruppo) && (v.unita || 'pz') === 'pz');
const nomeVoce = v => v.variante ? `${v.nome} – ${v.variante}` : v.nome;
/** Stima del preventivo dai dati del rivenditore: posa + smontaggio/smuratura + tiro al piano. */
function stimaPrev(d, L) {
  const V = id => L.voci.find(v => v.id === id);
  const out = [];
  const add = (v, qta, descr) => { if (!v || !n2(qta)) return; const p = v.prezzo == null || v.prezzo === '' ? null : n2(v.prezzo); out.push({ voce: v.id, descr: descr || nomeVoce(v), qta: n2(qta), prezzo: p, tot: p == null ? 0 : p * n2(qta) }); };
  let smon = 0, smur = 0, tiro = 0;
  for (const r of d.righe || []) {
    const v = V(r.voce); if (!v || !n2(r.qta)) continue;
    add(v, r.qta);
    if (r.vecchio === 'smontaggio') smon += n2(r.qta);
    if (r.vecchio === 'smuratura') smur += n2(r.qta);
    if (d.tiro && v.id !== 'alz') tiro += n2(r.qta);
  }
  add(V('smon'), smon, 'Smontaggio vecchi serramenti');
  add(V('smur'), smur, 'Smuratura vecchio telaio');
  add(V('tiro'), tiro, 'Tiro al piano');
  return { righe: out, totale: out.reduce((s, r) => s + r.tot, 0), daConcordare: out.some(r => r.prezzo == null) };
}
const LISTINO_RIV = () => { const l = RIV.listino?.listino; return l && Array.isArray(l.voci) ? { ...LISTINO_BASE, ...l } : LISTINO_BASE; };
async function caricaListinoRiv() {
  try { RIV.listino = await store.rpc('listino_rivenditore'); RIV.listinoErr = ''; }
  catch (e) { RIV.listino = null; RIV.listinoErr = /find the function|does not exist/i.test(e.message || '') ? 'Il listino non è ancora disponibile.' : (e.userMsg || 'Non riesco a leggere il listino.'); }
  try { const { data, error } = await store.tabella('richieste_preventivo').select('*').order('creato', { ascending: false }).limit(40); if (!error) RIV.prev = data; } catch {}
  RIV.listinoCarico = true; render();
}
function rRivTabs() {
  const t = UI.rivTab || 'cal';
  return `<div class="seg rivtabs" role="tablist">${[['cal', 'Calendario'], ['prev', 'Preventivo'], ['listino', 'Listino']].map(([k, l]) => `<button type="button" data-act="rivTab" data-arg="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div>`;
}
function rRivListino() {
  if (!RIV.listinoCarico) { caricaListinoRiv(); return `<div class="empty">Caricamento del listino…</div>`; }
  if (RIV.listinoErr) return `<div class="notice small">${esc(RIV.listinoErr)}</div>`;
  if (RIV.listino && RIV.listino.visibile === false) return `<div class="empty small">Il listino non è disponibile: chiedi i prezzi all'installatore.</div>`;
  const L = LISTINO_RIV();
  const gruppi = [...new Set(L.voci.map(v => v.gruppo))];
  return `<div class="row between"><h2>Listino ${esc(L.anno || '')}</h2><button class="btn primary" data-act="rivListinoPdf" type="button">${svg('doc', 'i')} PDF</button></div>
  <div class="small muted">Prezzi di posa IVA esclusa. Trasferta ${eur(L.euroKm ?? 1)}/km · urgenza +${num(L.urgenzaPct ?? 10)}%.</div>
  ${gruppi.map(g => `<section class="panel"><div class="fs-t">${esc(g)}</div>${L.voci.filter(v => v.gruppo === g).map(v => `<div class="list-line"><div><b>${esc(v.nome)}</b>${v.variante ? `<div class="small muted">${esc(v.variante)}</div>` : ''}${v.magg === 'blindato' ? `<div class="small muted">Blindato + ${eur(L.maggBlindato)}</div>` : v.magg === 'luce' ? `<div class="small muted">In luce + ${eur(L.maggLuce)}</div>` : ''}</div><div class="r"><b class="num">${v.prezzo == null || v.prezzo === '' ? 'da concordare' : eur(v.prezzo)}</b><div class="small muted">${{ pz: 'a pezzo', ora: 'a ora', corpo: 'a corpo' }[v.unita || 'pz'] || ''}</div></div></div>`).join('')}</section>`).join('')}`;
}
function rRivPreventivo() {
  if (!RIV.listinoCarico) { caricaListinoRiv(); return `<div class="empty">Caricamento…</div>`; }
  const P = RIV.prev || [];
  const ST = { nuova: ['warn', 'Inviata'], in_lavorazione: ['warn', 'In preparazione'], inviato: ['ok', 'Preventivo pronto'], chiusa: ['', 'Chiusa'] };
  return `<div class="row between"><h2>Preventivi</h2><button class="btn primary" data-act="rivPrevNuovo" type="button">${svg('plus')} Richiedi</button></div>
  <div class="small muted">Scrivi tipologie e quantità, luogo, piano e se c'è da smontare o smurare: vedi subito una stima e la richiesta arriva all'installatore, che ti manda il preventivo.</div>
  ${RIV.listinoErr && !RIV.prev ? `<div class="notice small">${esc(RIV.listinoErr)}</div>` : ''}
  <section class="stack">${P.map(r => { const st = ST[r.stato] || ST.nuova; const tot = (r.righe || []).reduce((s, x) => s + n2(x.qta), 0); return `<div class="card"><div class="row between"><span class="t">${esc(r.cliente || r.indirizzo || 'Richiesta')}</span><span class="chip ${st[0]}">${st[1]}</span></div>
    <div class="small muted">${new Date(r.creato).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} · ${esc(r.indirizzo || '')}${r.piano ? ' · ' + esc(r.piano) : ''} · ${num(tot)} pz${r.stima ? ' · stima ' + eur(r.stima) : ''}</div>
    ${r.risposta ? `<div class="small">${esc(r.risposta)}</div>` : ''}</div>`; }).join('') || '<div class="empty small">Nessuna richiesta di preventivo.</div>'}</section>`;
}
const rigaPrevRiv = (L, r = {}) => {
  const gruppi = [...new Set(vociPrev(L).map(v => v.gruppo))];
  return `<div class="prevriga"><select name="rv_voce" aria-label="Tipologia"><option value="">Tipologia…</option>${gruppi.map(g => `<optgroup label="${esc(g)}">${vociPrev(L).filter(v => v.gruppo === g).map(v => `<option value="${esc(v.id)}" ${v.id === r.voce ? 'selected' : ''}>${esc(nomeVoce(v))}</option>`).join('')}</optgroup>`).join('')}</select>
    <input name="rv_qta" type="number" inputmode="numeric" min="0" placeholder="Q.tà" value="${esc(r.qta || '')}" aria-label="Quantità">
    <select name="rv_vecchio" aria-label="Vecchio serramento"><option value="">Nuovo, niente da togliere</option><option value="smontaggio" ${r.vecchio === 'smontaggio' ? 'selected' : ''}>Con smontaggio del vecchio</option><option value="smuratura" ${r.vecchio === 'smuratura' ? 'selected' : ''}>Con smuratura del vecchio telaio</option></select>
    <button type="button" class="iconbtn" data-act="rvRm" aria-label="Togli riga">×</button></div>`;
};
function leggiPrevRiv(fd) {
  const v = fd.getAll('rv_voce'), q = fd.getAll('rv_qta'), o = fd.getAll('rv_vecchio');
  const righe = v.map((voce, i) => ({ voce, qta: n2(q[i]), vecchio: o[i] || '' })).filter(r => r.voce && r.qta > 0);
  const L = LISTINO_RIV();
  righe.forEach(r => { const vv = L.voci.find(x => x.id === r.voce); r.descr = vv ? nomeVoce(vv) : r.voce; });
  return { cliente: String(fd.get('rv_cliente') || '').trim(), telefono: String(fd.get('rv_tel') || '').trim(), indirizzo: String(fd.get('rv_luogo') || '').trim(), piano: fd.get('rv_piano') || '', ascensore: fd.get('rv_asc') || '', tiro: !!fd.get('rv_tiro'), righe, note: String(fd.get('rv_note') || '').trim() };
}
function aggiornaStimaRiv() {
  const f = $('#sheetForm'), box = $('#stimaRiv'); if (!f || !box) return;
  const d = leggiPrevRiv(new FormData(f)), L = LISTINO_RIV(), s = stimaPrev(d, L);
  box.innerHTML = s.righe.length ? `${s.righe.map(r => `<div class="row between small"><span>${num(r.qta)} × ${esc(r.descr)}</span><span class="num">${r.prezzo == null ? 'da concordare' : eur(r.tot)}</span></div>`).join('')}
    <div class="row between stimatot"><b>Stima posa</b><b class="num">${eur(s.totale)}</b></div><div class="small muted">IVA esclusa${s.daConcordare ? ', voci da concordare escluse' : ''}. Trasferta (${eur(L.euroKm ?? 1)}/km) ed eventuali extra esclusi: il preventivo definitivo lo prepara l'installatore.</div>`
    : `<div class="small muted">Aggiungi tipologia e quantità per vedere la stima.</div>`;
}
function sheetPrevRiv() {
  const L = LISTINO_RIV();
  openSheet('Richiesta di preventivo', `
    <div class="fieldset"><span class="fs-t">Cantiere</span>
      ${F('Luogo del cantiere', inp('rv_luogo', '', 'text', 'required placeholder="Comune e indirizzo"'))}
      <div class="g2">${F('Cliente finale', inp('rv_cliente', '', 'text', 'placeholder="Facoltativo"'))}${F('Telefono', inp('rv_tel', '', 'tel', 'placeholder="Facoltativo"'))}</div>
      <div class="g2">${F('Piano', sel('rv_piano', PIANI.map(p => [p, p]), 'Piano terra'))}${F('Ascensore', sel('rv_asc', [['', '—'], ['Sì', 'Sì'], ['No', 'No']], ''))}</div>
      ${tog('rv_tiro', 'Tiro al piano', false, 'si segna da solo se il piano è alto e non c\'è ascensore')}
    </div>
    <div class="fieldset"><span class="fs-t">Tipologie e quantità</span>
      <div id="rvRighe" class="stack">${rigaPrevRiv(L)}${rigaPrevRiv(L)}</div>
      <button type="button" class="btn sm" data-act="rvAdd">+ Tipologia</button>
    </div>
    ${F('Note (misure, colori, accessi…)', `<textarea id="f_rv_note" name="rv_note" rows="3"></textarea>`)}
    <div class="fieldset stima"><span class="fs-t">Stima</span><div id="stimaRiv"></div></div>`,
  async fd => {
    const d = leggiPrevRiv(fd);
    if (!d.righe.length) throw Object.assign(new Error('vuoto'), { userMsg: 'Aggiungi almeno una tipologia con la quantità' });
    d.stima = Math.round(stimaPrev(d, L).totale * 100) / 100;
    await store.rpc('chiedi_preventivo', { dati: d });
    toast('Richiesta inviata: ti arriva il preventivo'); RIV.listinoCarico = false; UI.rivTab = 'prev'; render();
  }, { saveLabel: 'Invia richiesta' });
  aggiornaStimaRiv();
}
async function pdfListino(listino, azienda, nome) {
  await caricaImmagini();
  const bytes = creaListino({ listino, azienda, immagini: IMG });
  mostraPdf(bytes, nome, 'Listino', null);
}
// richieste di preventivo lato titolare
const ACC_PREV = { L: [], ok: null };
async function caricaRichiestePrev() {
  try { const { data, error } = await store.tabella('richieste_preventivo').select('*').in('stato', ['nuova', 'in_lavorazione']).order('creato'); if (error) throw error; ACC_PREV.L = data; ACC_PREV.ok = true; }
  catch { ACC_PREV.L = []; ACC_PREV.ok = false; }
}
function cardRichPrev(r) {
  const m = ACC.membri.find(x => x.user_id === r.rivenditore) || {};
  const pz = (r.righe || []).map(x => `${num(x.qta)} ${x.descr || x.voce}${x.vecchio ? ' (' + x.vecchio + ')' : ''}`).join(', ');
  return `<div class="card"><div class="row between"><span class="t">${esc(m.azienda || m.nome || 'Rivenditore')}</span><span class="chip ${r.stato === 'nuova' ? 'warn' : ''}">${r.stato === 'nuova' ? 'Nuova' : 'In preparazione'}</span></div>
    <div class="small"><b>${esc(r.indirizzo || '')}</b>${r.piano ? ' · ' + esc(r.piano) : ''}${r.ascensore ? ' · ascensore ' + esc(r.ascensore.toLowerCase()) : ''}${r.tiro ? ' · tiro al piano' : ''}${r.cliente ? ' · ' + esc(r.cliente) : ''}</div>
    <div class="small">${esc(pz)}</div>${r.note ? `<div class="small muted">${esc(r.note)}</div>` : ''}
    ${r.stima ? `<div class="small muted">Stima vista dal rivenditore: ${eur(r.stima)}</div>` : ''}
    <div class="row"><button class="btn sm primary" data-act="richPrevCrea" data-id="${r.id}" type="button">${r.preventivo_id ? 'Apri il preventivo' : 'Crea preventivo'}</button><button class="btn sm" data-act="richPrevChiudi" data-id="${r.id}" type="button">Archivia</button></div></div>`;
}
function preventivoDaRichiesta(r) {
  const m = ACC.membri.find(x => x.user_id === r.rivenditore) || {};
  const s = stimaPrev(r, LIST());
  const az = AZ();
  return { numero: prossimoNumero(S.preventivi, TODAY.slice(0, 4)), data: TODAY, stato: 'bozza', validita: +az.validitaGiorni || 30, iva: az.ivaPredefinita, condizioni: true,
    cliente: { nome: m.azienda || m.nome || 'Rivenditore', tipo: 'rivenditore', telefono: m.telefono || '', email: m.email || '' },
    cantiere: r.indirizzo || '', oggetto: [r.cliente && `Cliente finale: ${r.cliente}`, [r.piano, r.ascensore && `ascensore ${r.ascensore.toLowerCase()}`].filter(Boolean).join(', '), r.note].filter(Boolean).join('\n'),
    righe: s.righe.map(x => { const v = LIST().voci.find(y => y.id === x.voce); return v ? { ...rigaDaVoce(v, x.qta), descr: x.descr } : null; }).filter(Boolean),
    richiestaRiv: r.id };
}
/** Quando salvi il preventivo nato da una richiesta, il rivenditore vede a che punto è. */
function aggiornaRichiestaPrev(d, id) {
  if (!d.richiestaRiv || store.st.mode === 'demo') return;
  const t = totali(d, LIST());
  const fatto = d.stato !== 'bozza';
  store.tabella('richieste_preventivo').update({ stato: fatto ? 'inviato' : 'in_lavorazione', preventivo_id: id, aggiornato: new Date().toISOString(),
    risposta: fatto ? `Preventivo N. ${d.numero} del ${fmtD(d.data)}: ${eur(t.totale)} (${t.ivaLabel})` : null }).eq('id', d.richiestaRiv).then(({ error }) => { if (!error) caricaRichiestePrev().then(render); });
}
document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#rvRighe, [name="rv_piano"], [name="rv_asc"], [name="rv_tiro"]')) aggiornaStimaRiv(); });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'rv_piano' || t.name === 'rv_asc') { const tiro = $('#f_rv_tiro'); if (tiro && !tiro.dataset.toccato) { const p = $('#f_rv_piano').value, a = $('#f_rv_asc').value; tiro.checked = p !== 'Piano terra' && a !== 'Sì'; } aggiornaStimaRiv(); }
  if (t.name === 'rv_tiro') { t.dataset.toccato = '1'; aggiornaStimaRiv(); }
  if (t.closest && t.closest('#rvRighe')) aggiornaStimaRiv();
  if (t.id === 'f_accListino') salvaImp({ accessi: { ...(S.impostazioni?.accessi || {}), listino: t.checked } });
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id;
  switch (a) {
    case 'rivTab': UI.rivTab = b.dataset.arg; render(); window.scrollTo({ top: 0 }); break;
    case 'rivListinoPdf': { const L = LISTINO_RIV(); await pdfListino(L, RIV.listino?.azienda || {}, `Listino posa ${L.anno || ''} ${(RIV.listino?.azienda?.ragioneSociale || 'Cassero')}`.trim().replace(/[\/\\:*?"<>|]+/g, '-') + '.pdf'); break; }
    case 'rivPrevNuovo': sheetPrevRiv(); break;
    case 'rvAdd': $('#rvRighe').insertAdjacentHTML('beforeend', rigaPrevRiv(LISTINO_RIV())); break;
    case 'rvRm': { const box = $('#rvRighe'); if (box.children.length > 1) b.closest('.prevriga').remove(); else b.closest('.prevriga').querySelectorAll('select,input').forEach(x => { x.value = ''; }); aggiornaStimaRiv(); break; }
    case 'listinoPdf': { const L = LIST(); await pdfListino(L, AZ(), `Listino posa ${L.anno || ''}.pdf`); break; }
    case 'richPrevCrea': {
      const r = ACC_PREV.L.find(x => x.id === id); if (!r) break;
      const esiste = r.preventivo_id && S.preventivi.find(p => p.id === r.preventivo_id);
      sheetPrev(esiste || preventivoDaRichiesta(r)); break;
    }
    case 'richPrevChiudi': { if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tocca di nuovo per archiviare'; break; } await store.tabella('richieste_preventivo').update({ stato: 'chiusa', aggiornato: new Date().toISOString() }).eq('id', id); await caricaRichiestePrev(); render(); break; }
  }
});

/* ---------- senza accesso / primo accesso ---------- */
function rSenzaAccesso() {
  const sosp = store.st.ruolo === 'sospeso';
  return `<div class="auth"><h2>${sosp ? 'Accesso sospeso' : 'Accesso in attesa'}</h2>
    <div class="panel stack"><div>${sosp ? 'Il tuo accesso è stato sospeso. Se pensi sia un errore, chiama il titolare.' : `L'account <b>${esc(store.st.email)}</b> non ha ancora un accesso. Se hai già mandato la richiesta, aspetta la conferma: ti arriva un messaggio con le istruzioni.`}</div>
    <div class="row"><button class="btn" data-act="accRicontrolla" type="button">Ricontrolla</button><button class="btn" data-act="logout" type="button">Esci</button></div></div></div>`;
}
function rCambioPw() {
  return `<div class="auth"><h2>Scegli la tua password</h2>
    <form class="panel" id="cambioPwForm"><div class="small muted">Stai usando una password provvisoria. Scegline una tua: la userai d'ora in poi su tutti i dispositivi.</div>
      <label class="f"><span>Nuova password</span><input name="pw1" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="f"><span>Ripeti la password</span><input name="pw2" type="password" autocomplete="new-password" minlength="8" required></label>
      ${UI.authErr ? `<div class="err">${esc(UI.authErr)}</div>` : ''}
      <button class="btn primary" type="submit">Salva e continua</button></form></div>`;
}
function rRichiesta() {
  const inst = !(window.navigator.standalone || matchMedia('(display-mode: standalone)').matches) && /iphone|ipad/i.test(navigator.userAgent);
  return `<div class="auth">
    <h2>Richiedi l'accesso</h2>
    ${inst ? `<div class="notice small"><b>Per averla come app:</b> tocca <b>Condividi</b> in Safari › <b>Aggiungi alla schermata Home</b>.</div>` : ''}
    <form class="panel" id="richiestaForm">
      <div class="g2">${F('Nome e cognome', inp('rnome', '', 'text', 'required autocomplete="name"'))}${F('Azienda', inp('razienda', '', 'text', 'autocomplete="organization"'))}</div>
      <div class="g2">${F('Email', inp('remail', '', 'email', 'required autocomplete="email"'))}${F('Telefono', inp('rtel', '', 'tel', 'autocomplete="tel"'))}</div>
      ${F('Sei un…', sel('rruolo', [['rivenditore', 'Rivenditore'], ['dipendente', 'Dipendente / collaboratore'], ['altro', 'Altro']], 'rivenditore'))}
      ${F('Messaggio (facoltativo)', `<textarea id="f_rmsg" name="rmsg" rows="2"></textarea>`)}
      ${UI.authErr ? `<div class="err">${esc(UI.authErr)}</div>` : ''}${UI.authMsg ? `<div class="notice">${esc(UI.authMsg)}</div>` : ''}
      <button class="btn primary" type="submit" id="richBtn">Invia richiesta</button>
    </form>
    <div class="row between small"><button class="linkbtn" data-act="authView" data-arg="login" type="button">Hai già email e password? Accedi</button></div>
    <p class="small muted">Riceverai email e password provvisoria quando la richiesta viene accettata.</p></div>`;
}

document.addEventListener('submit', async e => {
  if (e.target.id === 'richiestaForm') {
    e.preventDefault(); const fd = new FormData(e.target); UI.authErr = ''; UI.authMsg = '';
    const b = $('#richBtn'); b.disabled = true; b.textContent = 'Invio…';
    try {
      await store.rpc('richiedi_accesso', { codice: INVITO || null, nome: String(fd.get('rnome')).trim(), azienda: String(fd.get('razienda')).trim(), email: String(fd.get('remail')).trim(), telefono: String(fd.get('rtel')).trim(), ruolo: fd.get('rruolo'), messaggio: String(fd.get('rmsg') || '').trim() });
      UI.authMsg = 'Richiesta inviata. Quando viene accettata ricevi email e password per entrare.'; e.target.reset();
    } catch (err) { UI.authErr = err.userMsg || 'Richiesta non inviata, riprova.'; }
    render(); return;
  }
  if (e.target.id === 'cambioPwForm') {
    e.preventDefault(); const fd = new FormData(e.target); UI.authErr = '';
    const p1 = String(fd.get('pw1')), p2 = String(fd.get('pw2'));
    if (p1.length < 8) UI.authErr = 'Almeno 8 caratteri.'; else if (p1 !== p2) UI.authErr = 'Le due password non coincidono.';
    if (UI.authErr) return render();
    try { await store.setPassword(p1); await store.rpc('password_cambiata'); await store.leggiAccesso(); toast('Password salvata'); }
    catch (err) { UI.authErr = err.userMsg || err.message || 'Non riuscito, riprova.'; }
    render();
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'dipFotoIn') { const fs = [...(t.files || [])]; t.value = ''; aggiungiFotoDip(fs); }
  if (t.id === 'f_accPre' || t.id === 'f_accMesi') salvaImp({ accessi: { ...(S.impostazioni?.accessi || {}), [t.id === 'f_accPre' ? 'preavviso' : 'mesi']: +t.value } });
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, arg = b.dataset.arg, id = b.dataset.id;
  const imp = S.impostazioni?.accessi || {};
  const nuovoCodice = () => [...crypto.getRandomValues(new Uint8Array(12))].map(x => x.toString(16).padStart(2, '0')).join('');
  switch (a) {
    case 'accApri': case 'accLinkNuovo': salvaImp({ accessi: { ...imp, codice: nuovoCodice() } }); toast(a === 'accApri' ? 'Link creato' : 'Link cambiato: il vecchio non funziona più'); render(); break;
    case 'accChiudi': salvaImp({ accessi: { ...imp, codice: '' } }); toast('Richieste chiuse: chi ha già l\'accesso continua a entrare'); render(); break;
    case 'accCopia': try { await navigator.clipboard.writeText(linkApp(imp.codice)); toast('Link copiato'); } catch { prompt('Copia il link', linkApp(imp.codice)); } break;
    case 'accCondividi': { const u = linkApp(imp.codice); const t = `Ecco il link per il Diario di Posa di ${AZ().ragioneSociale || 'Cassero Installazioni'}: aprilo, aggiungilo alla schermata Home e chiedi l'accesso.`; try { if (navigator.share) await navigator.share({ title: 'Diario di Posa', text: t, url: u }); else { await navigator.clipboard.writeText(`${t}\n${u}`); toast('Messaggio copiato'); } } catch {} break; }
    case 'accNuovo': sheetDaiAccesso({}); break;
    case 'accDai': { const r = ACC.richieste.find(x => x.id === id); if (r) sheetDaiAccesso(r); break; }
    case 'accRifiuta': { if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tocca di nuovo per rifiutare'; break; } const { error } = await store.tabella('richieste_accesso').update({ stato: 'rifiutata' }).eq('id', id); toast(error ? 'Non riuscito' : 'Richiesta rifiutata'); caricaAccessi(true); break; }
    case 'accMembro': { const m = ACC.membri.find(x => x.user_id === id); if (m) sheetMembro(m); break; }
    case 'credCopia': try { await navigator.clipboard.writeText($('#credTxt').textContent); toast('Messaggio copiato'); } catch { toast('Seleziona il testo e copialo'); } break;
    case 'credShare': try { await navigator.share({ text: $('#credTxt').textContent }); } catch {} break;
    case 'prenConferma': { const p = ACC.pren.find(x => x.id === id); if (!p) break; b.disabled = true; try { await confermaPren(p); } catch (err) { toast(err.userMsg || 'Non riuscito'); b.disabled = false; } break; }
    case 'prenRifiuta': {
      const p = ACC.pren.find(x => x.id === id); if (!p) break;
      openSheet('Rifiuta la prenotazione', `${F('Motivo (lo vede il rivenditore)', inp('pmotivo', '', 'text', 'placeholder="Es. quel giorno non riesco, proponi un\'altra data"'))}`, async fd => {
        const { error } = await store.tabella('prenotazioni').update({ stato: 'rifiutata', risposta: String(fd.get('pmotivo') || '').trim(), aggiornato: new Date().toISOString() }).eq('id', p.id);
        if (error) throw Object.assign(error, { userMsg: 'Non riuscito' }); toast('Prenotazione rifiutata: le giornate tornano libere'); caricaAccessi(true);
      }, { saveLabel: 'Rifiuta' }); break;
    }
    case 'prenApri': { const p = ACC.pren.find(x => x.id === id); const l = p && S.lavori.find(x => x.id === p.lavoro_id); const i = p && S.interventi.find(x => x.id === p.lavoro_id); if (l) sheetLav(l); else if (i) sheetInt(i); else toast('Il lavoro non c\'è più nel calendario'); break; }
    case 'apriFile': e.preventDefault(); { const u = await store.fileUrl(arg); if (u) window.open(u, '_blank', 'noopener'); } break;
    case 'accRicontrolla': await store.leggiAccesso(); render(); if (['nessuno', 'sospeso'].includes(store.st.ruolo)) toast('Ancora nessun accesso'); else store.refresh(); break;
    // rivenditore
    case 'rivMese': RIV.mese = shiftMonth(RIV.mese, +arg); RIV.carico = RIV.mesiCaricati.has(RIV.mese); render(); break;
    case 'rivGiorno': {
      const [s] = statoGiorno(arg);
      if (RIV.da && !RIV.a && arg === RIV.da) { RIV.da = ''; render(); break; }
      if (s !== 'lib') { if (s === 'occ') toast('Giornata già occupata'); else if (s === 'chiuso') toast('Giornata non lavorativa'); else if (s === 'mia') toast('Questa giornata è già tua'); else toast(statoGiorno(arg)[1] || 'Non prenotabile'); break; }
      if (!RIV.da || RIV.a || arg < RIV.da) { RIV.da = arg; RIV.a = ''; render(); break; }
      for (let k = piuGiorni(RIV.da, 1); k < arg; k = piuGiorni(k, 1)) { const [sk] = statoGiorno(k); if (sk === 'occ' || sk === 'mia') { toast('In mezzo c\'è una giornata occupata: scegli date vicine'); RIV.da = arg; RIV.a = ''; render(); return; } }
      if (giorniLavorativi(RIV.da, arg).length > 11) { toast('Al massimo due settimane per prenotazione'); break; }
      RIV.a = arg; render(); break;
    }
    case 'rivAnnullaSel': RIV.da = RIV.a = ''; render(); break;
    case 'rivPrenota': if (RIV.da) sheetPrenota(); break;
    case 'pmAdd': $('#pmat').insertAdjacentHTML('beforeend', rigaMat()); break;
    case 'rivAnnulla': { if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tocca di nuovo per annullare'; break; } try { await store.rpc('annulla_prenotazione', { pid: id }); toast('Richiesta annullata'); caricaRiv(true); } catch (err) { toast(err.userMsg); } break; }
    // dipendente
    case 'dipAggiorna': DIP.carico = false; render(); break;
    case 'dipSegna': { const x = DIP.lavori.find(l => l.id === id && l.kind === arg); if (x) sheetSegna(x); break; }
    case 'dipModulo': { const x = DIP.lavori.find(l => l.id === id && l.kind === arg); if (!x) break; sheetScegliModello({ cliente: x.cliente, indirizzo: x.indirizzo, telefono: x.telefono, data: x.dataFine || x.data, dataLavoro: x.dataFine || x.data, descrizione: x.installato || x.descrizione, righe: (x.voci || []).map(v => ({ descr: v.descr, qta: v.qta, unita: v.unita })), ref: { kind: x.kind, id: x.id } }); break; }
    case 'dipMod': { const m = DIP.moduli.find(x => x.id === id); if (m && ufficiale(m.modelloId)) sheetModuloU(m, false); break; }
  }
});


/* ---------- magazzino ---------- */
function moveStock(items, sign, withCost) {
  for (const it of items || []) {
    const q = n2(it.qta); if (!it.nome || !q) continue;
    const id = slug(it.nome);
    const cur = S.magazzino.find(m => m.id === id);
    const data = { nome: cur?.nome || String(it.nome).trim(), unita: cur?.unita || it.unita || 'pz', qta: Math.round(((cur?.qta || 0) + sign * q) * 100) / 100, costoMedio: cur?.costoMedio || 0, soglia: cur?.soglia || 0 };
    if (cur?.esempio) data.esempio = true;
    if (withCost && sign > 0 && n2(it.prezzoUnit) > 0) {
      const oq = Math.max(cur?.qta || 0, 0);
      data.costoMedio = Math.round(((oq * (cur?.costoMedio || 0)) + q * n2(it.prezzoUnit)) / (oq + q) * 100) / 100;
    }
    store.put('magazzino', id, data);
  }
}
const LIST = () => (S.listino && Array.isArray(S.listino.voci) ? { ...LISTINO_BASE, ...S.listino } : LISTINO_BASE);
const AZ = () => ({ ...AZIENDA_BASE, ...(S.azienda || {}) });
const IMG = {};
async function caricaImmagini() {
  for (const [k, f] of [['logo', 'icone/logo-cassero.jpg'], ['posaclima', 'icone/badge-posaclima.jpg'], ['dekra', 'icone/badge-dekra.jpg']]) {
    if (IMG[k]) continue;
    try { const r = await fetch(f); if (r.ok) IMG[k] = new Uint8Array(await r.arrayBuffer()); } catch {}
  }
}
const costoMat = list => sum(list || [], m => { const s = S.magazzino.find(x => x.id === slug(m.nome)); return n2(m.qta) * (s?.costoMedio || 0); });

/* ---------- render ---------- */
function render() {
  TODAY = oggi();
  const st = store.st;
  const logged = st.auth === 'in' || st.auth === 'demo';
  const pieno = logged && (st.auth === 'demo' || GESTORE());
  $('#tabsNav').hidden = !pieno;
  $('#menuBtn').hidden = !pieno;
  document.body.dataset.ruolo = logged ? st.ruolo || '' : '';
  $('#tabs').innerHTML = TABS.map(([k, l, i]) => `<button class="tab" data-act="tab" data-arg="${k}" aria-current="${UI.tab === k}">${svg(i)}${l}</button>`).join('');
  const pend = store.pending();
  $('#sync').innerHTML = logged && !pieno ? '' : st.mode === 'demo' ? '<span class="st off">Prova</span>'
    : !logged ? '' : !st.online ? `<span class="st off">Offline${pend ? ' · ' + pend + ' da inviare' : ''}</span>`
    : st.syncing || pend ? '<span class="st busy">Sincronizzo</span>' : '<span class="st">Sincronizzato</span>';
  $('#matlist').innerHTML = S.magazzino.map(m => `<option value="${esc(m.nome)}"></option>`).join('');
  $('#clilist').innerHTML = [...new Set([...S.clienti.map(c => c.nome), ...[...S.lavori, ...S.interventi].map(x => x.cliente)].filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(c => `<option value="${esc(c)}"></option>`).join('');

  if (st.auth === 'checking') { $('#main').innerHTML = '<div class="empty" style="margin-top:20px">Caricamento…</div>'; return; }
  if (st.auth === 'out' || st.auth === 'recovery') { $('#main').innerHTML = rAuth(); return; }

  if (st.accesso?.cambio_password) { $('#main').innerHTML = rCambioPw(); return; }
  if (st.ruolo === 'rivenditore') { const t = UI.rivTab || 'cal'; $('#main').innerHTML = rRivTabs() + (t === 'prev' ? rRivPreventivo() : t === 'listino' ? rRivListino() : rRivenditore()) + (t === 'cal' ? '' : `<div class="row between small muted"><span>${esc(st.email)}</span><button class="linkbtn" data-act="logout" type="button">Esci</button></div>`); return; }
  if (st.ruolo === 'dipendente') { $('#main').innerHTML = rDipendente(); hydrateFiles($('#main')); return; }
  if (st.ruolo === 'nessuno' || st.ruolo === 'sospeso') { $('#main').innerHTML = rSenzaAccesso(); return; }
  if (!GESTORE()) { $('#main').innerHTML = '<div class="empty" style="margin-top:20px">Caricamento…</div>'; return; }
  let h = '';
  if (st.mode === 'demo') h += `<div class="notice">Modalità prova: i dati restano solo su questo dispositivo. Dopo il collegamento al database si sincronizzano su tutti i tuoi dispositivi.</div>`;
  if (st.error) h += `<div class="notice">${esc(st.error)}</div>`;
  h += ({ cal: rCal, int: rInt, prev: rPrev, cli: rClienti, cantieri: rCantieri, moduli: rModuli, accessi: rAccessi, conti: rConti, van: rVan, an: rAn, set: rSet })[UI.tab]();
  $('#main').innerHTML = h;
  hydrateFiles($('#main'));
}
async function hydrateFiles(root) {
  for (const img of root.querySelectorAll('img[data-file]')) {
    const u = await store.fileUrl(img.dataset.file);
    if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement('span'), { textContent: '' }));
  }
}

/* ---------- accesso ---------- */
function rAuth() {
  if (UI.authView === 'richiesta' && store.st.auth !== 'recovery') return rRichiesta();
  const v = store.st.auth === 'recovery' ? 'newpw' : UI.authView;
  const title = { login: 'Accedi', signup: 'Crea il tuo account', reset: 'Recupera la password', newpw: 'Scegli una nuova password' }[v];
  return `<div class="auth">
    <h2>${title}</h2>
    <form class="panel" id="authForm" data-view="${v}">
      ${v !== 'newpw' ? `<label class="f"><span>Email</span><input id="a_email" name="email" type="email" autocomplete="email" required inputmode="email"></label>` : ''}
      ${v !== 'reset' ? `<label class="f"><span>Password</span><input id="a_pw" name="password" type="password" autocomplete="${v === 'login' ? 'current-password' : 'new-password'}" minlength="8" required></label>` : ''}
      ${UI.authErr ? `<div class="err">${esc(UI.authErr)}</div>` : ''}
      ${UI.authMsg ? `<div class="notice">${esc(UI.authMsg)}</div>` : ''}
      <button class="btn primary" type="submit" id="authBtn">${{ login: 'Accedi', signup: 'Crea account', reset: 'Mandami il link', newpw: 'Salva password' }[v]}</button>
    </form>
    <div class="row between small">
      ${v === 'login' ? `<button class="linkbtn" data-act="authView" data-arg="richiesta" type="button">Non hai un accesso? Richiedilo</button><button class="linkbtn" data-act="authView" data-arg="reset" type="button">Password dimenticata</button>` : ''}
      ${v === 'signup' || v === 'reset' ? `<button class="linkbtn" data-act="authView" data-arg="login" type="button">Ho già un account: accedi</button>` : ''}
    </div>
    <p class="small muted">Si entra solo con l'accesso dato dal titolare. Dopo il primo accesso resti collegato su questo dispositivo.</p>
  </div>`;
}
document.addEventListener('submit', async e => {
  if (e.target.id !== 'authForm') return;
  e.preventDefault();
  const fd = new FormData(e.target), v = e.target.dataset.view;
  const email = (fd.get('email') || '').trim(), pw = fd.get('password') || '';
  UI.authErr = ''; UI.authMsg = '';
  if (v !== 'newpw' && !/^\S+@\S+\.\S+$/.test(email)) { UI.authErr = 'Scrivi un indirizzo email valido.'; return render(); }
  if (v !== 'reset' && pw.length < 8) { UI.authErr = 'La password deve avere almeno 8 caratteri.'; return render(); }
  const b = $('#authBtn'); b.disabled = true; b.textContent = 'Attendi…';
  try {
    if (v === 'login') await store.login(email, pw);
    if (v === 'signup') { const conf = await store.signup(email, pw); if (conf) { UI.authView = 'login'; UI.authMsg = 'Ti ho mandato un\'email: apri il link per confermare l\'account, poi accedi qui.'; } }
    if (v === 'reset') { await store.resetPassword(email); UI.authMsg = 'Se l\'email è registrata, ti arriva un link per scegliere una nuova password.'; }
    if (v === 'newpw') { await store.setPassword(pw); toast('Password aggiornata'); }
  } catch (err) { UI.authErr = err.message || 'Qualcosa non ha funzionato, riprova.'; }
  render();
});

/* ---------- schede ---------- */
/* ---------- impegni: ferie, fiere, corsi ---------- */
const TIPI_EV = [['ferie', 'Ferie'], ['fiera', 'Fiera'], ['corso', 'Corso'], ['altro', 'Altro impegno']];
const tipoEv = k => (TIPI_EV.find(t => t[0] === k) || TIPI_EV[3])[1];
const inEv = (e, k) => k >= e.data && k <= (e.dataFine || e.data);
const evDel = k => S.eventi.filter(e => inEv(e, k));
function eventoCard(e) {
  const piu = e.dataFine && e.dataFine > e.data;
  const n = piu ? Math.round((pd(e.dataFine) - pd(e.data)) / 864e5) + 1 : 1;
  return `<div class="card evcard ev-${esc(e.tipo)}" role="button" tabindex="0" data-act="editEv" data-id="${e.id}">
    <div class="row between"><span class="t">${esc(e.titolo || tipoEv(e.tipo))}</span><span class="chip evchip ev-${esc(e.tipo)}">${tipoEv(e.tipo)}</span></div>
    <div class="small muted">${piu ? `dal ${fmtD(e.data, { day: 'numeric', month: 'short' })} al ${fmtD(e.dataFine, { day: 'numeric', month: 'short' })} · ${n} giorni` : fmtD(e.data, { weekday: 'long', day: 'numeric', month: 'long' })}${e.orario ? ' · ' + esc(e.orario) : ''}${e.luogo ? ' · ' + esc(e.luogo) : ''}${n2(e.costo) ? ' · ' + eur(e.costo) : ''}</div>
    ${e.note ? `<div class="small">${esc(e.note)}</div>` : ''}
  </div>`;
}
function sheetEvento(e, giorno) {
  const isNew = !e; e = e || { tipo: 'ferie', data: giorno || UI.day };
  openSheet(isNew ? 'Nuovo impegno' : (e.titolo || tipoEv(e.tipo)), `
    <div class="seg evseg" role="group" aria-label="Tipo">${TIPI_EV.map(([k, l]) => `<button type="button" data-act="evTipo" data-arg="${k}" aria-pressed="${e.tipo === k}">${l}</button>`).join('')}</div>
    <input type="hidden" id="f_etipo" name="etipo" value="${esc(e.tipo)}">
    ${F('Descrizione', inp('etitolo', e.titolo, 'text', 'placeholder="Es. Ferie estive, Fiera MADE Expo, Corso PosaClima"'))}
    <div class="g2">${F('Dal giorno', inp('edata', e.data, 'date', 'required'))}${F('Al giorno', inp('edataFine', e.dataFine, 'date'))}</div>
    <div class="g2">${F('Luogo', inp('eluogo', e.luogo))}${F('Orario', inp('eorario', e.orario, 'text', 'placeholder="Es. 9:00–17:00"'))}</div>
    <div class="g2">${F('Costo €', inp('ecosto', e.costo, 'number', 'placeholder="Iscrizione, ingresso…"'))}<span></span></div>
    ${e.movimentoId ? '<div class="small muted">Il costo è già registrato tra le spese.</div>' : `<label class="check"><input type="checkbox" id="f_espesa" name="espesa"> Registra il costo tra le spese</label>`}
    ${F('Note', `<textarea id="f_enote" name="enote">${esc(e.note || '')}</textarea>`)}`,
  async fd => {
    const da = fd.get('edata'), a = fd.get('edataFine');
    if (a && a < da) throw Object.assign(new Error('date'), { userMsg: 'La data di fine è prima di quella di inizio' });
    const d = { ...stripId(e), tipo: fd.get('etipo'), titolo: fd.get('etitolo').trim(), data: da, dataFine: a && a > da ? a : '', luogo: fd.get('eluogo').trim(), orario: fd.get('eorario').trim(), costo: n2(fd.get('ecosto')), note: fd.get('enote').trim() };
    if (fd.get('espesa') && d.costo > 0 && !d.movimentoId) d.movimentoId = store.put('movimenti', null, { tipo: 'uscita', data: da, categoria: 'altro', importo: d.costo, fornitore: '', numero: '', descrizione: d.titolo || tipoEv(d.tipo), righe: [], magazzino: false });
    store.put('eventi', isNew ? null : e.id, d);
    UI.day = da; UI.month = da.slice(0, 7);
    toast(`${tipoEv(d.tipo)} salvat${d.tipo === 'ferie' ? 'e' : d.tipo === 'altro' ? 'o' : 'a'}`);
  }, { del: isNew ? null : async () => { store.drop('eventi', e.id); toast('Impegno eliminato'); } });
}
const cliDi = x => (x.clienteId && S.clienti.find(c => c.id === x.clienteId)) || trovaCliente(x.cliente);
const chipCli = x => { const c = cliDi(x); return c && c.tipo && c.tipo !== 'finale' ? ` <span class="chip ${c.tipo === 'rivenditore' ? 'in' : 'warn'} small">${tipoCliente(c.tipo)}</span>` : ''; };
const linkCli = x => { const c = cliDi(x); return c ? `<button type="button" class="linkbtn" data-act="editCli" data-id="${c.id}">Scheda cliente</button>` : ''; };
function lavoroCard(l) {
  const a = ammOf(l.amm);
  const mats = (l.materiali || []).filter(m => m.nome);
  const cart = S.cartelle.find(c => c.id === l.cartellaId);
  const nAll = (l.allegati || []).length;
  return `<div class="card ${l.urgenzaApplicata ? 'urg-alta' : ''}" role="button" tabindex="0" data-act="editLav" data-id="${l.id}">
    <div class="row between"><span class="t">${esc(l.cliente || 'Cliente')}${chipCli(l)}</span><span class="price">${n2(l.importo) ? eur(l.importo) : ''}</span></div>
    ${l.dataFine && l.dataFine > l.data ? `<div class="small"><span class="chip in">${(() => { const g = giorniPosa(l); const i = g.indexOf(UI.day); return (i >= 0 ? `Giorno ${i + 1} di ${g.length}` : `${g.length} giorni`); })()}</span> dal ${fmtD(l.data, { day: 'numeric', month: 'short' })} al ${fmtD(l.dataFine, { day: 'numeric', month: 'short' })}</div>` : ''}
    ${l.indirizzo ? `<div class="addr">${esc(l.indirizzo)}</div>` : ''}
    ${l.installato ? `<div>${esc(l.installato)}</div>` : ''}
    <div class="meta">${n2(l.pezzi) ? `<span><b class="num">${num(l.pezzi, 0)}</b> pezzi</span>` : ''}${n2(l.ore) ? `<span><b class="num">${num(l.ore)}</b> ore</span>` : ''}${l.urgenzaApplicata ? '<span class="chip warn">Urgente</span>' : ''}<span class="chip ${a[2]}">${a[1]}</span>${l.esempio ? '<span class="chip ex">esempio</span>' : ''}</div>
    ${mats.length ? `<div class="mats">${mats.map(m => `<span class="chip">${esc(m.nome)} · ${num(m.qta)}</span>`).join('')}</div>` : ''}
    ${l.indirizzo || cart || isUrl(l.cartellaUrl) || nAll || cliDi(l) ? `<div class="links">
      ${linkCli(l)}
      ${l.indirizzo ? `<a href="https://maps.apple.com/?q=${encodeURIComponent(l.indirizzo)}" target="_blank" rel="noopener">Mappa</a>` : ''}
      ${cart && isUrl(cart.url) ? `<a href="${esc(cart.url)}" target="_blank" rel="noopener">Cartella ${esc(cart.nome)}</a>` : ''}
      ${isUrl(l.cartellaUrl) ? `<a href="${esc(l.cartellaUrl)}" target="_blank" rel="noopener">Cartella cantiere</a>` : ''}
      ${nAll ? `<span class="small muted">${svg('clip', 'i')} ${nAll} ${nAll === 1 ? 'allegato' : 'allegati'}</span>` : ''}</div>` : ''}
  </div>`;
}
function intCard(i) {
  const st = STATI.find(s => s[0] === (i.stato || 'aperto')) || STATI[0];
  const u = URG.find(x => x[0] === (i.urgenza || 'normale')) || URG[0];
  return `<div class="card urg-${u[0]}" role="button" tabindex="0" data-act="editInt" data-id="${i.id}">
    <div class="row between"><span class="t">${esc(i.cliente || 'Cliente')}${chipCli(i)}</span><span class="price">${n2(i.costo) ? eur(i.costo) : ''}</span></div>
    ${i.indirizzo ? `<div class="addr">${esc(i.indirizzo)}</div>` : ''}
    ${i.descrizione ? `<div>${esc(i.descrizione)}</div>` : ''}
    <div class="meta"><span class="chip ${st[2]}">${st[1]}</span>${u[0] !== 'normale' ? `<span class="chip ${u[2]}">${u[1]}</span>` : ''}<span>Richiesto ${fmtD(i.data, { day: 'numeric', month: 'short' })}</span>${i.dataProg ? `<span>Fissato <b>${fmtD(i.dataProg, { day: 'numeric', month: 'short' })}</b></span>` : ''}${i.esempio ? '<span class="chip ex">esempio</span>' : ''}</div>
    ${i.telefono || i.indirizzo || cliDi(i) ? `<div class="links">${linkCli(i)}${i.telefono ? `<a href="tel:${esc(i.telefono.replace(/\s/g, ''))}">Chiama ${esc(i.telefono)}</a>` : ''}${i.indirizzo ? `<a href="https://maps.apple.com/?q=${encodeURIComponent(i.indirizzo)}" target="_blank" rel="noopener">Mappa</a>` : ''}</div>` : ''}
  </div>`;
}
function rTodo() {
  const p = promemoria(S, TODAY);
  if (!p.length) return '';
  return `<section class="todo" aria-label="Promemoria"><div class="todo-head"><span>Da fare</span><span class="num">${p.length}</span></div>
    ${p.map(x => `<button class="todo-item" data-act="${x.act}" data-arg="${x.arg || ''}" type="button"><span class="dot ${x.lvl}"></span><span><b>${esc(x.txt)}</b><br><span class="small muted">${esc(x.sub || '')}</span></span><span class="go">›</span></button>`).join('')}</section>`;
}

function rCal() {
  const cc = UI.calCli && S.clienti.find(c => c.id === UI.calCli);
  const mioCli = x => !cc || x.clienteId === cc.id || (!x.clienteId && normNome(x.cliente) === normNome(cc.nome));
  const LAV = S.lavori.filter(mioCli), INT = S.interventi.filter(mioCli);
  const [y, m] = UI.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1), off = (first.getDay() + 6) % 7, dim = new Date(y, m, 0).getDate();
  let cells = ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < off; i++) cells += '<div class="day blank"></div>';
  for (let d = 1; d <= dim; d++) {
    const k = `${UI.month}-${String(d).padStart(2, '0')}`, dow = (off + d - 1) % 7;
    const posaK = LAV.filter(l => inPosa(l, k)); const nl = posaK.length;
    const ints = INT.filter(i => (i.dataProg || '') === k);
    const evs = evDel(k), ferie = evs.some(e => e.tipo === 'ferie');
    cells += `<button class="day ${k === TODAY ? 'today' : ''} ${dow >= 5 ? 'we' : ''} ${ferie ? 'ferie' : ''} ${UI.sel && UI.sel.has(k) ? 'sel' : ''}" data-act="day" data-arg="${k}" aria-pressed="${k === UI.day}" aria-label="${fmtD(k)}" type="button"><span class="n">${d}</span><span class="marks">${posaK.slice(0, 3).map(l => `<i class="mk ${l.urgenzaApplicata ? 'urg' : ''}"></i>`).join('')}${ints.map(i => `<i class="mk int ${i.stato === 'completato' ? 'done' : ''}"></i>`).slice(0, 2).join('')}${evs.filter(e => e.tipo !== 'ferie').slice(0, 2).map(e => `<i class="mk ev ev-${esc(e.tipo)}"></i>`).join('')}</span></button>`;
  }
  const ml = LAV.filter(l => (l.data || '').startsWith(UI.month));
  const dl = LAV.filter(l => inPosa(l, UI.day));
  const di = INT.filter(i => i.dataProg === UI.day);
  const de = evDel(UI.day);
  const empty = !S.lavori.length && !S.interventi.length && !S.movimenti.length;
  return `${avvisoAccessi()}${rTodo()}
  ${empty ? `<div class="empty"><b>Il diario è vuoto.</b><span>Tocca un giorno e segna la prima posa, oppure carica alcuni dati di esempio per vedere come funziona. Gli esempi si cancellano con un tocco.</span><button class="btn" data-act="seed" type="button">Carica dati di esempio</button></div>` : ''}
  <section class="stack">
    <div class="cal-head"><button class="iconbtn" data-act="month" data-arg="-1" aria-label="Mese precedente" type="button">${svg('l')}</button><h2>${monthName(UI.month)}</h2><button class="iconbtn" data-act="month" data-arg="1" aria-label="Mese successivo" type="button">${svg('r')}</button></div>
    ${cc ? `<div class="selbar"><div><b>Calendario di ${esc(cc.nome)}</b><div class="small">${LAV.length} ${LAV.length === 1 ? 'posa' : 'pose'} · ${INT.length} ${INT.length === 1 ? 'intervento' : 'interventi'} · solo i suoi lavori</div></div><div class="row"><button class="btn sm" data-act="editCli" data-id="${cc.id}" type="button">Scheda</button><button class="btn sm dark" data-act="calTutti" type="button">Mostra tutti</button></div></div>` : ''}
    <div class="cal">${cells}</div>
    <div class="legend"><span><i class="mk"></i> posa</span><span><i class="mk urg"></i> posa urgente</span><span><i class="mk int"></i> intervento</span><span><i class="mk int done"></i> intervento fatto</span><span><i class="mk ev ev-ferie"></i> ferie</span><span><i class="mk ev ev-fiera"></i> fiera</span><span><i class="mk ev ev-corso"></i> corso</span><span class="num">${ml.length} pose · ${num(sum(ml, l => l.ore))} h · ${eur(sum(ml, l => l.importo))}</span></div>
    ${barraSelezione()}
  </section>
  <section class="stack">
    <div class="row between"><h3>${fmtD(UI.day, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
      <div class="row"><button class="btn sm" data-act="newEv" data-arg="${UI.day}" type="button">+ Ferie, fiera, corso</button><button class="btn sm" data-act="newInt" data-arg="${UI.day}" type="button">+ Intervento</button><button class="btn primary sm" data-act="newLav" type="button">${svg('plus')} Posa</button></div></div>
    ${de.map(eventoCard).join('')}${dl.map(lavoroCard).join('')}${di.map(intCard).join('')}
    ${!dl.length && !di.length && !de.length ? `<div class="empty small">Nessun lavoro segnato in questo giorno.</div>` : ''}
  </section>
  ${S.lavori.some(x => x.esempio) || S.movimenti.some(x => x.esempio) ? `<button class="btn ghost small" data-act="unseed" type="button">Rimuovi i dati di esempio</button>` : ''}`;
}

function rInt() {
  const F = [['aperti', 'Aperti'], ['urgenti', 'Urgenti'], ['completati', 'Completati'], ['tutti', 'Tutti']];
  const open = i => ['aperto', 'programmato', 'in_corso'].includes(i.stato || 'aperto');
  const L = S.interventi.filter(i => UI.intFilter === 'tutti' || (UI.intFilter === 'aperti' && open(i)) || (UI.intFilter === 'urgenti' && open(i) && i.urgenza && i.urgenza !== 'normale') || (UI.intFilter === 'completati' && i.stato === 'completato'));
  const ur = { critica: 0, alta: 1, normale: 2 };
  L.sort((a, b) => open(a) && open(b) ? (ur[a.urgenza || 'normale'] - ur[b.urgenza || 'normale']) || String(a.data).localeCompare(b.data) : String(b.dataProg || b.data).localeCompare(a.dataProg || a.data));
  const ap = S.interventi.filter(open);
  return `<div class="row between"><h2>Interventi</h2><button class="btn primary" data-act="newInt" data-arg="" type="button">${svg('plus')} Nuovo</button></div>
  <div class="kpis"><div class="kpi"><div class="l">Aperti</div><div class="v">${ap.length}</div></div><div class="kpi"><div class="l">Urgenti</div><div class="v">${ap.filter(i => i.urgenza && i.urgenza !== 'normale').length}</div></div><div class="kpi"><div class="l">Fatti ${MESI[+TODAY.slice(5, 7) - 1]}</div><div class="v">${S.interventi.filter(i => i.stato === 'completato' && (i.dataProg || i.data || '').startsWith(TODAY.slice(0, 7))).length}</div></div><div class="kpi"><div class="l">Valore aperti</div><div class="v">${eur(sum(ap, i => i.costo))}</div></div></div>
  <div class="seg" role="group" aria-label="Filtro">${F.map(([k, l]) => `<button data-act="intF" data-arg="${k}" aria-pressed="${UI.intFilter === k}" type="button">${l}</button>`).join('')}</div>
  <div class="stack">${L.map(intCard).join('') || `<div class="empty">Nessun intervento in questa lista.<br><span class="small">Segna qui riparazioni, regolazioni e chiamate in garanzia, con urgenza e stato.</span></div>`}</div>`;
}

function rConti() {
  const seg = [['mov', 'Spese'], ['mag', 'Magazzino'], ['fatt', 'Fatture']];
  let h = `<div class="row between"><h2>Conti</h2></div><div class="seg" role="group" aria-label="Sezione">${seg.map(([k, l]) => `<button data-act="seg" data-arg="${k}" aria-pressed="${UI.seg === k}" type="button">${l}</button>`).join('')}</div>`;
  if (UI.seg === 'mov') {
    const L = S.movimenti.filter(m => (m.data || '').startsWith(UI.cMonth)).sort((a, b) => String(b.data).localeCompare(a.data));
    const out = sum(L.filter(m => m.tipo !== 'entrata'), m => m.importo), inn = sum(L.filter(m => m.tipo === 'entrata'), m => m.importo);
    h += `<div class="photo-cta">
      <label class="btn primary" for="photo">${svg('cam')} Fotografa scontrino<input id="photo" type="file" accept="image/*" capture="environment"></label>
      <button class="btn" data-act="newMov" type="button">${svg('plus')} A mano</button></div>
    <div class="cal-head"><button class="iconbtn" data-act="cMonth" data-arg="-1" aria-label="Mese precedente" type="button">${svg('l')}</button><h3 style="flex:1;text-align:center">${monthName(UI.cMonth)}</h3><button class="iconbtn" data-act="cMonth" data-arg="1" aria-label="Mese successivo" type="button">${svg('r')}</button></div>
    <div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="kpi"><div class="l">Spese del mese</div><div class="v">${eur(out)}</div></div><div class="kpi"><div class="l">Altre entrate</div><div class="v">${eur(inn)}</div></div></div>
    <div class="panel">${L.map(m => `<button class="list-line mov" style="width:100%;background:none;border-left:0;border-right:0;border-top:0;text-align:left" data-act="editMov" data-id="${m.id}" type="button">
      <span class="ico">${m.foto ? `<img data-file="${esc(m.foto)}" alt="">` : svg(m.categoria === 'materiale' ? 'box' : m.categoria === 'carburante' ? 'fuel' : m.categoria === 'furgone' ? 'van' : 'doc')}</span>
      <span class="mid"><span class="t" style="display:block;font-weight:600">${esc(m.fornitore || m.descrizione || catName(m.categoria))}</span><span class="small muted">${fmtD(m.data, { day: 'numeric', month: 'short' })} · ${esc(catName(m.categoria))}${m.magazzino ? ' · in magazzino' : ''}${m.esempio ? ' · esempio' : ''}</span></span>
      <span class="price amount ${m.tipo === 'entrata' ? 'pos' : 'neg'}">${m.tipo === 'entrata' ? '+' : '−'}${eur(m.importo)}</span></button>`).join('') || `<div class="muted small" style="padding:6px 0">Nessuna spesa in ${monthName(UI.cMonth)}. Fotografa uno scontrino: l'app prova a leggere importo, data e fornitore, e se è materiale carica il magazzino.</div>`}</div>`;
  }
  if (UI.seg === 'mag') {
    const L = [...S.magazzino].sort((a, b) => a.nome.localeCompare(b.nome));
    h += `<div class="row between"><span class="muted small">Valore in magazzino <b class="num">${eur(sum(L, m => Math.max(n2(m.qta), 0) * n2(m.costoMedio)))}</b></span><button class="btn sm" data-act="newMag" type="button">${svg('plus')} Materiale</button></div>
    <div class="tbl-wrap"><table><thead><tr><th>Materiale</th><th class="r">Giacenza</th><th class="r">Costo medio</th><th>Stato</th></tr></thead><tbody>
    ${L.map(m => { const low = n2(m.soglia) > 0 && n2(m.qta) <= n2(m.soglia); return `<tr data-act="editMag" data-id="${m.id}" style="cursor:pointer"><td><b>${esc(m.nome)}</b></td><td class="r num">${num(m.qta)} ${esc(m.unita)}</td><td class="r num">${eur(m.costoMedio)}</td><td>${n2(m.qta) < 0 ? '<span class="chip bad">Negativo</span>' : low ? '<span class="chip warn">Da riordinare</span>' : '<span class="chip ok">Ok</span>'}</td></tr>`; }).join('') || `<tr><td colspan="4" class="muted">Il magazzino si riempie da solo quando registri un acquisto di materiale.</td></tr>`}
    </tbody></table></div>
    <div class="small muted">La giacenza sale con gli acquisti e scende con il materiale usato nelle pose e negli interventi. Tocca una riga per correggerla o impostare la scorta minima.</div>`;
  }
  if (UI.seg === 'fatt') {
    const all = [...S.lavori.map(x => ({ ...x, _k: 'lavori', _d: x.data, _t: x.installato })), ...S.interventi.filter(i => i.stato === 'completato').map(x => ({ ...x, _k: 'interventi', _d: x.dataProg || x.data, importo: x.costo, _t: x.descrizione }))].filter(x => n2(x.importo) > 0 && x._d <= TODAY).sort((a, b) => String(a._d).localeCompare(b._d));
    h += `<div class="small muted">Ogni lavoro passa da consuntivo a fattura a pagamento. Tocca il pulsante per farlo avanzare.</div>`;
    AMM.slice(0, 3).forEach(([k, l, c]) => {
      const L = all.filter(x => (x.amm || 'da_cons') === k);
      h += `<section class="stack"><div class="row between"><h3>${l}</h3><span class="chip ${c} num">${L.length} · ${eur(sum(L, x => x.importo))}</span></div>
      ${L.map(x => `<div class="card"><div class="row between"><span class="t">${esc(x.cliente)}</span><span class="price">${eur(x.importo)}</span></div><div class="small muted">${fmtD(x._d)} · ${x._k === 'lavori' ? 'Posa' : 'Intervento'}${x._t ? ' · ' + esc(x._t) : ''}</div>
        <div class="row">${k === 'da_cons' ? `<button class="btn sm dark" data-act="cons" data-arg="${x._k}" data-id="${x.id}" type="button">Prepara consuntivo</button>` : ''}<button class="btn sm" data-act="amm" data-arg="${x._k}" data-id="${x.id}" type="button">${k === 'da_cons' ? 'Segna consuntivo inviato' : k === 'cons' ? 'Segna fatturato' : 'Segna pagato'}</button></div></div>`).join('') || '<div class="small muted">Niente qui.</div>'}</section>`;
    });
  }
  return h;
}

function rVan() {
  const f = S.furgone || {};
  const spY = S.movimenti.filter(m => ['furgone', 'carburante'].includes(m.categoria) && (m.data || '').startsWith(TODAY.slice(0, 4)));
  return `<div class="row between"><h2>Furgone</h2><button class="btn sm" data-act="editVan" type="button">Dati mezzo</button></div>
  <div class="panel row between"><div><b>${esc(f.modello || 'Furgone')}</b> <span class="muted">${esc(f.targa || 'targa non inserita')}</span><div class="small muted">${n2(f.km) ? `<span class="num">${num(f.km, 0)}</span> km` : 'km non inseriti'}${f.compagnia ? ' · ' + esc(f.compagnia) : ''}</div></div><button class="btn sm" data-act="km" type="button">Aggiorna km</button></div>
  <div class="scad">${SCAD.map(([k, l]) => { const d = f[k]; const n = d ? daysTo(d) : null; const c = n === null ? '' : n < 0 ? 'bad' : n <= 30 ? 'warn' : 'ok'; return `<div class="card"><div class="row between"><span class="t">${l}</span>${n === null ? '<span class="chip">da inserire</span>' : `<span class="chip ${c}">${n < 0 ? 'Scaduta' : n === 0 ? 'Oggi' : n <= 30 ? 'Tra ' + n + ' gg' : 'Ok'}</span>`}</div>
    <div class="big">${d ? fmtD(d) : '—'}</div>${k === 'tagliando' && n2(f.tagliandoKm) ? `<div class="small muted">oppure a <span class="num">${num(f.tagliandoKm, 0)}</span> km</div>` : ''}
    <div><button class="btn sm" data-act="rinnova" data-arg="${k}" type="button">${d ? 'Registra rinnovo' : 'Imposta scadenza'}</button></div></div>`; }).join('')}</div>
  <div class="small muted">Le scadenze entro 30 giorni compaiono nel riquadro "Da fare" e, se attivi le notifiche, ti arrivano sul telefono.</div>
  <section class="stack"><div class="row between"><h3>Spese mezzo ${TODAY.slice(0, 4)}</h3><span class="price">${eur(sum(spY, m => m.importo))}</span></div>
  <div class="panel">${spY.sort((a, b) => String(b.data).localeCompare(a.data)).slice(0, 12).map(m => `<div class="list-line"><div><b>${esc(m.descrizione || m.fornitore || catName(m.categoria))}</b><div class="small muted">${fmtD(m.data)} · ${esc(catName(m.categoria))}</div></div><span class="price">${eur(m.importo)}</span></div>`).join('') || '<div class="small muted">Nessuna spesa per il furgone quest\'anno. Registra un rinnovo o fotografa lo scontrino del gasolio.</div>'}</div></section>`;
}

function inPeriod(d) { if (!d) return false; if (!d.startsWith(String(UI.anYear))) return false; return UI.anMonth === 'all' || d.slice(5, 7) === UI.anMonth; }
function clientiPrincipali(lav, ints) {
  const m = new Map();
  for (const [x, imp] of [...lav.map(l => [l, n2(l.importo)]), ...ints.map(i => [i, n2(i.costo)])]) {
    const k = x.clienteId || normNome(x.cliente); if (!k) continue;
    const r = m.get(k) || { nome: (S.clienti.find(c => c.id === x.clienteId) || {}).nome || x.cliente, id: x.clienteId, imp: 0, n: 0 };
    r.imp += imp; r.n++; m.set(k, r);
  }
  const top = [...m.values()].sort((a, b) => b.imp - a.imp).slice(0, 5);
  if (!top.length) return '';
  const max = top[0].imp || 1, tot = sum([...m.values()], r => r.imp) || 1;
  return `<section class="panel stack"><h3>Clienti principali</h3><div class="bars">${top.map(r => `<div ${r.id ? `role="button" tabindex="0" data-act="editCli" data-id="${r.id}" style="cursor:pointer"` : ''}><div class="bar-l"><span>${esc(r.nome)} <span class="muted small">· ${r.n} ${r.n === 1 ? 'lavoro' : 'lavori'}</span></span><span class="num">${eur(r.imp)} · ${num(r.imp / tot * 100, 0)}%</span></div><div class="bar-t"><div class="bar-f" style="width:${r.imp / max * 100}%"></div></div></div>`).join('')}</div></section>`;
}
function rAn() {
  const A = IMP().analisi;
  const yrs = [...new Set([TODAY.slice(0, 4), ...S.lavori.map(l => (l.data || '').slice(0, 4)), ...S.movimenti.map(m => (m.data || '').slice(0, 4))].filter(Boolean))].sort().reverse();
  const lav = S.lavori.filter(l => inPeriod(l.data) && l.data <= TODAY);
  const ints = S.interventi.filter(i => i.stato === 'completato' && inPeriod(i.dataProg || i.data));
  const mov = S.movimenti.filter(m => inPeriod(m.data));
  const entr = sum(lav, l => l.importo) + sum(ints, i => i.costo) + sum(mov.filter(m => m.tipo === 'entrata'), m => m.importo);
  const usc = sum(mov.filter(m => m.tipo !== 'entrata'), m => m.importo);
  const utile = entr - usc, ore = sum(lav, l => l.ore) + sum(ints, i => i.ore);
  const byCat = CAT.map(([k]) => [k, sum(mov.filter(m => m.tipo !== 'entrata' && m.categoria === k), m => m.importo)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const maxC = Math.max(1, ...byCat.map(x => x[1]));
  const months = [...Array(12)].map((_, i) => { const k = `${UI.anYear}-${String(i + 1).padStart(2, '0')}`; const e = sum(S.lavori.filter(l => (l.data || '').startsWith(k) && l.data <= TODAY), l => l.importo) + sum(S.interventi.filter(x => x.stato === 'completato' && (x.dataProg || x.data || '').startsWith(k)), x => x.costo) + sum(S.movimenti.filter(m => m.tipo === 'entrata' && (m.data || '').startsWith(k)), m => m.importo); const u = sum(S.movimenti.filter(m => m.tipo !== 'entrata' && (m.data || '').startsWith(k)), m => m.importo); return { e, u }; });
  const mx = Math.max(100, ...months.flatMap(m => [m.e, m.u]));
  const step = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000].find(s => mx / s <= 4) || Math.ceil(mx / 4);
  const top = Math.ceil(mx / step) * step, W = 400, H = 190, pl = 36, pb = 20, pt = 8, cw = (W - pl - 6) / 12, sy = v => pt + (H - pt - pb) * (1 - v / top);
  let ch = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Entrate e uscite per mese">`;
  for (let v = 0; v <= top; v += step) ch += `<line class="grid" x1="${pl}" x2="${W - 6}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${pl - 6}" y="${sy(v) + 3}" text-anchor="end">${v >= 1000 ? num(v / 1000) + 'k' : v}</text>`;
  months.forEach((m, i) => { const x = pl + i * cw + cw * .15, bw = cw * .33; ch += `<rect class="e" x="${x}" y="${sy(m.e)}" width="${bw}" height="${Math.max(0, sy(0) - sy(m.e))}" rx="1.5"/><rect class="u" x="${x + bw + 1}" y="${sy(m.u)}" width="${bw}" height="${Math.max(0, sy(0) - sy(m.u))}" rx="1.5"/><text x="${pl + i * cw + cw / 2}" y="${H - 6}" text-anchor="middle">${MESI[i].slice(0, 3)}</text>`; });
  ch += '</svg>';
  const usedAll = [...S.lavori.filter(l => l.data <= TODAY).map(l => ({ d: l.data, m: l.materiali })), ...S.interventi.map(i => ({ d: i.dataProg || i.data, m: i.materiali }))];
  const matRows = S.magazzino.map(s => {
    const used = sum(usedAll.filter(u => inPeriod(u.d)), u => sum((u.m || []).filter(m => slug(m.nome) === s.id), m => m.qta));
    const buys = S.movimenti.filter(m => m.magazzino && (m.righe || []).some(r => slug(r.nome) === s.id)).map(m => m.data).filter(Boolean).sort();
    const bought = sum(S.movimenti.filter(m => m.magazzino && inPeriod(m.data)), m => sum((m.righe || []).filter(r => slug(r.nome) === s.id), r => r.qta));
    const gaps = buys.slice(1).map((d, i) => (pd(d) - pd(buys[i])) / 864e5);
    return { s, used, bought, ordini: buys.length, ogni: gaps.length ? Math.round(sum(gaps, x => x) / gaps.length) : null, ultimo: buys[buys.length - 1] };
  }).filter(r => r.used || r.bought || r.ordini).sort((a, b) => b.used * n2(b.s.costoMedio) - a.used * n2(a.s.costoMedio));
  const inc = lav.filter(l => n2(l.importo) > 0).map(l => ({ l, c: costoMat(l.materiali) })).map(x => ({ ...x, p: x.c / n2(x.l.importo) * 100 }));
  const incMed = inc.length ? sum(inc, x => x.c) / sum(inc, x => x.l.importo) * 100 : 0;
  return `<div class="row between"><h2>Analisi</h2><button class="btn sm" data-act="setAnalisi" type="button">Scegli statistiche</button></div><div class="row">
    <select id="anY" data-change="anY" aria-label="Anno" class="btn sm">${yrs.map(y => `<option ${+y === UI.anYear ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <select id="anM" data-change="anM" aria-label="Mese" class="btn sm"><option value="all">Tutto l'anno</option>${MESI.map((m, i) => { const v = String(i + 1).padStart(2, '0'); return `<option value="${v}" ${UI.anMonth === v ? 'selected' : ''}>${m}</option>`; }).join('')}</select></div></div>
  ${A.kpi ? `
  <div class="kpis"><div class="kpi"><div class="l">Entrate</div><div class="v">${eur(entr)}</div></div><div class="kpi"><div class="l">Uscite</div><div class="v">${eur(usc)}</div></div><div class="kpi ${utile >= 0 ? 'pos' : 'neg'}"><div class="l">Utile</div><div class="v">${eur(utile)}</div></div><div class="kpi"><div class="l">Resa oraria</div><div class="v">${ore ? eur(utile / ore) : '—'}</div></div></div>
  <div class="small muted num">${lav.length} pose · ${ints.length} interventi chiusi · ${num(ore)} ore lavorate · ${num(sum(lav, l => l.pezzi), 0)} serramenti posati</div>
  ` : ''}
  ${A.lavoro ? statLavoro(lav, ints) : ''}
  ${A.mensile ? `
  <section class="panel stack"><div class="row between"><h3>Mese per mese ${UI.anYear}</h3><div class="legend"><span><i class="swatch" style="background:var(--in)"></i> entrate</span><span><i class="swatch" style="background:var(--tape)"></i> uscite</span></div></div>${ch}</section>
  ` : ''}
  ${A.voci ? statVoci(lav, ints) : ''}
  ${A.interventi ? statInterventi() : ''}
  ${A.contabilita ? statContabilita(lav, ints) : ''}
  ${A.spese ? `
  <section class="panel stack"><h3>Dove vanno i soldi</h3>${byCat.length ? `<div class="bars">${byCat.map(([k, v]) => `<div><div class="bar-l"><span>${esc(catName(k))}</span><span class="num">${eur(v)} · ${num(v / usc * 100, 0)}%</span></div><div class="bar-t"><div class="bar-f ${k === 'materiale' ? 'tape' : ''}" style="width:${v / maxC * 100}%"></div></div></div>`).join('')}</div>` : '<div class="small muted">Nessuna spesa nel periodo.</div>'}</section>
  ` : ''}
  ${A.preventivi ? statPreventivi() : ''}
  ${A.clienti ? statClienti(lav, ints) : ''}
  ${A.furgone ? statFurgone(mov, lav, ints) : ''}
  ${A.trasferte ? statTrasferte(lav, ints) : ''}
  ${A.materiale ? `
  <section class="stack"><div class="row between"><h3>Quanto incide il materiale</h3><span class="chip ${incMed > 15 ? 'warn' : 'ok'} num">media ${num(incMed)}%</span></div>
    <div class="small muted">Costo del materiale usato in ogni posa (al costo medio di magazzino) rispetto a quanto incassato. Nel periodo: <b class="num">${eur(sum(inc, x => x.c))}</b> di materiale.</div>
    ${inc.length ? `<div class="tbl-wrap"><table><thead><tr><th>Cantiere</th><th class="r">Incasso</th><th class="r">Materiale</th><th class="r">Incidenza</th><th class="r">€ / ora</th></tr></thead><tbody>${inc.sort((a, b) => String(b.l.data).localeCompare(a.l.data)).slice(0, 15).map(x => `<tr><td>${fmtD(x.l.data, { day: 'numeric', month: 'short' })} · ${esc(x.l.cliente)}</td><td class="r num">${eur(x.l.importo)}</td><td class="r num">${eur(x.c)}</td><td class="r num">${num(x.p)}%</td><td class="r num">${n2(x.l.ore) ? eur((n2(x.l.importo) - x.c) / n2(x.l.ore)) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty small">Segna importo e materiale usato nelle pose per vedere l\'incidenza.</div>'}
  </section>
  ` : ''}
  ${A.consumo ? `
  <section class="stack"><h3>Consumo e ordini materiale</h3>
    ${matRows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Materiale</th><th class="r">Usato</th><th class="r">Comprato</th><th class="r">Ordini</th><th class="r">Ordini ogni</th><th>Ultimo</th></tr></thead><tbody>${matRows.map(r => `<tr><td><b>${esc(r.s.nome)}</b></td><td class="r num">${num(r.used)} ${esc(r.s.unita)}</td><td class="r num">${num(r.bought)} ${esc(r.s.unita)}</td><td class="r num">${r.ordini}</td><td class="r num">${r.ogni !== null ? r.ogni + ' gg' : '—'}</td><td class="num">${r.ultimo ? fmtD(r.ultimo, { day: 'numeric', month: 'short' }) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty small">Qui vedrai quanto materiale usi e ogni quanti giorni lo riordini, appena registri acquisti e pose.</div>'}
  </section>
  ` : ''}
  ${Object.values(A).some(Boolean) ? '' : `<div class="empty">Nessuna statistica scelta. <button class="btn sm" data-act="setAnalisi" type="button">Scegli cosa vedere</button></div>`}
  <div class="row"><button class="btn sm" data-act="csv" data-arg="movimenti" type="button">Esporta spese (CSV)</button><button class="btn sm" data-act="csv" data-arg="lavori" type="button">Esporta lavori (CSV)</button></div>
  <div class="small muted">I file CSV si aprono con Excel o Numbers: utili per il commercialista.</div>`;
}

/* ---------- moduli compilabili ---------- */
// I moduli CASSERO (i PDF originali) sostituiscono i vecchi modelli generici; restano i modelli creati a mano.
const VECCHI_BASE = new Set(MODELLI_BASE.map(b => b.id));
const modelli = () => [
  ...MODELLI_UFFICIALI,
  ...S.modelli.filter(m => !VECCHI_BASE.has(m.id) && !MODELLI_UFFICIALI.some(u => u.id === m.id)).map(m => ({ ...m, mio: true })),
];
const ufficiale = id => MODELLI_UFFICIALI.find(m => m.id === id);
let modCtx = {};
function ctxDa(kind, x) {
  if (kind === 'clienti') return { cliente: x.nome, clienteId: x.id, indirizzo: x.indirizzo, telefono: x.telefono };
  const c = cliDi(x) || {};
  const base = { cliente: x.cliente || '', clienteId: x.clienteId || c.id || '', indirizzo: x.indirizzo || c.indirizzo || '', telefono: x.telefono || c.telefono || '', ore: x.ore, ref: { kind, id: x.id } };
  const sk = separaKm(x.righe);
  base.km = sk.kmTot || ''; base.righe = sk.altre;
  const pv = x.preventivoId && S.preventivi.find(p => p.id === x.preventivoId);
  if (pv) base.rif = 'Preventivo ' + (pv.numero || '');
  return kind === 'lavori' ? { ...base, data: x.dataFine || x.data, dataLavoro: x.dataFine || x.data, lavori: x.installato, descrizione: x.installato } : { ...base, data: x.dataProg || x.data, descrizione: x.descrizione };
}
function valoriIniziali(campi, ctx) {
  const v = {};
  for (const c of campi) {
    if (c.valore) v[c.id] = c.valore;
    if (c.auto === 'posatore') v[c.id] = AZ().ragioneSociale;
    else if (c.auto && ctx[c.auto] != null && ctx[c.auto] !== '') v[c.id] = c.auto === 'ore' ? n2(ctx.ore) || '' : ctx[c.auto];
    if (c.tipo === 'data' && !v[c.id]) v[c.id] = ctx.data || TODAY;
  }
  return v;
}
function sheetScegliModello(ctx = {}) {
  modCtx = ctx;
  openSheet('Nuovo modulo', `
    ${ctx.cliente ? `<div class="small muted">Per <b>${esc(ctx.cliente)}</b>${ctx.indirizzo ? ' · ' + esc(ctx.indirizzo) : ''}: i dati si compilano da soli.</div>` : ''}
    <div class="stack">${modelli().map(m => `<button type="button" class="modchoice" data-act="modNuovo" data-arg="${esc(m.id)}">${svg('clip2')}<span><b>${esc(m.nome)}</b><small>${esc(m.descr || `${(m.campi || []).length} campi`)}</small></span><span class="go">›</span></button>`).join('')}</div>
    <div class="small muted">I quattro moduli Cassero escono nel PDF identici agli originali, con i dati scritti nelle caselle.</div>
    ${GESTORE() ? '<button type="button" class="btn sm" data-act="modelloNuovo">+ Crea un modello tuo</button>' : ''}`, null);
}
let modEdit = null;
function campoModulo(c, val) {
  const n = 'm_' + c.id;
  switch (c.tipo) {
    case 'titolo': return `<h3 class="modtit">${esc(c.label)}</h3>`;
    case 'nota': return `<p class="modnota small">${esc(c.label)}</p>`;
    case 'testolungo': return F(esc(c.label), `<textarea id="f_${n}" name="${n}">${esc(val || '')}</textarea>`);
    case 'numero': return F(esc(c.label), inp(n, val, 'number'));
    case 'data': return F(esc(c.label), inp(n, val, 'date'));
    case 'scelta': return F(esc(c.label), sel(n, [['', 'Scegli…'], ...(c.opzioni || []).map(o => [o, o])], val || ''));
    case 'check': return tog(n, esc(c.label), !!val);
    case 'si_no': return `<div class="f"><span>${esc(c.label)}</span><div class="seg sino" role="group">${[['si', 'Sì'], ['no', 'No']].map(([k, l]) => `<button type="button" data-act="siNo" data-arg="${k}" data-for="${n}" aria-pressed="${val === k}">${l}</button>`).join('')}</div><input type="hidden" id="f_${n}" name="${n}" value="${esc(val || '')}"></div>`;
    case 'tabella': {
      const cols = c.colonne || ['Voce'];
      const righe = Array.isArray(val) && val.length ? val : [cols.map(() => '')];
      return `<div class="fieldset"><span class="fs-t">${esc(c.label)}</span><div class="mtab" id="tab_${c.id}" style="--cols:${cols.length}"><div class="mtr mth">${cols.map(h => `<span>${esc(h)}</span>`).join('')}<span></span></div>${righe.map(r => rigaTab(cols, r)).join('')}</div><button type="button" class="btn sm" data-act="tabRiga" data-arg="${c.id}">+ Riga</button></div>`;
    }
    case 'firma': return `<div class="firma"><div class="row between"><span class="fs-t">${esc(c.label)}</span><button type="button" class="linkbtn" data-act="firmaCancella" data-arg="${n}">Cancella</button></div><canvas class="pad" data-for="${n}" aria-label="Spazio per la firma"></canvas><input type="hidden" id="f_${n}" name="${n}" value="${esc(val || '')}"><div class="small muted">Firma qui con il dito</div></div>`;
    default: return F(esc(c.label), inp(n, val));
  }
}
const rigaTab = (cols, r = []) => `<div class="mtr">${cols.map((h, j) => `<input value="${esc(r[j] || '')}" aria-label="${esc(h)}">`).join('')}<button type="button" data-act="tabRm" aria-label="Togli riga">×</button></div>`;
function sheetModulo(mod, isNew) {
  modEdit = { mod, isNew };
  const firme = (mod.campi || []).filter(c => c.tipo === 'firma');
  openSheet(mod.titolo || 'Modulo', `
    ${campoCliente('mcliente', 'Cliente', mod.cliente)}
    <div class="cliline small" id="cliInfo"></div>
    ${(mod.campi || []).map(c => campoModulo(c, (mod.valori || {})[c.id])).join('')}`,
  async fd => { salvaModulo(fd); toast('Modulo salvato'); }, {
    del: isNew ? null : async () => { store.drop('moduli', mod.id); toast('Modulo eliminato'); },
    extra: `<button type="button" class="btn dark" data-act="modPdf">PDF</button>`,
  });
  aggiornaCliInfoModulo();
  requestAnimationFrame(initFirme);
  if (firme.length) $('#sheetBody').addEventListener('touchmove', e => { if (e.target.classList?.contains('pad')) e.preventDefault(); }, { passive: false });
}
function aggiornaCliInfoModulo() {
  const box = $('#cliInfo'); const el = $('#f_mcliente'); if (!box || !el) return;
  const c = trovaCliente(el.value); box.innerHTML = !el.value.trim() ? '' : c ? `${svg('cli', 'i')} In rubrica · ${tipoCliente(c.tipo)}${c.telefono ? ' · ' + esc(c.telefono) : ''}` : `${svg('cli', 'i')} Cliente nuovo: lo aggiungo alla rubrica quando salvi`;
  box.classList.toggle('nuovo', !c);
}
function salvaModulo(fd) {
  const { mod, isNew } = modEdit;
  const valori = {};
  for (const c of mod.campi || []) {
    const n = 'm_' + c.id;
    if (['titolo', 'nota'].includes(c.tipo)) continue;
    if (c.tipo === 'check') valori[c.id] = !!fd.get(n);
    else if (c.tipo === 'tabella') valori[c.id] = [...document.querySelectorAll(`#tab_${c.id} .mtr:not(.mth)`)].map(r => [...r.querySelectorAll('input')].map(i => i.value.trim())).filter(r => r.some(Boolean));
    else valori[c.id] = String(fd.get(n) ?? '').trim();
  }
  const firme = (mod.campi || []).filter(c => c.tipo === 'firma');
  const cliente = String(fd.get('mcliente') || '').trim();
  const d = { ...stripId(mod), valori, cliente, clienteId: cliente ? assicuraCliente(cliente) : '', stato: firme.length && firme.every(f => valori[f.id]) ? 'firmato' : 'bozza' };
  const dataCampo = (mod.campi || []).find(c => c.tipo === 'data');
  d.data = (dataCampo && valori[dataCampo.id]) || mod.data || TODAY;
  const id = store.put('moduli', isNew ? null : mod.id, d);
  modEdit = { mod: { id, ...d }, isNew: false };
  return modEdit.mod;
}
function initFirme() {
  document.querySelectorAll('canvas.pad').forEach(cv => {
    if (cv.dataset.pronto) return; cv.dataset.pronto = '1';
    const ratio = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth || 300, h = 150;
    cv.width = w * ratio; cv.height = h * ratio;
    const ctx = cv.getContext('2d'); ctx.scale(ratio, ratio);
    const pulisci = () => { ctx.fillStyle = cv.dataset.fondo || '#ffffff'; ctx.fillRect(0, 0, w, h); };
    pulisci();
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14181b';
    const hidden = $('#f_' + cv.dataset.for);
    if (hidden.value) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, w, h); im.src = hidden.value; }
    cv._pulisci = pulisci;
    let disegna = false, ultimo = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => { disegna = true; ultimo = pos(e); cv.setPointerCapture?.(e.pointerId); e.preventDefault(); });
    cv.addEventListener('pointermove', e => { if (!disegna) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(...ultimo); ctx.lineTo(...p); ctx.stroke(); ultimo = p; e.preventDefault(); });
    const fine = () => {
      if (!disegna) return; disegna = false;
      const out = document.createElement('canvas'); out.width = 600; out.height = Math.round(600 * h / w);
      out.getContext('2d').drawImage(cv, 0, 0, out.width, out.height);
      hidden.value = out.toDataURL('image/jpeg', 0.78);
    };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => cv.addEventListener(ev, fine));
  });
}
function mostraPdf(bytes, nome, titolo, indietro) {
  const file = new File([bytes], nome, { type: 'application/pdf' });
  if (pdfCorrente?.url) URL.revokeObjectURL(pdfCorrente.url);
  pdfCorrente = { file, url: URL.createObjectURL(file), indietro };
  let share = false; try { share = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch {}
  openSheet(titolo, `
    <div class="pdfready">${svg('doc')}<div><b>${esc(nome)}</b><div class="small muted">${num(bytes.length / 1024, 0)} KB</div></div></div>
    <div class="stack">
      ${share ? `<button type="button" class="btn primary" data-act="pdfShare">Invia o salva (WhatsApp, Mail, File…)</button>` : ''}
      <a class="btn ${share ? '' : 'primary'}" href="${pdfCorrente.url}" target="_blank" rel="noopener">Apri il PDF</a>
      <button type="button" class="btn" data-act="pdfDown">Scarica sul dispositivo</button>
    </div>`, null, { extra: indietro ? '<button type="button" class="btn" data-act="pdfBack">‹ Torna indietro</button>' : '' });
}
function rModuli() {
  const L = [...S.moduli].sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return `<div class="row between"><h2>Moduli</h2><button class="btn primary" data-act="modScegli" type="button">${svg('plus')} Nuovo</button></div>
  <section class="stack"><h3>Compilati</h3>
    ${L.map(m => `<div class="card" role="button" tabindex="0" data-act="editMod" data-id="${m.id}"><div class="row between"><span class="t">${esc(m.titolo)}</span><span class="chip ${m.stato === 'firmato' ? 'ok' : ''}">${m.stato === 'firmato' ? 'Firmato' : 'Da firmare'}</span></div><div class="small muted">${esc(m.cliente || 'Senza cliente')} · ${fmtD(m.data, { day: 'numeric', month: 'short', year: 'numeric' })}${m.autoreNome ? ' · compilato da ' + esc(m.autoreNome) : ''}</div></div>`).join('') || `<div class="empty"><b>Nessun modulo compilato.</b><span class="small">Rapporto di assistenza, scheda di manutenzione, verbale di collaudo e consenso foto e video: si compilano qui, si firmano sullo schermo e diventano il tuo PDF.</span></div>`}
  </section>
  <section class="stack"><div class="row between"><h3>Modelli</h3><button class="btn sm" data-act="modelloNuovo" type="button">${svg('plus')} Modello</button></div>
    <div class="panel">${modelli().map(m => `<div class="list-line"><div><b>${esc(m.nome)}</b><div class="small muted">${m.ufficiale ? 'Modulo Cassero · grafica originale' : `${(m.campi || []).length} campi · creato da te`}</div></div>${m.ufficiale ? `<button class="btn sm" data-act="modNuovo" data-arg="${esc(m.id)}" type="button">Compila</button>` : `<button class="btn sm" data-act="editModello" data-arg="${esc(m.id)}" type="button">Modifica</button>`}</div>`).join('')}</div>
  </section>`;
}

/* ---------- moduli CASSERO (PDF originali) ---------- */
const SFONDI = {};
async function sfondoModulo(id) {
  if (SFONDI[id]) return SFONDI[id];
  try { const r = await fetch(`moduli/${id}.jpg`); if (r.ok) SFONDI[id] = new Uint8Array(await r.arrayBuffer()); } catch {}
  return SFONDI[id];
}
const piuAnno = d => { const [y, m, g] = String(d || TODAY).split('-'); return `${+y + 1}-${m}-${g}`; };
const comuneDa = ind => { const p = String(ind || '').split(',').map(x => x.trim()).filter(Boolean); if (p.length < 2) return ''; return p[p.length - 1].replace(/\b\d{5}\b/, '').replace(/\(\s*[A-Z]{2}\s*\)|\b[A-Z]{2}$/, '').trim(); };
/** Dati del cliente in rubrica, divisi come vogliono i moduli. */
function datiCliente(c) {
  if (!c) return {};
  const pi = String(c.piva || '').trim(), sd = String(c.sdi || '').trim();
  return { telefono: c.telefono, email: c.email, indirizzo: c.indirizzo, cf: /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i.test(pi) ? pi.toUpperCase() : '', piva: /^[A-Z]{6}\d{2}/i.test(pi) ? '' : pi, sdi: sd.includes('@') ? '' : sd, pec: sd.includes('@') ? sd : '' };
}
function valoriUfficiali(m, ctx) {
  const c = datiCliente(ctx.clienteId ? S.clienti.find(x => x.id === ctx.clienteId) : trovaCliente(ctx.cliente));
  const x = { ...c, ...Object.fromEntries(Object.entries(ctx).filter(([, v]) => v != null && v !== '')) };
  const auto = {
    data: x.data || TODAY, oggi: TODAY, dataLavoro: x.dataLavoro || '', traUnAnno: piuAnno(x.data || TODAY), comune: comuneDa(x.indirizzo),
    pezzi: (x.righe || []).filter(r => (r.unita || 'pz') === 'pz').reduce((a, r) => a + n2(r.qta), 0) || '',
  };
  const v = {};
  for (const f of campiUfficiali(m)) {
    if (f.def) v[f.n] = f.def;
    if (!f.auto) continue;
    const val = f.auto in auto ? auto[f.auto] : x[f.auto];
    if (val != null && val !== '') v[f.n] = String(val);
  }
  if (x.km) v._km = String(x.km);
  // prodotti della posa nelle righe del verbale
  const pref = m.id === 'verbale-collaudo' ? 'prod' : m.id === 'scheda-manutenzione' ? 'serr' : '';
  if (pref) (x.righe || []).slice(0, 4).forEach((r, i) => { v[`${pref}${i + 1}_qta`] = n2(r.qta) ? String(n2(r.qta)) : ''; v[`${pref}${i + 1}_note`] = r.descr || ''; });
  if (m.id === 'rapporto-assistenza') calcolaRapporto(v);
  return v;
}
const euro2 = x => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');
const leggiEuro = s => { const x = parseFloat(String(s || '').replace(/\./g, (m, i, t) => t.includes(',') ? '' : m).replace(',', '.')); return isFinite(x) ? x : 0; };
const minuti = h => { const m = String(h || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
/** Rapporto: tempo dall'orario, manodopera oltre la prima ora (35 €/h, a mezz'ore), trasferta 1 €/km, totale. */
function calcolaRapporto(v, toccati = {}) {
  const a = minuti(v.ora_inizio), b = minuti(v.ora_fine);
  let durata = null;
  if (a != null && b != null) { durata = b >= a ? b - a : b + 1440 - a; if (!toccati.tempo) v.tempo = `${Math.floor(durata / 60)} h${durata % 60 ? ' ' + (durata % 60) + ' min' : ''}`; }
  if (durata != null && !toccati.costo_manodopera) { const oltre = Math.max(0, Math.ceil((durata - 60) / 30) / 2); v.costo_manodopera = oltre ? euro2(oltre * 35) : ''; }
  if (n2(v._km) && !toccati.costo_trasferta) v.costo_trasferta = euro2(n2(v._km) * (LIST().euroKm || 1));
  if (!toccati.costo_totale) { const t = ['costo_chiamata', 'costo_manodopera', 'costo_trasferta', 'costo_materiali'].reduce((s, k) => s + leggiEuro(v[k]), 0); v.costo_totale = t ? euro2(t) : ''; }
  return v;
}
const nomeU = n => 'u_' + n;
function campoU(c, v) {
  const n = nomeU(c.n), val = v[c.n] ?? '';
  switch (c.t) {
    case 'nota': return `<p class="modnota small" style="white-space:pre-line">${esc(c.l)}</p>`;
    case 'testolungo': return F(esc(c.l), `<textarea id="f_${n}" name="${n}" rows="4">${esc(val)}</textarea>`, 'full');
    case 'data': return F(esc(c.l), inp(n, val, 'date'));
    case 'ora': return F(esc(c.l), inp(n, val, 'time'));
    case 'euro': return F(esc(c.l), inp(n, val, 'text', `inputmode="decimal" placeholder="0,00" ${c.calc ? 'class="tot"' : ''}`), c.full ? 'full' : '');
    case 'check': return tog(n, esc(c.l), !!v[c.n]);
    case 'radio': return `<div class="f full"><span>${esc(c.l)}</span><div class="seg opzu" role="group">${c.opz.map(([k, l]) => `<button type="button" data-act="siNo" data-arg="${k}" data-for="${n}" aria-pressed="${val === k}">${esc(l)}</button>`).join('')}</div><input type="hidden" id="f_${n}" name="${n}" value="${esc(val)}"></div>`;
    case 'firma': return `<div class="firma full"><div class="row between"><span class="fs-t">${esc(c.l)}</span><button type="button" class="linkbtn" data-act="firmaCancella" data-arg="${n}">Cancella</button></div><canvas class="pad" data-for="${n}" data-fondo="${esc(POSIZIONI[modEdit?.uff?.id]?.campi[c.n]?.fondo || '#FFF8E6')}" aria-label="Spazio per la firma"></canvas><input type="hidden" id="f_${n}" name="${n}" value="${esc(val)}"><div class="small muted">Firma qui con il dito</div></div>`;
    case 'griglia': return c.righe.map((r, i) => `<div class="urig full"><span class="fs-t">Riga ${i + 1}</span><div class="g2">${r.map((nn, j) => { const col = c.col[j], vv = v[nn] ?? '';
      return col.t === 'scelta' ? F(esc(col.l), sel(nomeU(nn), [['', '—'], ...col.opz.map(o => [o, o])], vv)) : F(esc(col.l), inp(nomeU(nn), vv, col.t === 'numero' ? 'number' : 'text')); }).join('')}</div></div>`).join('');
    case 'controlli': return `<div class="full row"><button type="button" class="btn sm" data-act="tuttiOk">Segna tutto ${esc(c.opz[0][1])}</button></div>` + c.gruppi.map(g => `${g.l ? `<div class="ugrp full">${esc(g.l)}</div>` : ''}${g.righe.map(([nn, l]) => `<div class="uctl full"><span>${esc(l)}</span><div class="seg" role="group">${c.opz.map(([k, ll]) => `<button type="button" data-act="siNo" data-arg="${k}" data-for="${nomeU(nn)}" aria-pressed="${v[nn] === k}">${esc(ll)}</button>`).join('')}</div><input type="hidden" id="f_${nomeU(nn)}" name="${nomeU(nn)}" value="${esc(v[nn] || '')}"></div>`).join('')}`).join('');
    default: {
      if (c.auto === 'cliente') return `<div class="full">${campoCliente('mcliente', esc(c.l), val)}<div class="cliline small" id="cliInfo"></div></div>`;
      return F(esc(c.l), inp(n, val, c.tipo || 'text'), c.full ? 'full' : '');
    }
  }
}
function sheetModuloU(mod, isNew) {
  const m = ufficiale(mod.modelloId);
  modEdit = { mod, isNew, uff: m, toccati: { ...(mod.toccati || {}) } };
  const v = { ...(mod.valori || {}) };
  const corpo = m.sezioni.map(s => {
    const inner = s.campi.map(c => campoU(c, v)).join('');
    const extra = m.id === 'rapporto-assistenza' && s.titolo.startsWith('5.') ? F('Km percorsi (andata e ritorno)', inp('u__km', v._km || '', 'number', 'placeholder="Per calcolare la trasferta"')) : '';
    return `<div class="fieldset ufs">${s.titolo ? `<span class="fs-t">${esc(s.titolo)}</span>` : ''}<div class="ugrid">${extra}${inner}</div></div>`;
  }).join('');
  openSheet(m.nome, `<div class="small muted">${esc(m.descr)} · il PDF esce con la grafica originale.</div>${corpo}
    ${m.id === 'rapporto-assistenza' ? '<div class="small muted">Tempo, manodopera (35 €/h oltre la prima ora, a mezz\'ore), trasferta e totale si calcolano da soli; se correggi un importo a mano, resta il tuo.</div>' : ''}`,
  async fd => { salvaModuloU(fd); toast('Modulo salvato'); }, {
    del: isNew || !GESTORE() ? null : async () => { store.drop('moduli', mod.id); toast('Modulo eliminato'); },
    extra: `<button type="button" class="btn dark" data-act="modPdf">PDF</button>`,
  });
  aggiornaCliInfoModulo();
  requestAnimationFrame(initFirme);
  $('#sheetBody').addEventListener('touchmove', e => { if (e.target.classList?.contains('pad')) e.preventDefault(); }, { passive: false });
}
function leggiValoriU(fd) {
  const m = modEdit.uff, v = {};
  for (const c of campiUfficiali(m)) {
    if (c.auto === 'cliente') { v[c.n] = String(fd.get('mcliente') || '').trim(); continue; }
    if (c.t === 'check') { v[c.n] = !!fd.get(nomeU(c.n)); continue; }
    v[c.n] = String(fd.get(nomeU(c.n)) ?? '').trim();
  }
  const km = String(fd.get('u__km') ?? '').trim(); if (km) v._km = km;
  return v;
}
function salvaModuloU(fd) {
  const { mod, isNew, uff: m, toccati } = modEdit;
  const valori = leggiValoriU(fd);
  const cliente = String(fd.get('mcliente') || '').trim();
  const firme = campiUfficiali(m).filter(c => c.t === 'firma');
  const dip = !GESTORE() && store.st.mode !== 'demo';
  const d = { ...stripId(mod), modelloId: m.id, ufficiale: true, titolo: m.nome, valori, toccati, cliente, clienteId: cliente && !dip ? assicuraCliente(cliente) : '',
    stato: firme.every(f => valori[f.n]) ? 'firmato' : 'bozza', data: valori.data_intervento || valori.data_collaudo || valori.data || mod.data || TODAY };
  let id;
  if (dip) {
    id = mod.id || (crypto.randomUUID ? crypto.randomUUID() : 'm' + Date.now().toString(36));
    delete d.autore; delete d.autoreNome;
    store.rpc('salva_modulo_dipendente', { mid: id, dati: d }).then(() => caricaDip()).catch(err => toast(err.userMsg || 'Modulo non salvato: controlla la rete'));
  } else id = store.put('moduli', isNew ? null : mod.id, d);
  modEdit = { ...modEdit, mod: { id, ...d }, isNew: false };
  return modEdit.mod;
}
/** Ricalcola i costi del rapporto mentre scrivi. */
function aggiornaRapporto(t) {
  if (!modEdit?.uff || modEdit.uff.id !== 'rapporto-assistenza') return;
  const k = t.name?.replace(/^u_/, '');
  if (['tempo', 'costo_manodopera', 'costo_trasferta', 'costo_totale'].includes(k)) modEdit.toccati[k] = !!t.value.trim();
  if (!['ora_inizio', 'ora_fine', '_km', 'costo_chiamata', 'costo_manodopera', 'costo_trasferta', 'costo_materiali', 'tempo'].includes(k)) return;
  const v = leggiValoriU(new FormData($('#sheetForm')));
  calcolaRapporto(v, modEdit.toccati);
  for (const f of ['tempo', 'costo_manodopera', 'costo_trasferta', 'costo_totale']) { const el = $('#f_u_' + f); if (el && el !== t) el.value = v[f] || ''; }
}

/* editor dei modelli */
const rigaCampo = c => `<div class="mcampo" data-id="${esc(c.id)}" data-auto="${esc(c.auto || '')}" data-valore="${esc(c.valore || '')}">
  <div class="mc1"><select name="mc_tipo" aria-label="Tipo di campo">${TIPI_CAMPO.map(([k, l]) => `<option value="${k}" ${k === c.tipo ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <button type="button" data-act="mcSu" aria-label="Sposta su">↑</button><button type="button" data-act="mcGiu" aria-label="Sposta giù">↓</button><button type="button" data-act="mcRm" aria-label="Togli campo">×</button></div>
  <input name="mc_label" value="${esc(c.label || '')}" placeholder="${c.tipo === 'nota' ? 'Testo da stampare' : 'Etichetta'}" aria-label="Etichetta">
  <input name="mc_opz" value="${esc((c.opzioni || c.colonne || []).join(', '))}" placeholder="${c.tipo === 'tabella' ? 'Colonne, separate da virgola' : 'Scelte, separate da virgola'}" aria-label="Scelte o colonne" ${['scelta', 'tabella'].includes(c.tipo) ? '' : 'hidden'}>
</div>`;
function sheetModello(m) {
  const isNew = !m; m = m || { nome: '', descr: '', campi: [{ id: 'data', tipo: 'data', label: 'Data', auto: 'data' }, { id: 'ind', tipo: 'testo', label: 'Indirizzo', auto: 'indirizzo' }] };
  openSheet(isNew ? 'Nuovo modello' : 'Modifica modello', `
    ${F('Nome del modulo', inp('mnome', m.nome, 'text', 'required placeholder="Es. Verbale di sopralluogo"'))}
    ${F('Descrizione', inp('mdescr', m.descr))}
    <div class="fieldset"><span class="fs-t">Campi, nell'ordine in cui compaiono</span><div id="mcampi" class="stack">${(m.campi || []).map(rigaCampo).join('')}</div><button type="button" class="btn sm" data-act="mcAdd">+ Campo</button></div>
    <div class="small muted">Il cliente si sceglie sempre in cima al modulo. I campi Data e Indirizzo si compilano da soli dal lavoro o dal cliente. I moduli già compilati non cambiano.</div>`,
  async () => {
    const campi = [...document.querySelectorAll('#mcampi .mcampo')].map(el => {
      const tipo = el.querySelector('[name="mc_tipo"]').value, label = el.querySelector('[name="mc_label"]').value.trim();
      const opz = el.querySelector('[name="mc_opz"]').value.split(',').map(s => s.trim()).filter(Boolean);
      const c = { id: el.dataset.id, tipo, label };
      if (el.dataset.auto) c.auto = el.dataset.auto; if (el.dataset.valore) c.valore = el.dataset.valore;
      if (tipo === 'scelta') c.opzioni = opz.length ? opz : ['Sì', 'No'];
      if (tipo === 'tabella') c.colonne = opz.length ? opz : ['Voce', 'Note'];
      return c;
    }).filter(c => c.label);
    if (!campi.length) throw Object.assign(new Error('vuoto'), { userMsg: 'Aggiungi almeno un campo' });
    store.put('modelli', isNew ? null : m.id, { nome: $('#f_mnome').value.trim(), descr: $('#f_mdescr').value.trim(), campi });
    toast('Modello salvato');
  }, { del: isNew || (m.base && !m.modificato) ? null : async () => { store.drop('modelli', m.id); toast(m.base ? 'Modello pronto ripristinato' : 'Modello eliminato'); } });
  if (!isNew && m.base && m.modificato) { const d = $('#sheetFoot [data-act="del"]'); if (d) d.textContent = 'Ripristina originale'; }
}

/* ---------- cantieri e navigazione (anche su CarPlay) ---------- */
const navLink = (tipo, ind) => {
  const q = encodeURIComponent(ind);
  return tipo === 'apple' ? `https://maps.apple.com/?daddr=${q}&dirflg=d` : tipo === 'google' ? `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving` : `https://waze.com/ul?q=${q}&navigate=yes`;
};
const bottoniNav = ind => `<div class="navbtns"><a class="btn sm primary" href="${navLink('apple', ind)}" target="_blank" rel="noopener">${svg('pin', 'i')} Mappe</a><a class="btn sm" href="${navLink('google', ind)}" target="_blank" rel="noopener">Google</a><a class="btn sm" href="${navLink('waze', ind)}" target="_blank" rel="noopener">Waze</a></div>`;
function elencoCantieri() {
  const m = new Map();
  const add = (ind, j) => { if (!String(ind || '').trim()) return; const k = normNome(ind); const s = m.get(k) || { indirizzo: ind.trim(), lavori: [] }; s.lavori.push(j); m.set(k, s); };
  S.lavori.forEach(l => add(l.indirizzo, { kind: 'lavori', x: l, d: l.data, f: l.dataFine || l.data, tipo: 'Posa', cliente: l.cliente }));
  S.interventi.filter(i => i.stato !== 'annullato').forEach(i => add(i.indirizzo, { kind: 'interventi', x: i, d: i.dataProg || i.data, f: i.dataProg || i.data, tipo: 'Intervento', cliente: i.cliente }));
  return [...m.values()].map(s => {
    s.lavori.sort((a, b) => a.d.localeCompare(b.d));
    s.oggi = s.lavori.filter(j => j.d <= TODAY && j.f >= TODAY);
    s.prossimo = s.lavori.find(j => j.d > TODAY);
    s.ultimo = [...s.lavori].reverse().find(j => j.f < TODAY);
    s.clienti = [...new Set(s.lavori.map(j => j.cliente).filter(Boolean))];
    return s;
  });
}
function rigaCantiere(s, quando) {
  const j = quando === 'oggi' ? s.oggi[0] : quando === 'prossimi' ? s.prossimo : s.ultimo;
  return `<div class="card cant"><div class="row between"><span class="t">${esc(s.indirizzo)}</span>${j ? `<span class="chip ${quando === 'oggi' ? 'warn' : quando === 'prossimi' ? 'in' : ''}">${quando === 'oggi' ? 'Oggi' : fmtD(j.d, { day: 'numeric', month: 'short' })}</span>` : ''}</div>
    <div class="small muted">${esc(s.clienti.join(', '))} · ${s.lavori.length} ${s.lavori.length === 1 ? 'lavoro' : 'lavori'}${j ? ` · ${j.tipo.toLowerCase()}` : ''}</div>
    ${bottoniNav(s.indirizzo)}
    ${j && quando !== 'passati' ? `<div class="links"><button type="button" class="linkbtn" data-act="${j.kind === 'lavori' ? 'editLav' : 'editInt'}" data-id="${j.x.id}">Apri il lavoro</button></div>` : ''}
  </div>`;
}
function rCantieri() {
  const q = normNome(UI.cercaCant || '');
  const tutti = elencoCantieri().filter(s => !q || normNome(s.indirizzo).includes(q) || s.clienti.some(c => normNome(c).includes(q)));
  const oggi = tutti.filter(s => s.oggi.length);
  const pross = tutti.filter(s => !s.oggi.length && s.prossimo).sort((a, b) => a.prossimo.d.localeCompare(b.prossimo.d));
  const pass = tutti.filter(s => !s.oggi.length && !s.prossimo).sort((a, b) => String(b.ultimo?.d || '').localeCompare(String(a.ultimo?.d || '')));
  return `<div class="row between"><h2>Cantieri</h2></div>
  <div class="notice small"><b>Su CarPlay:</b> con l'iPhone collegato all'auto, tocca <b>Mappe</b>, <b>Google Maps</b> o <b>Waze</b> e il percorso parte sullo schermo dell'auto. Con il calendario «Diario di Posa» qui sotto trovi tutti i lavori anche nell'app Calendario di CarPlay, con l'indirizzo pronto per la navigazione.</div>
  ${boxCalendario()}
  <label class="f"><span class="sr">Cerca</span><input id="cercaCantiere" type="search" placeholder="Cerca per indirizzo o cliente…" value="${esc(UI.cercaCant || '')}" autocomplete="off"></label>
  <div id="listaCantieri" class="stack">
    ${oggi.length ? `<h3>Oggi</h3>${oggi.map(s => rigaCantiere(s, 'oggi')).join('')}` : ''}
    ${pross.length ? `<h3>Prossimi</h3>${pross.map(s => rigaCantiere(s, 'prossimi')).join('')}` : ''}
    ${pass.length ? `<h3>Già fatti</h3>${pass.slice(0, 40).map(s => rigaCantiere(s, 'passati')).join('')}` : ''}
    ${!tutti.length ? `<div class="empty"><b>${q ? 'Nessun cantiere trovato.' : 'Nessun cantiere ancora.'}</b><span class="small">Compaiono qui gli indirizzi delle pose e degli interventi.</span></div>` : ''}
  </div>`;
}
/** Calendario in abbonamento: l'app lo tiene aggiornato e l'iPhone lo rilegge da solo (visibile anche su CarPlay). */
function boxCalendario() {
  const c = S.impostazioni?.calendario;
  if (!c?.url) return `<div class="panel stack"><b>Calendario sull'iPhone</b><div class="small muted">Crea un calendario dedicato «Diario di Posa» nell'app Calendario (e quindi su CarPlay) con pose, interventi, ferie, fiere e corsi. Si aggiorna da solo ogni volta che cambi qualcosa qui.</div><div class="row"><button type="button" class="btn sm primary" data-act="calAttiva">Attiva</button></div></div>`;
  return `<div class="panel stack"><b>Calendario sull'iPhone</b>
    <div class="small muted">Tocca <b>Iscriviti sull'iPhone</b> e conferma con <b>Iscriviti</b>: compare il calendario «Diario di Posa», anche su CarPlay. Ogni modifica fatta qui arriva sul telefono da sola (l'iPhone controlla di solito ogni ora; per farlo più spesso: Impostazioni › App › Calendario › Account › Recupera dati).</div>
    <div class="row"><a class="btn sm primary" href="${esc(c.url.replace(/^https:/, 'webcal:'))}">Iscriviti sull'iPhone</a><button type="button" class="btn sm" data-act="calCopia">Copia indirizzo</button></div>
    <div class="small muted">Il link è personale: chi lo ha vede i tuoi appuntamenti. Se lo hai dato a qualcuno per sbaglio, <button type="button" class="linkbtn" data-act="calNuovo">cambia link</button> (il vecchio smette di funzionare) oppure <button type="button" class="linkbtn" data-act="calSpegni">disattiva</button>.</div></div>`;
}
const nuovoToken = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
const testoCal = () => creaCalendario(S, IMP().giornata);
const senzaStamp = t => t.replace(/^DTSTAMP:.*\r\n/gm, '');
let calTimer = null;
/** Dopo ogni modifica: se il calendario è cambiato, lo ricarico (aspetto qualche secondo per raggruppare le modifiche). */
function aggiornaCalendario() {
  const c = S.impostazioni?.calendario; if (!c?.path || !store.cloud()) return;
  clearTimeout(calTimer);
  calTimer = setTimeout(async () => {
    const t = testoCal(), k = 'ddp:cal:' + c.path, firma = senzaStamp(t);
    let prima = ''; try { prima = localStorage.getItem(k) || ''; } catch {}
    if (prima === firma) return;
    if (await store.caricaCalendario(c.path, t)) { try { localStorage.setItem(k, firma); } catch {} }
  }, 6000);
}
async function attivaCalendario(cambio) {
  if (!store.cloud()) throw Object.assign(new Error('no'), { userMsg: 'Serve essere collegati con il tuo account e avere la rete.' });
  const vecchio = S.impostazioni?.calendario?.path;
  const path = store.calPath(nuovoToken());
  if (!(await store.caricaCalendario(path, testoCal()))) throw Object.assign(new Error('upload'), { userMsg: 'Non sono riuscito a creare il calendario: controlla la rete e riprova.' });
  const url = await store.linkCalendario(path);
  salvaImp({ calendario: { path, url, creato: TODAY } });
  if (cambio && vecchio) store.removeFile(vecchio).catch(() => {});
}

/* ---------- impostazioni condivise (valgono su tutti i dispositivi) ---------- */
const IMP = () => impostazioni(S);
function salvaImp(parte) { store.put('cfg', 'impostazioni', { ...(S.impostazioni || {}), ...parte }); }
const GIORNI_BREVI = [[1, 'L'], [2, 'M'], [3, 'M'], [4, 'G'], [5, 'V'], [6, 'S'], [0, 'D']];
const NOMI_GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
function descrGiorni(g) {
  const s = [...g].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const k = s.join(',');
  if (k === '1,2,3,4,5') return 'lun–ven';
  if (k === '1,2,3,4,5,6') return 'lun–sab';
  return s.map(d => NOMI_GIORNI[d].slice(0, 3)).join(', ');
}

/* ---------- menu laterale ---------- */
function menuHtml() {
  const N = IMP().notifiche, G = IMP().giornata, A = IMP().analisi;
  const attive = Object.values(A).filter(Boolean).length, tot = Object.keys(A).length;
  const st = store.st;
  const item = (act, arg, icon, label, sub = '', on = false) => `<button class="dr-item ${on ? 'on' : ''}" data-act="${act}" data-arg="${arg}" type="button">${svg(icon)}<span>${label}${sub ? `<small>${sub}</small>` : ''}</span></button>`;
  return `<div class="dr-head"><div><b>Diario di Posa</b><div class="small">${st.mode === 'demo' ? 'Modalità prova' : esc(st.email || '')}</div></div><button class="iconbtn" data-act="menuClose" type="button" aria-label="Chiudi menu">×</button></div>
  <div class="tape" aria-hidden="true"></div>
  <div class="dr-sec">Sezioni</div>
  ${TABS.map(([k, l, i]) => item('menuGo', k, i, l, '', UI.tab === k)).join('')}
  ${item('menuGo', 'cantieri', 'pin', 'Cantieri', 'indirizzi, navigazione e CarPlay', UI.tab === 'cantieri')}
  ${item('menuGo', 'moduli', 'clip2', 'Moduli', 'rapporti, manutenzioni, collaudi, consensi', UI.tab === 'moduli')}
  ${st.mode === 'demo' ? '' : item('menuGo', 'accessi', 'cli', `Accessi${daFareAccessi() ? ` <span class="badge">${daFareAccessi()}</span>` : ''}`, 'titolari, rivenditori, dipendenti', UI.tab === 'accessi')}
  <div class="dr-sec">Impostazioni <span class="dr-note">uguali su tutti i tuoi dispositivi</span></div>
  ${item('setNotifiche', '', 'bell', 'Notifiche e promemoria', [N.mattino ? `mattino ${N.oraMattino}:00` : '', N.sera ? `sera ${N.oraSera}:00` : ''].filter(Boolean).join(' · ') || 'disattivate')}
  ${item('setGiornata', '', 'clock', 'Giornata e orari', `${G.inizio}–${G.fine} · ${descrGiorni(G.giorni)} · ${num(oreGiornata(G))} ore`)}
  ${item('setAnalisi', '', 'an', 'Statistiche da mostrare', `${attive} di ${tot} attive`)}
  ${item('editListino', '', 'prev', 'Listino prezzi', `${LIST().voci.length} voci · trasferta ${eur(euroKm())}/km`)}
  ${item('editAzienda', '', 'doc', 'Dati azienda e condizioni', `IVA predefinita: ${ivaOf(AZ().ivaPredefinita)[1]}`)}
  ${item('editVan', '', 'van', 'Dati del furgone', S.furgone?.targa ? esc(S.furgone.targa) : 'targa e scadenze')}
  ${item('menuGo', 'set', 'folder', 'Cartelle, account e installazione', '')}
  <div class="dr-foot small muted">${st.mode === 'demo' ? '' : st.online ? 'Dati sincronizzati sui tuoi dispositivi' : 'Offline: le modifiche partono appena torna la rete'}</div>`;
}
function apriMenu() {
  $('#drawerPanel').innerHTML = menuHtml();
  $('#drawer').hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => $('#drawer').classList.add('aperto')));
}
function chiudiMenu() {
  const d = $('#drawer'); if (d.hidden) return;
  d.classList.remove('aperto');
  setTimeout(() => { d.hidden = true; }, 220);
}

/* ---------- notifiche ---------- */
const nomeDispositivo = ua => /iphone/i.test(ua) ? 'iPhone' : /ipad/i.test(ua) ? 'iPad' : /android/i.test(ua) ? 'Android' : /macintosh|mac os/i.test(ua) ? 'Mac' : /windows/i.test(ua) ? 'Computer Windows' : 'Dispositivo';
const tog = (nome, label, on, sub = '') => `<label class="tog"><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" role="switch" name="${nome}" id="f_${nome}" ${on ? 'checked' : ''}></label>`;
const selN = (nome, opts, val) => `<select name="${nome}" id="f_${nome}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
function statoDispositivo() {
  const ps = pushState();
  return ps === 'granted' ? `<div class="row between"><span class="ok-t">${svg('bell', 'i')} Attive su questo dispositivo</span><div class="row"><button class="btn sm" data-act="pushProva" type="button">Prova</button><button class="btn sm" data-act="pushOn" type="button">Riattiva</button></div></div>`
    : ps === 'install' ? `<div><b>Prima aggiungi l'app alla schermata Home.</b> Su iPhone e iPad le notifiche funzionano solo così: in Safari tocca <b>Condividi</b> › <b>Aggiungi alla schermata Home</b>, poi apri l'app dall'icona.</div>`
    : ps === 'notready' ? `<div class="small muted">Le notifiche si attivano dopo il collegamento al database.</div>`
    : ps === 'denied' ? `<div class="small">Hai bloccato le notifiche su questo dispositivo. Riattivale da Impostazioni › Notifiche › Posa.</div>`
    : ps === 'unsupported' ? `<div class="small muted">Questo browser non supporta le notifiche.</div>`
    : `<div class="row between"><span>Non ancora attive qui</span><button class="btn primary sm" data-act="pushOn" type="button">Attiva su questo dispositivo</button></div>`;
}
async function caricaDispositivi() {
  const box = $('#devList'); if (!box) return;
  let mio = '';
  try { const reg = await navigator.serviceWorker?.ready; mio = (await reg?.pushManager?.getSubscription())?.endpoint || ''; } catch {}
  const lista = await store.listPush().catch(() => []);
  if (!$('#devList')) return;
  box.innerHTML = lista.length ? `<div class="small muted">Ricevono le notifiche:</div>${lista.map(d => `<div class="dev"><span>${svg('bell', 'i')} <b>${nomeDispositivo(d.device || '')}</b>${d.endpoint === mio ? ' <span class="chip ok">questo</span>' : ''}<small>dal ${fmtD((d.created_at || '').slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })}</small></span><button class="btn sm ghost" data-act="devRm" data-arg="${esc(d.endpoint)}" type="button">Togli</button></div>`).join('')}`
    : '<div class="small muted">Nessun dispositivo riceve ancora le notifiche.</div>';
}
function sheetNotifiche() {
  const N = IMP().notifiche;
  const ore = (da, a) => Array.from({ length: a - da + 1 }, (_, i) => [da + i, `${da + i}:00`]);
  openSheet('Notifiche e promemoria', `
    <div class="fieldset"><span class="fs-t">Su questo dispositivo</span>${statoDispositivo()}<div id="devList" class="stack"></div></div>
    <div class="fieldset"><span class="fs-t">Quando</span>
      <div class="togrow">${tog('mattino', 'Riepilogo del mattino', N.mattino, 'scadenze, fatture e lavori di oggi')}${selN('oraMattino', ore(5, 11), N.oraMattino)}</div>
      <div class="togrow">${tog('sera', 'Promemoria della sera', N.sera, 'giornata da segnare, scontrini, programma di domani')}${selN('oraSera', ore(15, 22), N.oraSera)}</div>
      ${tog('weekend', 'Anche sabato e domenica', N.weekend)}
      <div class="small muted">L'orario può slittare di qualche minuto.</div>
    </div>
    <div class="fieldset"><span class="fs-t">Furgone</span>
      <div class="togrow">${tog('furgone', 'Scadenze del furgone', N.furgone, 'assicurazione, bollo, revisione, tagliando')}${selN('furgoneGiorni', [[7, '7 gg prima'], [15, '15 gg prima'], [30, '30 gg prima'], [60, '60 gg prima']], N.furgoneGiorni)}</div>
    </div>
    <div class="fieldset"><span class="fs-t">Lavoro e giornata</span>
      ${tog('programma', 'Programma del giorno', N.programma, 'pose, interventi, ferie, fiere e corsi')}
      ${tog('giornata', 'Giornata da segnare', N.giornata, 'la sera, se in un giorno lavorativo non hai segnato niente')}
      ${tog('urgenti', 'Interventi molto urgenti', N.urgenti)}
    </div>
    <div class="fieldset"><span class="fs-t">Contabilità</span>
      ${tog('consuntivi', 'Lavori da consuntivare', N.consuntivi)}
      ${tog('fatture', 'Fatture da emettere', N.fatture, 'consuntivo inviato, fattura non ancora fatta')}
      ${tog('incassi', 'Fatture da incassare', N.incassi)}
      <div class="togrow">${tog('preventivi', 'Preventivi senza risposta', N.preventivi)}${selN('preventiviGiorni', [[3, 'dopo 3 gg'], [5, 'dopo 5 gg'], [7, 'dopo 7 gg'], [10, 'dopo 10 gg'], [15, 'dopo 15 gg']], N.preventiviGiorni)}</div>
      <div class="g2" style="margin-top:6px">${F('Promemoria scontrini', selN('scontrini', [['mai', 'Mai'], ['sera', 'Ogni sera lavorativa'], ['settimanale', 'Una volta a settimana']], N.scontrini))}<label class="f" id="wrapScG" ${N.scontrini === 'settimanale' ? '' : 'hidden'}><span>Il giorno</span>${selN('scontriniGiorno', GIORNI_BREVI.map(([d]) => [d, NOMI_GIORNI[d]]), N.scontriniGiorno)}</label></div>
    </div>
    <div class="fieldset"><span class="fs-t">Magazzino</span>${tog('materiale', 'Materiale da riordinare', N.materiale, 'quando scende sotto la scorta minima')}</div>
    <div class="small muted">Le stesse scelte valgono per il riquadro "Da fare" del calendario.</div>`,
  async fd => {
    const n = { ...N };
    for (const k of ['mattino', 'sera', 'weekend', 'furgone', 'programma', 'giornata', 'urgenti', 'consuntivi', 'fatture', 'incassi', 'preventivi', 'materiale']) n[k] = !!fd.get(k);
    for (const k of ['oraMattino', 'oraSera', 'furgoneGiorni', 'preventiviGiorni', 'scontriniGiorno']) n[k] = +fd.get(k);
    n.scontrini = fd.get('scontrini');
    salvaImp({ notifiche: n });
    toast('Notifiche salvate su tutti i dispositivi');
  });
  caricaDispositivi();
}
async function pushProva() {
  try { const reg = await navigator.serviceWorker.ready; await reg.showNotification('Diario di Posa', { body: 'Le notifiche funzionano su questo dispositivo.', icon: 'icone/icona-192.png', tag: 'prova' }); toast('Notifica di prova mostrata'); }
  catch { toast('Non sono riuscito a mostrare la notifica'); }
}

/* ---------- giornata e orari ---------- */
function sheetGiornata() {
  const G = IMP().giornata;
  openSheet('Giornata e orari', `
    <div class="fieldset"><span class="fs-t">Orario di lavoro</span>
      <div class="g3">${F('Inizio', inp('ginizio', G.inizio, 'time'))}${F('Fine', inp('gfine', G.fine, 'time'))}${F('Pausa', selN('gpausa', [[0, 'nessuna'], [30, '30 min'], [45, '45 min'], [60, '1 ora'], [90, '1 ora e ½'], [120, '2 ore']], G.pausa))}</div>
      <div class="small"><b id="oreStd">${num(oreGiornata(G))} ore</b> di lavoro in una giornata</div>
    </div>
    <div class="fieldset"><span class="fs-t">Giorni lavorativi</span>
      <div class="giorni-sett">${GIORNI_BREVI.map(([d, l]) => `<label title="${NOMI_GIORNI[d]}"><input type="checkbox" name="ggiorni" value="${d}" ${G.giorni.includes(d) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <div class="small muted">Servono per le pose su più giorni (si saltano i giorni non lavorativi), per il promemoria della giornata e per le statistiche di occupazione.</div>
    </div>
    ${tog('gprecompila', 'Precompila le ore nelle nuove pose', G.precompila, 'ore della giornata × giorni di lavoro')}`,
  async fd => {
    const giorni = fd.getAll('ggiorni').map(Number);
    if (!giorni.length) throw Object.assign(new Error('giorni'), { userMsg: 'Scegli almeno un giorno lavorativo' });
    salvaImp({ giornata: { inizio: fd.get('ginizio') || '07:30', fine: fd.get('gfine') || '17:00', pausa: +fd.get('gpausa'), giorni, precompila: !!fd.get('gprecompila') } });
    toast('Orari salvati su tutti i dispositivi');
  });
}

/* ---------- statistiche da mostrare ---------- */
const SEZIONI_ANALISI = [
  ['Generale', [['kpi', 'Entrate, uscite e utile', 'con resa oraria'], ['mensile', 'Grafico mese per mese', 'entrate e uscite']]],
  ['Lavoro', [['lavoro', 'Giorni lavorati e rendimento', 'occupazione, incasso al giorno, pezzi al giorno'], ['voci', 'Cosa posi di più', 'le voci del listino più usate'], ['interventi', 'Interventi', 'quanti, quanti urgenti, tempi di risposta']]],
  ['Contabilità', [['contabilita', 'Situazione incassi', 'da consuntivare, da fatturare, da incassare, pagato'], ['spese', 'Dove vanno i soldi', 'spese per categoria'], ['preventivi', 'Preventivi', 'valore, accettati, tasso di accettazione']]],
  ['Clienti', [['clienti', 'Clienti', 'principali, nuovi, privati / rivenditori / imprese']]],
  ['Furgone e trasferte', [['furgone', 'Costi del furgone', 'carburante e manutenzione, costo per giorno'], ['trasferte', 'Trasferte', 'km fatturati e ricavi']]],
  ['Materiale', [['materiale', 'Incidenza del materiale', 'sul prezzo di ogni posa'], ['consumo', 'Consumo e ordini', 'quanto usi e ogni quanto ricompri']]],
];
function sheetAnalisi() {
  const A = IMP().analisi;
  openSheet('Statistiche da mostrare', `
    <div class="small muted">Scegli cosa vedere nella sezione Analisi. Vale su tutti i tuoi dispositivi.</div>
    ${SEZIONI_ANALISI.map(([g, voci]) => `<div class="fieldset"><span class="fs-t">${g}</span>${voci.map(([k, l, s]) => tog('an_' + k, l, A[k], s)).join('')}</div>`).join('')}`,
  async fd => {
    const a = {}; SEZIONI_ANALISI.forEach(([, v]) => v.forEach(([k]) => { a[k] = !!fd.get('an_' + k); }));
    salvaImp({ analisi: a }); toast('Statistiche aggiornate');
  });
}

/* ---------- statistiche aggiuntive ---------- */
function giorniLavorabili() {
  const G = IMP().giornata;
  const da = UI.anMonth === 'all' ? `${UI.anYear}-01-01` : `${UI.anYear}-${UI.anMonth}-01`;
  const fineP = UI.anMonth === 'all' ? `${UI.anYear}-12-31` : iso(new Date(UI.anYear, +UI.anMonth, 0));
  const a = fineP < TODAY ? fineP : TODAY;
  let n = 0;
  for (let d = pd(da); iso(d) <= a; d.setDate(d.getDate() + 1)) {
    const k = iso(d);
    if (G.giorni.includes(d.getDay()) && !S.eventi.some(e => e.tipo === 'ferie' && inEv(e, k))) n++;
  }
  return n;
}
const tile = (l, v, cls = '') => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v">${v}</div></div>`;
function statLavoro(lav, ints) {
  const giorni = new Set();
  lav.forEach(l => giorniPosa(l).filter(g => inPeriod(g) && g <= TODAY).forEach(g => giorni.add(g)));
  ints.forEach(i => giorni.add(i.dataProg || i.data));
  const nG = giorni.size, disp = giorniLavorabili();
  const incasso = sum(lav, l => l.importo) + sum(ints, i => i.costo);
  const ore = sum(lav, l => l.ore) + sum(ints, i => i.ore), pezzi = sum(lav, l => l.pezzi);
  const aOre = lav.filter(l => calcoloDi(l) === 'ore').length;
  return `<section class="panel stack"><h3>Giorni lavorati e rendimento</h3>
    <div class="kpis">${tile('Giorni lavorati', `${nG}${disp ? `<span class="small muted"> / ${disp}</span>` : ''}`)}${tile('Occupazione', disp ? Math.round(nG / disp * 100) + '%' : '—')}${tile('Incasso al giorno', nG ? eur(incasso / nG) : '—')}${tile('Resa oraria', ore ? eur(incasso / ore) : '—')}</div>
    <div class="kpis">${tile('Pezzi posati', num(pezzi, 0))}${tile('Pezzi al giorno', nG ? num(pezzi / nG) : '—')}${tile('Ore lavorate', num(ore))}${tile('Giornate a ore', `${aOre}<span class="small muted"> / ${lav.length}</span>`)}</div>
    <div class="small muted">L'occupazione confronta i giorni lavorati con i giorni lavorativi del periodo, ferie escluse.</div></section>`;
}
function statVoci(lav, ints) {
  const m = new Map();
  for (const x of [...lav, ...ints]) for (const r of x.righe || []) {
    if (['km', 'ora'].includes(r.voce) || r.unita === 'ora' || !r.descr) continue;
    const k = r.descr; const v = m.get(k) || { q: 0, e: 0 };
    v.q += n2(r.qta); v.e += totaleRiga(r, LIST()); m.set(k, v);
  }
  const top = [...m.entries()].sort((a, b) => b[1].e - a[1].e).slice(0, 8);
  if (!top.length) return `<section class="panel stack"><h3>Cosa posi di più</h3><div class="small muted">Compare quando usi le voci del listino nelle pose.</div></section>`;
  const max = top[0][1].e || 1;
  return `<section class="panel stack"><h3>Cosa posi di più</h3><div class="bars">${top.map(([k, v]) => `<div><div class="bar-l"><span>${esc(k)} <span class="muted small">· ${num(v.q, 1)}</span></span><span class="num">${eur(v.e)}</span></div><div class="bar-t"><div class="bar-f tape" style="width:${v.e / max * 100}%"></div></div></div>`).join('')}</div></section>`;
}
function statInterventi() {
  const L = S.interventi.filter(i => inPeriod(i.data));
  const chiusi = L.filter(i => i.stato === 'completato');
  const urg = L.filter(i => i.urgenza && i.urgenza !== 'normale');
  const attese = L.filter(i => i.dataProg && i.data).map(i => Math.max(0, (pd(i.dataProg) - pd(i.data)) / 864e5));
  return `<section class="panel stack"><h3>Interventi</h3><div class="kpis">${tile('Richiesti', L.length)}${tile('Completati', chiusi.length)}${tile('Urgenti', L.length ? Math.round(urg.length / L.length * 100) + '%' : '—')}${tile('Attesa media', attese.length ? num(sum(attese, x => x) / attese.length) + ' gg' : '—')}</div>
    <div class="small muted">Incasso medio per intervento: <b>${chiusi.length ? eur(sum(chiusi, i => i.costo) / chiusi.length) : '—'}</b>. L'attesa è il tempo tra la richiesta e il giorno dell'intervento.</div></section>`;
}
function statContabilita(lav, ints) {
  const jobs = [...lav.map(l => ({ a: l.amm, v: n2(l.importo) })), ...ints.map(i => ({ a: i.amm, v: n2(i.costo) }))];
  const tot = sum(jobs, j => j.v) || 1;
  const righe = AMM.map(([k, l, c]) => ({ l, c, v: sum(jobs.filter(j => (j.a || 'da_cons') === k), j => j.v), n: jobs.filter(j => (j.a || 'da_cons') === k).length }));
  return `<section class="panel stack"><h3>Situazione incassi</h3><div class="bars">${righe.map(r => `<div><div class="bar-l"><span>${r.l} <span class="muted small">· ${r.n}</span></span><span class="num">${eur(r.v)} · ${num(r.v / tot * 100, 0)}%</span></div><div class="bar-t"><div class="bar-f st-${r.c || 'x'}" style="width:${r.v / tot * 100}%"></div></div></div>`).join('')}</div>
    <div class="small muted">Lavori del periodo per stato. Da incassare in tutto: <b>${eur(sum(righe.slice(0, 3), r => r.v))}</b>.</div></section>`;
}
function statPreventivi() {
  const P = S.preventivi.filter(p => inPeriod(p.data));
  const v = p => totPrev(p).imponibile;
  const acc = P.filter(p => p.stato === 'accettato'), rif = P.filter(p => p.stato === 'rifiutato'), att = P.filter(p => p.stato === 'inviato');
  return `<section class="panel stack"><h3>Preventivi</h3><div class="kpis">${tile('Fatti', P.length)}${tile('Valore', eur(sum(P, v)))}${tile('Accettati', `${acc.length}<span class="small muted"> · ${eur(sum(acc, v))}</span>`)}${tile('Tasso', acc.length + rif.length ? Math.round(acc.length / (acc.length + rif.length) * 100) + '%' : '—')}</div>
    <div class="small muted">In attesa di risposta: <b>${att.length}</b> (${eur(sum(att, v))}). Valore medio: <b>${P.length ? eur(sum(P, v) / P.length) : '—'}</b>. Importi IVA esclusa.</div></section>`;
}
function statClienti(lav, ints) {
  const attivi = new Set([...lav, ...ints].map(x => x.clienteId || normNome(x.cliente)).filter(Boolean));
  const nuovi = S.clienti.filter(c => c.creato && inPeriod(c.creato));
  const perTipo = TIPI_CLIENTE.map(([k, l]) => [l, sum([...lav.map(x => [x, x.importo]), ...ints.map(x => [x, x.costo])].filter(([x]) => ((cliDi(x) || {}).tipo || 'finale') === k), ([, v]) => n2(v))]);
  const tot = sum(perTipo, x => x[1]) || 1;
  return `<section class="panel stack"><h3>Clienti</h3><div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">${tile('Clienti con lavori', attivi.size)}${tile('Nuovi in rubrica', nuovi.length)}</div>
    <div class="bars">${perTipo.map(([l, v]) => `<div><div class="bar-l"><span>${l}</span><span class="num">${eur(v)} · ${num(v / tot * 100, 0)}%</span></div><div class="bar-t"><div class="bar-f" style="width:${v / tot * 100}%"></div></div></div>`).join('')}</div></section>
  ${clientiPrincipali(lav, ints)}`;
}
function statTrasferte(lav, ints) {
  const km = [...lav, ...ints].map(x => (x.righe || []).find(r => r.voce === 'km')).filter(Boolean);
  const tot = sum(km, r => r.qta), ric = sum(km, r => totaleRiga(r, LIST()));
  return `<section class="panel stack"><h3>Trasferte</h3><div class="kpis">${tile('Km fatturati', num(tot, 0))}${tile('Ricavo', eur(ric))}${tile('Lavori con trasferta', km.length)}${tile('Km medi', km.length ? num(tot / km.length, 0) : '—')}</div></section>`;
}
function statFurgone(mov, lav, ints) {
  const sp = mov.filter(m => m.tipo !== 'entrata' && ['furgone', 'carburante'].includes(m.categoria));
  const carb = sum(sp.filter(m => m.categoria === 'carburante'), m => m.importo), manut = sum(sp.filter(m => m.categoria === 'furgone'), m => m.importo);
  const giorni = new Set(); lav.forEach(l => giorniPosa(l).filter(g => inPeriod(g) && g <= TODAY).forEach(g => giorni.add(g))); ints.forEach(i => giorni.add(i.dataProg || i.data));
  const entr = sum(lav, l => l.importo) + sum(ints, i => i.costo);
  return `<section class="panel stack"><h3>Costi del furgone</h3><div class="kpis">${tile('Carburante', eur(carb))}${tile('Manutenzione e tasse', eur(manut))}${tile('Al giorno lavorato', giorni.size ? eur((carb + manut) / giorni.size) : '—')}${tile('Sul fatturato', entr ? num((carb + manut) / entr * 100, 1) + '%' : '—')}</div></section>`;
}

/* ---------- impostazioni e cartelle ---------- */
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIOS() && !standalone() ? 'install' : 'unsupported';
  if (!CFG.vapidPublicKey || store.st.mode === 'demo') return 'notready';
  return Notification.permission;
}
function rSet() {
  const ps = pushState();
  const L = [...S.cartelle].sort((a, b) => String(a.nome).localeCompare(b.nome));
  return `<div class="row between"><h2>Cartelle e impostazioni</h2></div>
  <section class="stack"><div class="row between"><h3>Cartelle di lavoro</h3><button class="btn sm primary" data-act="newCart" type="button">${svg('plus')} Cartella</button></div>
    <div class="panel">${L.map(c => `<div class="folder">${svg('folder')}<div class="mid"><b>${esc(c.nome)}</b><span>${esc(c.nota || c.url || '')}</span></div>${isUrl(c.url) ? `<a class="btn sm" href="${esc(c.url)}" target="_blank" rel="noopener">Apri</a>` : ''}<button class="btn sm ghost" data-act="editCart" data-id="${c.id}" type="button">Modifica</button></div>`).join('') || `<div class="small muted">Aggiungi qui le cartelle che usi per l'attività (preventivi, schede tecniche, foto cantieri). Con un tocco si aprono su iPhone, iPad e Mac.</div>`}</div>
    <details class="panel small"><summary><b>Come ottenere il link di una cartella iCloud Drive</b></summary>
      <ol class="ios-steps" style="margin-top:8px">
        <li>Sposta la cartella dell'attività in iCloud Drive (sul Mac: Finder › iCloud Drive).</li>
        <li>Sul Mac: tasto destro sulla cartella › <b>Condividi</b> › <b>Condividi file</b> (o "Collabora"), scegli "Solo le persone invitate", poi <b>Copia link</b>.</li>
        <li>Su iPhone: app File › tieni premuto sulla cartella › <b>Condividi</b> › <b>Collabora</b> › <b>Copia link</b>.</li>
        <li>Incolla il link qui. Aprendolo, la cartella si apre in iCloud (app File su iPhone e iPad, Finder o browser sul Mac).</li>
      </ol>
      <p class="muted">Funzionano anche i link di Google Drive, Dropbox o OneDrive. Ogni posa può avere anche la sua cartella e i suoi allegati.</p>
    </details>
  </section>
  <section class="stack"><h3>Listino e preventivi</h3><div class="panel stack">
    <div class="row between"><span>Listino prezzi ${esc(LIST().anno || '')} · <b class="num">${LIST().voci.length}</b> voci</span><button class="btn sm" data-act="editListino" type="button">Modifica listino</button></div>
    <div class="row between"><span class="small">Dati azienda, IVA predefinita (<b>${esc(ivaOf(AZ().ivaPredefinita)[1])}</b>), termini e condizioni</span><button class="btn sm" data-act="editAzienda" type="button">Modifica</button></div>
  </div></section>
  <section class="stack"><h3>Notifiche</h3><div class="panel stack">${statoDispositivo()}<button class="btn" data-act="setNotifiche" type="button">${svg('bell')} Scegli notifiche e orari</button></div></section>
  ${!standalone() ? `<section class="stack"><h3>Installa come app</h3><div class="panel small"><ol class="ios-steps"><li><b>iPhone e iPad:</b> in Safari tocca <b>Condividi</b> › <b>Aggiungi alla schermata Home</b>.</li><li><b>Mac:</b> in Safari menu <b>File › Aggiungi al Dock</b>.</li></ol></div></section>` : ''}
  <section class="stack"><h3>Account</h3><div class="panel row between">
    ${store.st.mode === 'demo' ? '<span class="small muted">Modalità prova, senza account.</span>' : `<span class="small">Collegato come <b>${esc(store.st.email)}</b>${store.st.lastSync ? `<br><span class="muted">Ultima sincronizzazione ${store.st.lastSync.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>` : ''}</span><button class="btn sm" data-act="logout" type="button">Esci</button>`}
  </div></section>`;
}
async function pushOn() {
  try {
    if (!('serviceWorker' in navigator)) throw new Error('Notifiche non supportate');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Notifiche non consentite'); render(); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const raw = atob(CFG.vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - CFG.vapidPublicKey.length % 4) % 4));
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
    }
    await store.savePush(sub);
    toast('Notifiche attive');
  } catch (e) { console.warn(e); toast('Non sono riuscito ad attivare le notifiche: ' + (e.message || 'riprova')); }
  render();
}

/* ---------- foglio modale ---------- */
let onSubmit = null, sheetDel = null;
function openSheet(title, body, submit, { saveLabel = 'Salva', del = null, extra = '' } = {}) {
  $('#sheetTitle').textContent = title;
  $('#sheetBody').innerHTML = body;
  onSubmit = submit; sheetDel = del;
  $('#sheetFoot').innerHTML = `${del ? `<button type="button" class="btn danger" data-act="del">Elimina</button>` : ''}${extra}<span class="sp"></span><button type="button" class="btn" data-act="close">${submit ? 'Annulla' : 'Chiudi'}</button>${submit ? `<button type="submit" class="btn primary" id="saveBtn">${saveLabel}</button>` : ''}`;
  $('#sheet').hidden = false;
  aggiornaCliInfo();
  $('#sheetBody').scrollTop = 0;
  hydrateFiles($('#sheetBody'));
}
function closeSheet() { $('#sheet').hidden = true; onSubmit = null; sheetDel = null; }
$('#sheetForm').addEventListener('submit', async e => {
  e.preventDefault(); if (!onSubmit) return;
  const form = e.target;
  const bad = [...form.querySelectorAll('[required]')].find(i => !String(i.value).trim());
  if (bad) { bad.focus(); toast('Compila: ' + (bad.closest('label')?.querySelector('span')?.textContent || 'campo obbligatorio')); return; }
  const b = $('#saveBtn'); if (b) { b.disabled = true; b.textContent = 'Salvo…'; }
  try { await onSubmit(new FormData(form), form); closeSheet(); render(); }
  catch (err) { console.warn(err); toast(err.userMsg || 'Non sono riuscito a salvare, riprova.'); if (b) { b.disabled = false; b.textContent = 'Salva'; } }
});
const F = (label, inner, cls = '') => `<label class="f ${cls}"><span>${label}</span>${inner}</label>`;
const inp = (name, val, type = 'text', extra = '') => `<input id="f_${name}" name="${name}" type="${type}" value="${esc(val ?? '')}" ${type === 'number' ? 'step="any" inputmode="decimal"' : ''} ${extra}>`;
const sel = (name, opts, val) => `<select id="f_${name}" name="${name}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${k === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const matRow = (m = {}, buy = false) => buy
  ? `<div class="matrow buy"><input name="mn" list="matlist" placeholder="Materiale" value="${esc(m.nome || '')}" aria-label="Materiale"><input name="mq" type="number" step="any" inputmode="decimal" placeholder="Q.tà" value="${esc(m.qta ?? '')}" aria-label="Quantità"><input class="u" name="mu" placeholder="pz" value="${esc(m.unita || '')}" aria-label="Unità"><input name="mp" type="number" step="any" inputmode="decimal" placeholder="€ cad." value="${esc(m.prezzoUnit ?? '')}" aria-label="Prezzo unitario"><button type="button" data-act="rmrow" aria-label="Togli riga">×</button></div>`
  : `<div class="matrow"><input name="mn" list="matlist" placeholder="Es. schiuma, silicone, viti" value="${esc(m.nome || '')}" aria-label="Materiale"><input name="mq" type="number" step="any" inputmode="decimal" placeholder="Q.tà" value="${esc(m.qta ?? '')}" aria-label="Quantità"><button type="button" data-act="rmrow" aria-label="Togli riga">×</button></div>`;
function readMats(fd, buy = false) {
  const n = fd.getAll('mn'), q = fd.getAll('mq'), u = fd.getAll('mu'), p = fd.getAll('mp');
  return n.map((x, i) => { const o = { nome: x.trim(), qta: n2(q[i]) }; if (buy) { o.unita = (u[i] || '').trim() || (S.magazzino.find(s => s.id === slug(x))?.unita) || 'pz'; o.prezzoUnit = n2(p[i]); } return o; }).filter(o => o.nome && o.qta);
}
const matBox = (list, buy = false, title = 'Materiale usato') => `<div class="fieldset"><div class="row between"><span class="fs-t">${title}</span><button type="button" class="btn sm" data-act="addrow" data-arg="${buy ? 'buy' : ''}">+ Riga</button></div>${buy ? '<div class="small muted">Nome · quantità · unità · prezzo unitario</div>' : ''}<div class="matrows" id="matrows">${(list && list.length ? list : [{}]).map(m => matRow(m, buy)).join('')}</div></div>`;

/* allegati: lista modificabile nel foglio aperto */
let sheetFiles = [];
const filesBox = () => `<div class="fieldset"><div class="row between"><span class="fs-t">Allegati</span><label class="btn sm" for="attach">${svg('clip')} Aggiungi<input id="attach" type="file" multiple style="position:absolute;width:1px;height:1px;opacity:0"></label></div><div class="files" id="filesList">${filesHtml()}</div></div>`;
const filesHtml = () => sheetFiles.map((f, i) => `<div class="file">${svg('doc', 'i')}<button type="button" class="open" data-act="openFile" data-arg="${i}">${esc(f.nome)}</button><button type="button" class="x" data-act="rmFile" data-arg="${i}" aria-label="Togli allegato">×</button></div>`).join('') || '<div class="small muted">Preventivi, foto del cantiere, schede tecniche. Massimo 50 MB per file.</div>';
async function addFiles(list) {
  for (const file of list) {
    toast('Carico ' + file.name + '…');
    try {
      const blob = file.type.startsWith('image/') ? await shrink(file, 2000) : file;
      const path = await store.uploadFile(blob, file.name);
      sheetFiles.push({ nome: file.name, path, tipo: file.type });
      const el = $('#filesList'); if (el) el.innerHTML = filesHtml();
    } catch (e) { toast(e.userMsg || 'Caricamento non riuscito'); }
  }
  toast('Allegati caricati');
}
async function openFile(path) {
  const w = window.open('', '_blank');
  const u = await store.fileUrl(path);
  if (!u) { w && w.close(); toast('File non disponibile'); return; }
  if (w) w.location.href = u; else location.href = u;
}

/* lavoro */
/* posa: giornata a pezzo (voci del listino) o a ore */
const GRUPPI_NON_PEZZI = ['Smontaggio, scarico, tiro al piano e tariffa oraria', 'Assistenza e manutenzione'];
/** Pezzi posati: tutte le voci di posa al pezzo (esclusi smontaggi, scarico, assistenza). */
function contaPezzi(righe) {
  const voci = LIST().voci;
  return sum((righe || []).filter(r => {
    if (r.unita !== 'pz') return false;
    const v = voci.find(x => x.id === r.voce);
    return v ? !GRUPPI_NON_PEZZI.includes(v.gruppo) : false;
  }), r => r.qta);
}
/** Descrizione della giornata creata dalle voci. */
function riepilogoVoci(righe) {
  return (righe || []).map(r => {
    const extra = [r.blindato && 'blindato', r.luce && 'in luce'].filter(Boolean).join(', ');
    const nome = r.descr + (extra ? ` (${extra})` : '');
    return r.unita === 'corpo' ? nome : r.unita === 'ora' ? `${num(r.qta, 2)} ore ${nome.toLowerCase()}` : `${num(r.qta, 2)} × ${nome}`;
  }).join(', ');
}
const euroKm = () => { const v = LIST().euroKm; return v === undefined || v === null || v === '' ? 1 : n2(v); };
function separaKm(righe) { const r = righe || []; const k = r.find(x => x.voce === 'km'); return { km: k ? n2(k.kmGiorno ?? k.qta) : '', kmTot: k ? n2(k.qta) : 0, euro: k ? n2(k.prezzo) : euroKm(), altre: r.filter(x => x.voce !== 'km') }; }
/** Giorni di lavoro di una posa (dal giorno di inizio a quello di fine; sabato e domenica in mezzo si saltano se richiesto). */
function giorniPosa(l) {
  const da = l.data, a = l.dataFine && l.dataFine > l.data ? l.dataFine : l.data;
  if (!da) return [];
  const out = [];
  for (let d = pd(da); iso(d) <= a && out.length < 366; d.setDate(d.getDate() + 1)) {
    const k = iso(d), dow = d.getDay();
    if (l.soloFeriali !== false && !IMP().giornata.giorni.includes(dow) && k !== da && k !== a) continue;
    out.push(k);
  }
  return out;
}
const inPosa = (l, k) => k >= l.data && k <= (l.dataFine || l.data) && giorniPosa(l).includes(k);
function giorniForm() {
  const da = $('#f_data')?.value, a = $('#f_dataFine')?.value;
  return giorniPosa({ data: da, dataFine: a, soloFeriali: $('#f_soloFeriali') ? $('#f_soloFeriali').checked : true }).length || 1;
}
function aggiornaGiorni() {
  const info = $('#giorniInfo'); if (!info) return;
  const a = $('#f_dataFine').value, da = $('#f_data').value, g = giorniForm();
  $('#wrapFeriali').hidden = !(a && a > da);
  info.textContent = a && a < da ? 'La data di fine è prima di quella di inizio' : a && a > da ? `${g} giorni di lavoro` : 'Un solo giorno';
  info.classList.toggle('err', !!(a && a < da));
  const lk = $('#f_km')?.closest('label')?.querySelector('span'); if (lk) lk.textContent = g > 1 ? 'Km al giorno' : 'Trasferta km';
  const lo = $('#f_ore')?.closest('label')?.querySelector('span'); if (lo) lo.textContent = g > 1 ? 'Ore impiegate (totali)' : 'Ore impiegate';
  const fo = $('#f_ore'); if (fo && fo.dataset.auto === '1' && a >= da) fo.value = Math.round(oreGiornata(IMP().giornata) * g * 100) / 100;
}
const rigaKm = (km, euro) => ({ voce: 'km', descr: 'Trasferta', unita: 'km', qta: km, prezzo: euro, magg: '' });
const conKm = (righe, fd) => { const km = n2(fd.get('km')); return km > 0 ? [...righe, rigaKm(km, n2(fd.get('euroKm')))] : righe; };
const kmBox = (km, euro) => `<div class="g2">${F('Trasferta km', inp('km', km, 'number', 'placeholder="0"'))}${F('€ al km', inp('euroKm', euro, 'number'))}</div>`;
const tariffaOraria = () => n2((LIST().voci.find(v => v.id === 'ora') || {}).prezzo) || 30;
function calcoloDi(l) {
  if (l.calcolo) return l.calcolo;
  const r = l.righe || [];
  return r.length && r.every(x => x.unita === 'ora') ? 'ore' : 'pezzo';
}

function sheetLav(l, prefill) {
  const isNew = !l; l = l || { data: UI.day, amm: 'da_cons', calcolo: 'pezzo', ...(prefill || {}) };
  sheetFiles = [...(l.allegati || [])];
  const calcolo = calcoloDi({ ...l, righe: separaKm(l.righe).altre });
  const KM = separaKm(l.righe);
  const righeOre = calcolo === 'ore' ? KM.altre : [];
  const tariffa = righeOre[0] ? n2(righeOre[0].prezzo) : tariffaOraria();
  const notaVecchia = !l.note && !(l.righe || []).length && l.installato ? l.installato : '';
  openSheet(isNew ? 'Nuova posa' : 'Posa', `
    ${l.preventivoId && isNew ? `<div class="notice small">Dal preventivo accettato: scegli la data e salva.</div>` : ''}
    ${campoCliente('cliente', 'Cliente', l.cliente, 'placeholder="Nome o impresa"')}
    <div class="cliline small" id="cliInfo"></div>
    <div class="g2">${F('Dal giorno', inp('data', l.data, 'date', 'required'))}${F('Al giorno', inp('dataFine', l.dataFine, 'date'))}</div>
    <div class="row between small"><span class="muted" id="giorniInfo"></span><label class="check small" id="wrapFeriali" hidden><input type="checkbox" id="f_soloFeriali" name="soloFeriali" ${l.soloFeriali !== false ? 'checked' : ''}> Salta i giorni non lavorativi</label></div>
    ${F('Indirizzo cantiere', inp('indirizzo', l.indirizzo, 'text', 'placeholder="Via, civico, comune"'))}
    ${l.clienteFinale ? `<div class="small muted">Cliente finale: <b>${esc(l.clienteFinale)}</b></div>` : ''}
    ${campoSquadra(l)}
    ${F('Calcolo della giornata', sel('calcolo', [['pezzo', 'A pezzo · voci del listino'], ['ore', 'A ore · tariffa oraria']], calcolo))}
    <div class="g3">
      ${F('Ore impiegate', inp('ore', l.ore, 'number'))}
      <label class="f" id="wrapPezzi" ${calcolo === 'ore' ? 'hidden' : ''}><span>Pezzi posati</span>${inp('pezzi', l.pezzi, 'number')}</label>
      <label class="f" id="wrapTariffa" ${calcolo === 'ore' ? '' : 'hidden'}><span>Tariffa €/ora</span>${inp('tariffa', tariffa, 'number')}</label>
      ${F('Importo €', inp('importo', l.importo, 'number'))}
    </div>
    ${impHint()}
    ${kmBox(KM.km, KM.euro)}
    <label class="check urgcheck"><input type="checkbox" id="f_urgApp" name="urgApp" ${l.urgenzaApplicata ? 'checked' : ''}> Posa urgente: maggiorazione urgenza ${num(LIST().urgenzaPct)}%</label>
    <div id="modoPezzo" ${calcolo === 'ore' ? 'hidden' : ''}>${righeBox(calcolo === 'ore' ? [] : KM.altre, 'lav')}</div>
    <div class="notice small" id="modoOre" ${calcolo === 'ore' ? '' : 'hidden'}>Importo = ore impiegate × tariffa oraria (+ urgenza) + trasferta.</div>
    ${matBox(l.materiali)}
    <div class="g2">${F('Situazione', sel('amm', AMM.map(a => [a[0], a[1]]), l.amm || 'da_cons'))}${F('Note', inp('note', l.note || notaVecchia))}</div>
    <div class="fieldset"><span class="fs-t">Cartella</span>
      <div class="g2">${F('Cartella di lavoro', sel('cartellaId', [['', 'Nessuna'], ...S.cartelle.map(c => [c.id, c.nome])], l.cartellaId || ''))}${F('Link cartella del cantiere', inp('cartellaUrl', l.cartellaUrl, 'url', 'placeholder="https://www.icloud.com/…"'))}</div>
    </div>
    ${filesBox()}
  `, async fd => {
    const mats = readMats(fd);
    const modo = fd.get('calcolo');
    const ore = n2(fd.get('ore'));
    let righe, installato, pezzi;
    if (modo === 'ore') {
      righe = ore ? [{ voce: 'ora', descr: 'Tariffa oraria', unita: 'ora', qta: ore, prezzo: n2(fd.get('tariffa')), magg: '' }] : [];
      installato = ore ? `Giornata a ore: ${num(ore, 2)} ore` : 'Giornata a ore';
      pezzi = 0;
    } else {
      righe = leggiRighe();
      installato = riepilogoVoci(righe);
      pezzi = n2(fd.get('pezzi'));
    }
    const dataFine = fd.get('dataFine') && fd.get('dataFine') > fd.get('data') ? fd.get('dataFine') : '';
    if (fd.get('dataFine') && fd.get('dataFine') < fd.get('data')) throw Object.assign(new Error('date'), { userMsg: 'La data di fine è prima di quella di inizio' });
    const soloFeriali = !!fd.get('soloFeriali') || !dataFine;
    const gg = giorniPosa({ data: fd.get('data'), dataFine, soloFeriali }).length || 1;
    const kmG = n2(fd.get('km'));
    if (kmG > 0) righe = [...righe, { ...rigaKm(kmG * gg, n2(fd.get('euroKm'))), descr: gg > 1 ? `Trasferta (${gg} giorni × ${num(kmG, 1)} km)` : 'Trasferta', kmGiorno: kmG, giorni: gg }];
    if (gg > 1) installato = [installato, `${gg} giorni`].filter(Boolean).join(', ');
    if (kmG > 0) installato = [installato, `trasferta ${num(kmG * gg, 1)} km`].filter(Boolean).join(', ');
    const d = { data: fd.get('data'), dataFine, soloFeriali, urgenzaApplicata: !!fd.get('urgApp'), urgenzaPct: LIST().urgenzaPct, cliente: fd.get('cliente').trim(), indirizzo: fd.get('indirizzo').trim(), calcolo: modo, installato, pezzi, ore, importo: n2(fd.get('importo')), righe, materiali: mats, amm: fd.get('amm'), note: fd.get('note').trim(), cartellaId: fd.get('cartellaId') || '', cartellaUrl: fd.get('cartellaUrl').trim(), allegati: sheetFiles };
    if (l.preventivoId) d.preventivoId = l.preventivoId;
    if (l.esempio) d.esempio = true;
    if (!isNew) moveStock(l.materiali, +1);
    moveStock(mats, -1);
    d.clienteId = assicuraCliente(d.cliente);
    conSquadra('lavori', isNew ? null : l.id, d, fd);
    const id = store.put('lavori', isNew ? null : l.id, d);
    if (isNew && d.preventivoId) {
      const p = S.preventivi.find(x => x.id === d.preventivoId);
      if (p) store.put('preventivi', p.id, { ...stripId(p), stato: 'accettato', lavoroId: id });
    }
    UI.day = d.data; UI.month = d.data.slice(0, 7);
    const inFerie = S.eventi.some(e => e.tipo === 'ferie' && giorniPosa(d).some(g => inEv(e, g)));
    toast(inFerie ? 'Posa salvata. Attenzione: in quei giorni hai segnato ferie' : 'Posa salvata');
  }, {
    del: isNew ? null : async () => { moveStock(l.materiali, +1); for (const f of l.allegati || []) store.removeFile(f.path).catch(() => {}); store.drop('lavori', l.id); toast('Posa eliminata'); },
    extra: isNew ? '' : `<button type="button" class="btn" data-act="cons" data-arg="lavori" data-id="${l.id}">Consuntivo</button><button type="button" class="btn" data-act="modDa" data-arg="lavori" data-id="${l.id}">Modulo</button>`,
  });
  if (isNew && IMP().giornata.precompila && !n2(l.ore)) { const fo = $('#f_ore'); fo.dataset.auto = '1'; fo.value = oreGiornata(IMP().giornata); }
  aggiornaGiorni();
  const pz = $('#f_pezzi');
  if (pz) pz.dataset.auto = !n2(l.pezzi) || Math.abs(n2(l.pezzi) - contaPezzi(l.righe)) < 0.01 ? '1' : '0';
  const imp = $('#f_importo');
  if (calcolo === 'ore') { imp.dataset.auto = !n2(l.importo) || Math.abs(n2(l.importo) - n2(l.ore) * tariffa * (l.urgenzaApplicata ? 1 + n2(l.urgenzaPct ?? LIST().urgenzaPct) / 100 : 1) - n2(KM.kmTot) * KM.euro) < 0.01 ? '1' : '0'; aggiornaTotali(); }
  else initImporto('#f_importo', l.righe, l.importo, !!l.urgenzaApplicata);
}
function cambiaCalcolo(modo) {
  const ore = modo === 'ore';
  $('#modoPezzo').hidden = ore; $('#modoOre').hidden = !ore;
  $('#wrapPezzi').hidden = ore; $('#wrapTariffa').hidden = !ore;
  $('#f_importo').dataset.auto = '1';
  aggiornaTotali();
  if (ore && !n2($('#f_ore').value)) $('#f_ore').focus();
}

/* intervento */
function sheetInt(i, day) {
  const isNew = !i; i = i || { data: TODAY, dataProg: day || '', stato: day ? 'programmato' : 'aperto', urgenza: 'normale', amm: 'da_cons' };
  sheetFiles = [...(i.allegati || [])];
  openSheet(isNew ? 'Nuovo intervento' : 'Intervento', `
    ${campoCliente('cliente', 'Cliente', i.cliente)}
    <div class="cliline small" id="cliInfo"></div>
    ${F('Telefono', inp('telefono', i.telefono, 'tel'))}
    ${F('Indirizzo', inp('indirizzo', i.indirizzo))}
    ${campoSquadra(i)}
    ${F('Problema / lavoro da fare', `<textarea id="f_descrizione" name="descrizione" placeholder="Es. regolazione anta che non chiude, sostituzione guarnizione">${esc(i.descrizione || '')}</textarea>`)}
    <div class="g2">${F('Urgenza', sel('urgenza', URG.map(u => [u[0], u[1]]), i.urgenza || 'normale'))}${F('Stato', sel('stato', STATI.map(s => [s[0], s[1]]), i.stato || 'aperto'))}</div>
    <div class="g2">${F('Data richiesta', inp('data', i.data, 'date'))}${F('Data intervento', inp('dataProg', i.dataProg, 'date'))}</div>
    <div class="g2">${F('Costo al cliente €', inp('costo', i.costo, 'number'))}${F('Ore', inp('ore', i.ore, 'number'))}</div>
    ${impHint()}
    ${kmBox(separaKm(i.righe).km, separaKm(i.righe).euro)}
    ${righeBox(separaKm(i.righe).altre, 'int', { urgenza: i.urgenzaApplicata ?? (i.urgenza && i.urgenza !== 'normale') })}
    ${matBox(i.materiali)}
    ${F('Situazione', sel('amm', AMM.map(a => [a[0], a[1]]), i.amm || 'da_cons'))}
    ${filesBox()}
  `, async fd => {
    const mats = readMats(fd);
    const d = { cliente: fd.get('cliente').trim(), telefono: fd.get('telefono').trim(), indirizzo: fd.get('indirizzo').trim(), descrizione: fd.get('descrizione').trim(), urgenza: fd.get('urgenza'), stato: fd.get('stato'), data: fd.get('data') || TODAY, dataProg: fd.get('dataProg'), costo: n2(fd.get('costo')), ore: n2(fd.get('ore')), righe: conKm(leggiRighe(), fd), urgenzaApplicata: !!fd.get('urgApp'), urgenzaPct: LIST().urgenzaPct, materiali: mats, amm: fd.get('amm'), allegati: sheetFiles };
    if (d.dataProg && d.stato === 'aperto') d.stato = 'programmato';
    if (i.esempio) d.esempio = true;
    if (!isNew) moveStock(i.materiali, +1);
    moveStock(mats, -1);
    d.clienteId = assicuraCliente(d.cliente, { telefono: d.telefono });
    conSquadra('interventi', isNew ? null : i.id, d, fd);
    store.put('interventi', isNew ? null : i.id, d);
    toast('Intervento salvato');
  }, {
    del: isNew ? null : async () => { moveStock(i.materiali, +1); for (const f of i.allegati || []) store.removeFile(f.path).catch(() => {}); store.drop('interventi', i.id); toast('Intervento eliminato'); },
    extra: isNew ? '' : `${i.stato === 'completato' ? `<button type="button" class="btn" data-act="cons" data-arg="interventi" data-id="${i.id}">Consuntivo</button>` : ''}<button type="button" class="btn" data-act="modDa" data-arg="interventi" data-id="${i.id}">Modulo</button>`,
  });
  if (!isNew || i.urgenzaApplicata !== undefined) { const u = $('#f_urgApp'); if (u) u.dataset.touched = '1'; }
  initImporto('#f_costo', i.righe, i.costo, i.urgenzaApplicata ?? (i.urgenza && i.urgenza !== 'normale'));
}

/* consuntivo */
function sheetCons(kind, id) {
  const x = S[kind].find(r => r.id === id); if (!x) return;
  const L = kind === 'lavori';
  const lis = LIST();
  const doc = docDaLavoro(x, kind, AZ());
  const t = totali(doc, lis);
  const mats = (x.materiali || []).filter(m => m.nome);
  const um = r => r.unita === 'ora' ? 'ore' : r.unita === 'corpo' ? '' : r.unita === 'km' ? 'km' : 'pz';
  const txt = `CONSUNTIVO ${L ? 'POSA IN OPERA' : 'INTERVENTO'}
Cliente: ${x.cliente || ''}
Data: ${fmtD(doc.data, { day: '2-digit', month: '2-digit', year: 'numeric' })}
Cantiere: ${x.indirizzo || '—'}

Lavori eseguiti:
${(L ? x.installato : x.descrizione) || '—'}${L && n2(x.pezzi) ? `\nPezzi posati: ${num(x.pezzi, 0)}` : ''}
Ore impiegate: ${n2(x.ore) ? num(x.ore) : '—'}
${doc.righe.length ? `\nDettaglio:\n${doc.righe.map(r => `- ${r.descr}: ${r.prezzo === '' ? 'da concordare' : `${num(r.qta, 2)} ${um(r)} × ${eur(prezzoUnitario(r, lis))} = ${eur(totaleRiga(r, lis))}`}`.replace(/  +/g, ' ')).join('\n')}\n` : ''}${t.urgenzaPct ? `Maggiorazione urgenza ${num(t.urgenzaPct)}%: ${eur(t.urgenza)}\n` : ''}${mats.length ? `\nMateriale di consumo utilizzato:\n${mats.map(m => `- ${m.nome}: ${num(m.qta)} ${S.magazzino.find(s => s.id === slug(m.nome))?.unita || ''}`).join('\n')}\n` : ''}
Totale: ${eur(t.imponibile)} + IVA se dovuta`;
  openSheet('Consuntivo', `<div class="small muted">Mandalo al cliente o all'impresa come testo (WhatsApp, email) o come PDF, poi segnalo come inviato. Da qui si passa alla fattura.</div>
    <pre class="cons" id="consTxt">${esc(txt)}</pre>
    ${F('IVA nel PDF', sel('iva', IVA.map(i => [i[0], i[1]]), String(x.iva ?? AZ().ivaPredefinita)))}`,
    async fd => { store.put(kind, id, { ...stripId(x), iva: fd.get('iva'), amm: 'cons' }); toast('Consuntivo segnato come inviato'); },
    { saveLabel: 'Segna inviato', extra: `<button type="button" class="btn dark" data-act="consPdf" data-arg="${kind}" data-id="${id}">PDF</button><button type="button" class="btn" data-act="copy">Copia</button>${navigator.share ? '<button type="button" class="btn" data-act="share">Condividi</button>' : ''}` });
}
const stripId = o => { const { id, ...r } = o; return r; };

/* movimento */
function sheetMov(m, prefill) {
  const isNew = !m; m = m || { tipo: 'uscita', data: TODAY, categoria: 'materiale', magazzino: true, ...(prefill || {}) };
  openSheet(isNew ? 'Nuova spesa' : 'Spesa', `
    ${m._preview ? `<img class="receipt" src="${m._preview}" alt="Foto dello scontrino">` : m.foto ? `<button type="button" data-act="openPath" data-arg="${esc(m.foto)}" style="border:0;background:none;padding:0"><img class="receipt" data-file="${esc(m.foto)}" alt="Foto dello scontrino"></button>` : ''}
    ${m._letto ? `<div class="notice small">Ho letto lo scontrino in automatico. <b>Controlla importo, data e materiali</b> prima di salvare: la lettura può sbagliare.</div>` : ''}
    <div class="g2">${F('Tipo', sel('tipo', [['uscita', 'Spesa'], ['entrata', 'Entrata']], m.tipo))}${F('Data', inp('data', m.data, 'date', 'required'))}</div>
    <div class="g2">${F('Categoria', sel('categoria', CAT, m.categoria))}${F('Importo totale €', inp('importo', m.importo, 'number', 'required'))}</div>
    <div class="g2">${F('Fornitore', inp('fornitore', m.fornitore))}${F('N. documento', inp('numero', m.numero))}</div>
    ${F('Descrizione', inp('descrizione', m.descrizione))}
    <div id="buyBox" ${m.categoria === 'materiale' ? '' : 'hidden'}>
      ${matBox(m.righe, true, 'Materiale acquistato')}
      <label class="check" style="margin-top:8px"><input type="checkbox" id="f_magazzino" name="magazzino" ${m.magazzino !== false ? 'checked' : ''}> Carica questo materiale in magazzino</label>
    </div>`, async fd => {
    const cat = fd.get('categoria');
    const righe = cat === 'materiale' ? readMats(fd, true) : [];
    const mag = cat === 'materiale' && !!fd.get('magazzino') && righe.length > 0;
    const d = { tipo: fd.get('tipo'), data: fd.get('data'), categoria: cat, importo: n2(fd.get('importo')), fornitore: fd.get('fornitore').trim(), numero: fd.get('numero').trim(), descrizione: fd.get('descrizione').trim(), righe, magazzino: mag };
    if (m.foto) d.foto = m.foto;
    if (m.esempio) d.esempio = true;
    if (!isNew && m.magazzino) moveStock(m.righe, -1);
    if (mag) moveStock(righe, +1, true);
    store.put('movimenti', isNew ? null : m.id, d);
    UI.cMonth = d.data.slice(0, 7);
    toast(mag ? 'Spesa salvata e magazzino aggiornato' : 'Spesa salvata');
  }, { del: isNew ? null : async () => { if (m.magazzino) moveStock(m.righe, -1); if (m.foto) store.removeFile(m.foto).catch(() => {}); store.drop('movimenti', m.id); toast('Spesa eliminata'); } });
}

/* ---------- voci e prezzi dal listino ---------- */
const UNITA_OPT = [['pz', 'pezzo'], ['ora', 'ore'], ['corpo', 'corpo']];
function opzioniListino() {
  const L = LIST(); const gruppi = [...new Set(L.voci.map(v => v.gruppo))];
  return gruppi.map(g => `<optgroup label="${esc(g)}">${L.voci.filter(v => v.gruppo === g).map(v => `<option value="${esc(v.id)}">${esc(v.nome)}${v.variante ? ' – ' + esc(v.variante) : ''} · ${v.prezzo == null ? 'da concordare' : eur(v.prezzo) + (v.unita === 'ora' ? '/ora' : v.unita === 'pz' ? '/pz' : '')}</option>`).join('')}</optgroup>`).join('');
}
function rigaHtml(r) {
  const L = LIST();
  return `<div class="riga" data-voce="${esc(r.voce || '')}" data-magg="${esc(r.magg || '')}">
    <div class="riga-top"><input name="rd" value="${esc(r.descr || '')}" placeholder="Descrizione della voce" aria-label="Descrizione"><button type="button" data-act="rmRiga" aria-label="Togli voce">×</button></div>
    <div class="riga-num">
      <label class="f"><span>Q.tà</span><input name="rq" type="number" step="any" inputmode="decimal" value="${esc(r.qta ?? 1)}"></label>
      <label class="f"><span>Tipo</span><select name="ru">${UNITA_OPT.map(([k, l]) => `<option value="${k}" ${k === (r.unita || 'pz') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f"><span>€ cad.</span><input name="rp" type="number" step="any" inputmode="decimal" value="${esc(r.prezzo ?? '')}" placeholder="${r.daConcordare ? 'concordare' : ''}"></label>
      <span class="riga-tot price"></span>
    </div>
    ${r.magg === 'blindato' ? `<label class="check small"><input type="checkbox" name="rb" ${r.blindato ? 'checked' : ''}> Prodotto blindato (+${eur(L.maggBlindato)}/pz)</label>` : ''}
    ${r.magg === 'luce' ? `<label class="check small"><input type="checkbox" name="rl" ${r.luce ? 'checked' : ''}> Posa in luce (+${eur(L.maggLuce)}/pz)</label>` : ''}
  </div>`;
}
function righeBox(righe, kind, { urgenza = false, iva = null } = {}) {
  const L = LIST();
  return `<div class="fieldset" id="righeBox" data-kind="${kind}">
    <span class="fs-t">Voci e prezzi dal listino</span>
    <div class="righe" id="righe">${(righe || []).map(rigaHtml).join('')}</div>
    <div class="row"><select id="addVoce" class="btn sm addvoce" aria-label="Aggiungi voce dal listino"><option value="">+ Aggiungi dal listino…</option>${opzioniListino()}</select><button type="button" class="btn sm" data-act="addLibera">+ Voce libera</button></div>
    ${kind !== 'lav' ? `<label class="check"><input type="checkbox" id="f_urgApp" name="urgApp" ${urgenza ? 'checked' : ''}> Maggiorazione urgenza ${num(L.urgenzaPct)}%</label>` : ''}
    ${kind === 'prev' ? F('IVA', sel('iva', IVA.map(i => [i[0], i[1]]), String(iva ?? AZ().ivaPredefinita))) : ''}
    <div class="totbox" id="totBox"></div>
  </div>`;
}
const impHint = () => `<div class="small" id="impHint" hidden>Importo scritto a mano. Dal listino sarebbe <b></b>. <button class="linkbtn" data-act="ricalcola" type="button">Usa il prezzo del listino</button></div>`;
function leggiRighe() {
  const L = LIST();
  return [...document.querySelectorAll('#righe .riga')].map(el => {
    const q = n => el.querySelector(`[name="${n}"]`);
    const p = q('rp').value.trim();
    const r = { voce: el.dataset.voce || '', descr: q('rd').value.trim(), unita: q('ru').value, qta: n2(q('rq').value), prezzo: p === '' ? '' : n2(p), magg: el.dataset.magg || '', blindato: !!q('rb')?.checked, luce: !!q('rl')?.checked };
    if (r.blindato) r.maggBlindato = L.maggBlindato;
    if (r.luce) r.maggLuce = L.maggLuce;
    return r;
  }).filter(r => r.descr || r.prezzo !== '');
}
function aggiornaTotali() {
  const box = $('#righeBox'); if (!box) return;
  const kind = box.dataset.kind, L = LIST();
  document.querySelectorAll('#righe .riga').forEach(el => {
    const q = n => el.querySelector(`[name="${n}"]`);
    const r = { unita: q('ru').value, qta: n2(q('rq').value), prezzo: q('rp').value.trim(), blindato: !!q('rb')?.checked, luce: !!q('rl')?.checked };
    const sp = el.querySelectorAll('.riga-num .f > span');
    sp[0].textContent = r.unita === 'ora' ? 'Ore' : 'Q.tà';
    sp[2].textContent = r.unita === 'ora' ? '€ / ora' : r.unita === 'corpo' ? '€ a corpo' : '€ cad.';
    el.querySelector('.riga-tot').textContent = r.prezzo === '' ? '—' : eur(totaleRiga(r, L));
  });
  const righe = leggiRighe();
  const kmP = kind === 'prev' ? n2($('#f_km')?.value) : 0, ekmP = n2($('#f_euroKm')?.value);
  const t = totali({ righe: kmP > 0 ? [...righe, rigaKm(kmP, ekmP)] : righe, urgenza: !!$('#f_urgApp')?.checked, iva: kind === 'prev' ? $('#f_iva').value : 'no' }, L);
  let h = '';
  if (kmP > 0) h += `<div class="tl"><span>Trasferta ${num(kmP, 1)} km × ${eur(ekmP)}</span><span class="price">${eur(kmP * ekmP)}</span></div>`;
  if (t.urgenzaPct) h += `<div class="tl"><span>Totale voci</span><span class="price">${eur(t.imponibileRighe)}</span></div><div class="tl"><span>Urgenza ${num(t.urgenzaPct)}%</span><span class="price">+${eur(t.urgenza)}</span></div>`;
  if (kind === 'prev' && t.ivaPct > 0) h += `<div class="tl"><span>Imponibile</span><span class="price">${eur(t.imponibile)}</span></div><div class="tl"><span>${esc(t.ivaLabel)}</span><span class="price">${eur(t.iva)}</span></div>`;
  h += `<div class="tl big"><span>${kind === 'prev' ? (t.ivaPct > 0 ? 'Totale IVA compresa' : 'Totale') : 'Totale (IVA esclusa)'}</span><span class="price">${eur(kind === 'prev' ? t.totale : t.imponibile)}</span></div>`;
  $('#totBox').innerHTML = righe.length || kmP > 0 ? h : '<div class="small muted">Scegli le voci dal listino: il prezzo si calcola da solo, al pezzo o a ore.</div>';
  const imp = kind === 'lav' ? $('#f_importo') : kind === 'int' ? $('#f_costo') : null;
  const gg = kind === 'lav' ? giorniForm() : 1;
  const trasf = Math.round(n2($('#f_km')?.value) * n2($('#f_euroKm')?.value) * gg * 100) / 100;
  let target = t.imponibile + trasf, conVoci = righe.length > 0 || trasf > 0;
  if (kind !== 'prev' && trasf > 0) {
    $('#totBox').innerHTML = (righe.length ? h.replace('Totale (IVA esclusa)', t.urgenzaPct ? 'Voci con urgenza' : 'Totale voci') : '') + `<div class="tl"><span>Trasferta ${num(n2($('#f_km').value), 1)} km${gg > 1 ? ` × ${gg} giorni` : ''} × ${eur(n2($('#f_euroKm').value))}</span><span class="price">${eur(trasf)}</span></div><div class="tl big"><span>Totale (IVA esclusa)</span><span class="price">${eur(target)}</span></div>`;
  }
  if (kind === 'lav' && $('#f_calcolo')?.value === 'ore') {
    const urgK = $('#f_urgApp')?.checked ? 1 + n2(LIST().urgenzaPct) / 100 : 1;
    target = Math.round((n2($('#f_ore')?.value) * n2($('#f_tariffa')?.value) * urgK + trasf) * 100) / 100; conVoci = target > 0;
  } else if (kind === 'lav') {
    const pz = $('#f_pezzi'); if (pz && pz.dataset.auto !== '0') pz.value = contaPezzi(righe) || '';
    if (righe.length) $('#totBox').insertAdjacentHTML('beforeend', `<div class="small muted">Nel calendario: ${esc(riepilogoVoci(righe))}</div>`);
  }
  if (imp && conVoci && imp.dataset.auto !== '0') imp.value = target || '';
  const hint = $('#impHint');
  if (hint) { hint.hidden = !(imp && conVoci && imp.dataset.auto === '0' && Math.abs(n2(imp.value) - target) > 0.009); hint.querySelector('b').textContent = eur(target); }
}
function initImporto(selector, righe, valore, urgenza = false) {
  const imp = $(selector); if (!imp) return;
  const t = totali({ righe: righe || [], urgenza }, LIST()).imponibile;
  imp.dataset.auto = !(righe || []).length || !n2(valore) || Math.abs(n2(valore) - t) < 0.01 ? '1' : '0';
  aggiornaTotali();
}
function aggiungiVoce(id) {
  const v = LIST().voci.find(x => x.id === id); if (!v) return;
  const ore = n2($('#f_ore')?.value);
  const r = rigaDaVoce(v, v.unita === 'ora' && ore ? ore : 1);
  $('#righe').insertAdjacentHTML('beforeend', rigaHtml(r));
  aggiornaTotali();
  const el = $('#righe').lastElementChild;
  (r.daConcordare ? el.querySelector('[name="rp"]') : el.querySelector('[name="rq"]')).focus();
}

/* ---------- preventivi ---------- */
const STATI_PREV = [['bozza', 'Bozza', ''], ['inviato', 'Inviato', 'warn'], ['accettato', 'Accettato', 'ok'], ['rifiutato', 'Rifiutato', 'bad']];
const statoPrev = k => STATI_PREV.find(s => s[0] === (k || 'bozza')) || STATI_PREV[0];
const totPrev = p => totali(p, LIST());
function prevCard(p) {
  const t = totPrev(p), st = statoPrev(p.stato);
  const attesa = p.stato === 'inviato' ? -daysTo(p.dataInvio || p.data) : 0;
  return `<div class="card" role="button" tabindex="0" data-act="editPrev" data-id="${p.id}">
    <div class="row between"><span class="t">${esc(p.cliente?.nome || 'Cliente')}</span><span class="price">${eur(t.totale)}</span></div>
    ${p.oggetto ? `<div>${esc(p.oggetto)}</div>` : ''}
    <div class="meta"><span class="num">N. ${esc(p.numero || '')}</span><span>${fmtD(p.data, { day: 'numeric', month: 'short' })}</span><span class="chip ${st[2]}">${st[1]}</span>${attesa >= 7 ? `<span class="chip warn">senza risposta da ${attesa} gg</span>` : ''}${p.lavoroId ? '<span class="chip in">in calendario</span>' : ''}</div>
  </div>`;
}
function rPrev() {
  const FL = [['aperti', 'Aperti'], ['accettati', 'Accettati'], ['rifiutati', 'Rifiutati'], ['tutti', 'Tutti']];
  const aperto = p => ['bozza', 'inviato'].includes(p.stato || 'bozza');
  const L = S.preventivi.filter(p => UI.prevFilter === 'tutti' || (UI.prevFilter === 'aperti' && aperto(p)) || (UI.prevFilter === 'accettati' && p.stato === 'accettato') || (UI.prevFilter === 'rifiutati' && p.stato === 'rifiutato'))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.numero).localeCompare(String(a.numero)));
  const anno = TODAY.slice(0, 4);
  const chiusi = S.preventivi.filter(p => ['accettato', 'rifiutato'].includes(p.stato));
  const acc = S.preventivi.filter(p => p.stato === 'accettato');
  return `<div class="row between"><h2>Preventivi</h2><button class="btn primary" data-act="newPrev" type="button">${svg('plus')} Nuovo</button></div>
  <div class="kpis"><div class="kpi"><div class="l">Da inviare</div><div class="v">${S.preventivi.filter(p => (p.stato || 'bozza') === 'bozza').length}</div></div><div class="kpi"><div class="l">In attesa</div><div class="v">${S.preventivi.filter(p => p.stato === 'inviato').length}</div></div><div class="kpi"><div class="l">Accettati ${anno}</div><div class="v">${eur(sum(acc.filter(p => (p.data || '').startsWith(anno)), p => totPrev(p).imponibile))}</div></div><div class="kpi"><div class="l">Tasso accettazione</div><div class="v">${chiusi.length ? Math.round(acc.length / chiusi.length * 100) + '%' : '—'}</div></div></div>
  <div class="seg" role="group" aria-label="Filtro">${FL.map(([k, l]) => `<button data-act="prevF" data-arg="${k}" aria-pressed="${UI.prevFilter === k}" type="button">${l}</button>`).join('')}</div>
  <div class="stack">${L.map(prevCard).join('') || `<div class="empty"><b>${S.preventivi.length ? 'Nessun preventivo in questa lista.' : 'Nessun preventivo ancora.'}</b><span class="small">Scegli le voci dal listino, il totale si calcola da solo e il PDF con termini, condizioni e firma è pronto da mandare.</span><button class="btn primary" data-act="newPrev" type="button">${svg('plus')} Crea un preventivo</button></div>`}</div>`;
}
let prevCtx = null;
function sheetPrev(p) {
  const isNew = !p || !p.id, az = AZ();
  p = p || { numero: prossimoNumero(S.preventivi, TODAY.slice(0, 4)), data: TODAY, stato: 'bozza', validita: +az.validitaGiorni || 30, cliente: { tipo: 'finale' }, righe: [], iva: az.ivaPredefinita, condizioni: true };
  prevCtx = { p, isNew };
  const c = p.cliente || {};
  openSheet(isNew ? 'Nuovo preventivo' : `Preventivo ${p.numero || ''}`, `
    <div class="g3">${F('Numero', inp('numero', p.numero, 'text', 'required'))}${F('Data', inp('data', p.data, 'date', 'required'))}${F('Validità giorni', inp('validita', p.validita, 'number'))}</div>
    ${F('Stato', sel('stato', STATI_PREV.map(s => [s[0], s[1]]), p.stato || 'bozza'))}
    <div class="fieldset"><span class="fs-t">Cliente</span>
      ${campoCliente('cnome', 'Nome o ragione sociale', c.nome)}
      <div class="g2">${F('Tipo di cliente', sel('ctipo', [['finale', 'Cliente finale'], ['rivenditore', 'Rivenditore'], ['impresa', 'Impresa edile']], c.tipo || 'finale'))}</div>
      <div class="cliline small" id="cliInfo"></div>
      ${F('Indirizzo', inp('cindirizzo', c.indirizzo))}
      <div class="g2">${F('P. IVA / Codice fiscale', inp('cpiva', c.piva))}${F('Telefono', inp('ctel', c.telefono, 'tel'))}</div>
      ${F('Email', inp('cemail', c.email, 'email'))}
    </div>
    ${F('Indirizzo del cantiere', inp('cantiere', p.cantiere, 'text', 'placeholder="Se diverso da quello del cliente"'))}
    ${F('Oggetto', `<textarea id="f_oggetto" name="oggetto" placeholder="Es. Posa di 6 finestre e 2 portefinestre con smontaggio dei vecchi serramenti">${esc(p.oggetto || '')}</textarea>`)}
    ${kmBox(separaKm(p.righe).km, separaKm(p.righe).euro)}
    ${righeBox(separaKm(p.righe).altre, 'prev', { urgenza: !!p.urgenza, iva: p.iva })}
    ${F('Note per il cliente', `<textarea id="f_note" name="note" placeholder="Es. Materiale di consumo compreso">${esc(p.note || '')}</textarea>`)}
    <label class="check"><input type="checkbox" id="f_condizioni" name="condizioni" ${p.condizioni !== false ? 'checked' : ''}> Allega termini e condizioni con firma per accettazione</label>
  `, async fd => { salvaPrev(fd); toast('Preventivo salvato'); }, {
    del: isNew ? null : async () => { store.drop('preventivi', p.id); toast('Preventivo eliminato'); },
    extra: `<button type="button" class="btn dark" data-act="prevPdf">PDF</button>${!isNew && p.stato === 'accettato' && !p.lavoroId ? '<button type="button" class="btn" data-act="pianifica">Metti in calendario</button>' : ''}`,
  });
  aggiornaTotali();
}
function salvaPrev(fd) {
  const { p, isNew } = prevCtx;
  const d = { ...stripId(p),
    numero: fd.get('numero').trim(), data: fd.get('data'), validita: n2(fd.get('validita')), stato: fd.get('stato'),
    cliente: { nome: fd.get('cnome').trim(), tipo: fd.get('ctipo'), indirizzo: fd.get('cindirizzo').trim(), piva: fd.get('cpiva').trim(), telefono: fd.get('ctel').trim(), email: fd.get('cemail').trim() },
    cantiere: fd.get('cantiere').trim(), oggetto: fd.get('oggetto').trim(), righe: conKm(leggiRighe(), fd),
    urgenza: !!fd.get('urgApp'), urgenzaPct: LIST().urgenzaPct, iva: fd.get('iva'), note: fd.get('note').trim(), condizioni: !!fd.get('condizioni') };
  if (d.stato !== 'bozza' && !d.dataInvio) d.dataInvio = TODAY;
  d.clienteId = assicuraCliente(d.cliente.nome, { tipo: d.cliente.tipo, indirizzo: d.cliente.indirizzo, piva: d.cliente.piva, telefono: d.cliente.telefono, email: d.cliente.email });
  const id = store.put('preventivi', isNew ? null : p.id, d);
  aggiornaRichiestaPrev(d, id);
  prevCtx = { p: { id, ...d }, isNew: false };
  return prevCtx.p;
}
/** Compila i dati del cliente da un preventivo precedente con lo stesso nome. */
function compilaCliente(nome) {
  if (compilaDaRubrica(nome)) return;
  const prec = [...S.preventivi].reverse().find(p => (p.cliente?.nome || '').toLowerCase() === nome.trim().toLowerCase());
  if (!prec) return;
  const c = prec.cliente;
  for (const [id, v] of [['f_cindirizzo', c.indirizzo], ['f_cpiva', c.piva], ['f_ctel', c.telefono], ['f_cemail', c.email]]) { const el = $('#' + id); if (el && !el.value && v) el.value = v; }
  const t = $('#f_ctipo'); if (t && c.tipo) t.value = c.tipo;
}

/* ---------- clienti (CRM) ---------- */
const TIPI_CLIENTE = [['finale', 'Cliente finale'], ['rivenditore', 'Rivenditore'], ['impresa', 'Impresa edile']];
const tipoCliente = k => (TIPI_CLIENTE.find(t => t[0] === k) || TIPI_CLIENTE[0])[1];
const normNome = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const trovaCliente = nome => normNome(nome) ? S.clienti.find(c => normNome(c.nome) === normNome(nome)) : null;
const nomeDi = x => typeof x.cliente === 'object' ? (x.cliente?.nome || '') : (x.cliente || '');
/** Restituisce l'id del cliente con quel nome; se non esiste lo crea. Completa i dati mancanti. */
function assicuraCliente(nome, extra = {}) {
  if (!normNome(nome)) return '';
  const c = trovaCliente(nome);
  const pulito = Object.fromEntries(Object.entries(extra).filter(([, v]) => v));
  if (c) {
    const mancanti = Object.fromEntries(Object.entries(pulito).filter(([k]) => !c[k]));
    if (Object.keys(mancanti).length) store.put('clienti', c.id, { ...stripId(c), ...mancanti });
    return c.id;
  }
  return store.put('clienti', null, { nome: String(nome).trim(), tipo: 'finale', creato: TODAY, ...pulito });
}
/** Tutto ciò che riguarda un cliente: collegato per id o, per i dati vecchi, per nome. */
function storicoCliente(c) {
  const mio = x => x.clienteId === c.id || (!x.clienteId && normNome(nomeDi(x)) === normNome(c.nome));
  const lav = S.lavori.filter(mio), int = S.interventi.filter(mio), prev = S.preventivi.filter(mio), mod = S.moduli.filter(mio);
  const fatt = [...lav.map(x => ({ imp: n2(x.importo), d: x.data, amm: x.amm })), ...int.filter(i => i.stato === 'completato').map(x => ({ imp: n2(x.costo), d: x.dataProg || x.data, amm: x.amm }))].filter(x => x.d && x.d <= TODAY);
  return {
    lav, int, prev, mod,
    fatturato: sum(fatt, x => x.imp),
    anno: sum(fatt.filter(x => x.d.startsWith(TODAY.slice(0, 4))), x => x.imp),
    aperto: sum(fatt.filter(x => (x.amm || 'da_cons') !== 'pag'), x => x.imp),
    ultimo: [...lav.map(x => x.data), ...int.map(x => x.dataProg || x.data), ...prev.map(x => x.data)].filter(Boolean).sort().pop() || '',
  };
}
const nomiSenzaScheda = () => [...new Set([...S.lavori, ...S.interventi, ...S.preventivi].map(nomeDi).map(n => n.trim()).filter(Boolean))].filter(n => !trovaCliente(n));
function importaClienti() {
  let n = 0;
  for (const nome of nomiSenzaScheda()) {
    const p = [...S.preventivi].reverse().find(x => normNome(nomeDi(x)) === normNome(nome));
    const i = S.interventi.find(x => normNome(nomeDi(x)) === normNome(nome) && x.telefono);
    const extra = p ? { tipo: p.cliente.tipo, indirizzo: p.cliente.indirizzo, piva: p.cliente.piva, telefono: p.cliente.telefono, email: p.cliente.email } : {};
    if (!extra.telefono && i) extra.telefono = i.telefono;
    assicuraCliente(nome, extra); n++;
  }
  // collega i lavori esistenti alle schede
  for (const [kind, arr] of [['lavori', S.lavori], ['interventi', S.interventi], ['preventivi', S.preventivi]]) {
    for (const x of arr) { if (x.clienteId) continue; const c = trovaCliente(nomeDi(x)); if (c) store.put(kind, x.id, { ...stripId(x), clienteId: c.id }); }
  }
  return n;
}
function rClienti() {
  const q = normNome(UI.cerca);
  const L = S.clienti.filter(c => (UI.cliTipo === 'tutti' || (c.tipo || 'finale') === UI.cliTipo) && (!q || [c.nome, c.referente, c.telefono, c.email, c.indirizzo].some(v => normNome(v).includes(q))))
    .map(c => ({ c, s: storicoCliente(c) }))
    .sort((a, b) => UI.cliOrd === 'nome' ? a.c.nome.localeCompare(b.c.nome) : (b.s.ultimo || '').localeCompare(a.s.ultimo || '') || a.c.nome.localeCompare(b.c.nome));
  const senza = nomiSenzaScheda();
  const FT = [['tutti', 'Tutti'], ...TIPI_CLIENTE.map(([k, l]) => [k, l.split(' ')[0] === 'Cliente' ? 'Privati' : l === 'Rivenditore' ? 'Rivenditori' : 'Imprese'])];
  return `<div class="row between"><h2>Clienti</h2><button class="btn primary" data-act="newCli" type="button">${svg('plus')} Nuovo</button></div>
  ${senza.length ? `<div class="notice row between"><span><b>${senza.length} ${senza.length === 1 ? 'cliente' : 'clienti'}</b> dei tuoi lavori ${senza.length === 1 ? 'non ha' : 'non hanno'} ancora una scheda: ${esc(senza.slice(0, 3).join(', '))}${senza.length > 3 ? '…' : ''}</span><button class="btn sm dark" data-act="importaCli" type="button">Crea le schede</button></div>` : ''}
  <label class="f"><span class="sr">Cerca</span><input id="cercaCliente" type="search" placeholder="Cerca per nome, telefono, email…" value="${esc(UI.cerca)}" autocomplete="off"></label>
  <div class="seg" role="group" aria-label="Tipo">${FT.map(([k, l]) => `<button data-act="cliTipo" data-arg="${k}" aria-pressed="${UI.cliTipo === k}" type="button">${l}</button>`).join('')}</div>
  <div class="row between small muted"><span>${S.clienti.length} in rubrica</span><button class="linkbtn" data-act="cliOrd" type="button">Ordina per ${UI.cliOrd === 'nome' ? 'ultimo lavoro' : 'nome'}</button></div>
  <div class="stack" id="listaClienti">${L.map(({ c, s }) => `<div class="card" role="button" tabindex="0" data-act="editCli" data-id="${c.id}">
      <div class="row between"><span class="t">${esc(c.nome)}</span><span class="chip ${c.tipo === 'rivenditore' ? 'in' : c.tipo === 'impresa' ? 'warn' : ''}">${tipoCliente(c.tipo)}</span></div>
      ${c.referente || c.telefono ? `<div class="addr">${esc([c.referente, c.telefono].filter(Boolean).join(' · '))}</div>` : ''}
      <div class="meta"><span><b class="num">${s.lav.length}</b> ${s.lav.length === 1 ? 'posa' : 'pose'}</span><span><b class="num">${s.int.length}</b> ${s.int.length === 1 ? 'intervento' : 'interventi'}</span><span><b class="num">${s.prev.length}</b> ${s.prev.length === 1 ? 'preventivo' : 'preventivi'}</span>${s.fatturato ? `<span>Lavorato <b>${eur(s.fatturato)}</b></span>` : ''}${s.aperto ? `<span class="chip warn">da incassare ${eur(s.aperto)}</span>` : ''}</div>
    </div>`).join('') || `<div class="empty"><b>${S.clienti.length ? 'Nessun cliente trovato.' : 'La rubrica è vuota.'}</b><span class="small">Ogni cliente che scrivi in una posa, un intervento o un preventivo finisce qui da solo, con tutto lo storico.</span></div>`}</div>`;
}
function sheetCliente(c) {
  const isNew = !c; c = c || { tipo: 'finale' };
  const s = isNew ? null : storicoCliente(c);
  const az = AZ();
  const voce = (d, tipo, testo, imp, chip, act, id) => `<div class="hist" role="button" tabindex="0" data-act="${act}" data-id="${id}"><span class="hd num">${fmtD(d, { day: '2-digit', month: '2-digit', year: '2-digit' })}</span><span class="hm"><b>${tipo}</b>${testo ? ' · ' + esc(testo) : ''}</span><span class="hr"><span class="price">${imp ? eur(imp) : ''}</span>${chip}</span></div>`;
  const storia = isNew ? [] : [
    ...s.prev.map(p => ({ d: p.data, h: voce(p.data, `Preventivo ${esc(p.numero || '')}`, p.oggetto, totPrev(p).totale, `<span class="chip ${statoPrev(p.stato)[2]}">${statoPrev(p.stato)[1]}</span>`, 'editPrev', p.id) })),
    ...s.mod.map(m => ({ d: m.data, h: voce(m.data, 'Modulo', m.titolo, null, `<span class="chip ${m.stato === 'firmato' ? 'ok' : ''}">${m.stato === 'firmato' ? 'Firmato' : 'Da firmare'}</span>`, 'editMod', m.id) })),
    ...s.lav.map(l => ({ d: l.data, h: voce(l.data, 'Posa', l.installato, l.importo, `<span class="chip ${ammOf(l.amm)[2]}">${ammOf(l.amm)[1]}</span>`, 'editLav', l.id) })),
    ...s.int.map(i => ({ d: i.dataProg || i.data, h: voce(i.dataProg || i.data, 'Intervento', i.descrizione, i.costo, `<span class="chip ${(STATI.find(x => x[0] === (i.stato || 'aperto')) || STATI[0])[2]}">${(STATI.find(x => x[0] === (i.stato || 'aperto')) || STATI[0])[1]}</span>`, 'editInt', i.id) })),
  ].sort((a, b) => String(b.d).localeCompare(String(a.d)));
  cliCtx = isNew ? null : c;
  openSheet(isNew ? 'Nuovo cliente' : c.nome, `
    ${isNew ? '' : `<div class="kpis"><div class="kpi"><div class="l">Lavorato</div><div class="v">${eur(s.fatturato)}</div></div><div class="kpi"><div class="l">Quest'anno</div><div class="v">${eur(s.anno)}</div></div><div class="kpi"><div class="l">Da incassare</div><div class="v">${eur(s.aperto)}</div></div><div class="kpi"><div class="l">Ultimo lavoro</div><div class="v">${s.ultimo ? fmtD(s.ultimo, { day: 'numeric', month: 'short' }) : '—'}</div></div></div>
    <div class="row">${c.telefono ? `<a class="btn sm" href="tel:${esc(c.telefono.replace(/\s/g, ''))}">Chiama</a><a class="btn sm" href="https://wa.me/${esc(c.telefono.replace(/\D/g, '').replace(/^(?!39)(?=3)/, '39'))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}">Email</a>` : ''}${c.indirizzo ? `<a class="btn sm" href="https://maps.apple.com/?q=${encodeURIComponent(c.indirizzo)}" target="_blank" rel="noopener">Mappa</a>` : ''}</div>
    <div class="row"><button class="btn sm dark" data-act="cliCal" type="button">${svg('cal', 'i')} Vedi nel calendario</button><button class="btn sm primary" data-act="cliPrev" type="button">+ Preventivo</button><button class="btn sm" data-act="cliLav" type="button">+ Posa</button><button class="btn sm" data-act="cliInt" type="button">+ Intervento</button><button class="btn sm" data-act="cliMod" type="button">+ Modulo</button></div>
    <div class="fieldset"><span class="fs-t">Storico</span><div class="histlist">${storia.map(x => x.h).join('') || '<div class="small muted">Ancora nessun lavoro.</div>'}</div></div>`}
    <div class="fieldset"><span class="fs-t">Dati del cliente</span>
      <div class="g2">${F('Nome o ragione sociale', inp('kNome', c.nome, 'text', 'required'))}${F('Tipo', sel('kTipo', TIPI_CLIENTE, c.tipo || 'finale'))}</div>
      <div class="g2">${F('Referente', inp('kRef', c.referente, 'text', 'placeholder="Persona di riferimento"'))}${F('Telefono', inp('kTel', c.telefono, 'tel'))}</div>
      <div class="g2">${F('Email', inp('kEmail', c.email, 'email'))}${F('P. IVA / Codice fiscale', inp('kPiva', c.piva))}</div>
      ${F('Indirizzo', inp('kInd', c.indirizzo, 'text', 'placeholder="Sede o abitazione"'))}
      <div class="g2">${F('Codice SDI o PEC', inp('kSdi', c.sdi, 'text', 'placeholder="Per la fattura elettronica"'))}${F('IVA nei preventivi', sel('kIva', [['', `Predefinita (${ivaOf(az.ivaPredefinita)[1]})`], ...IVA.map(i => [i[0], i[1]])], c.iva || ''))}</div>
      ${F('Note', `<textarea id="f_kNote" name="kNote" placeholder="Es. paga a 30 giorni, chiavi dal portinaio…">${esc(c.note || '')}</textarea>`)}
    </div>`,
  async fd => {
    const nome = fd.get('kNome').trim();
    const altro = trovaCliente(nome);
    if (altro && altro.id !== c.id) throw Object.assign(new Error('doppio'), { userMsg: `Esiste già un cliente chiamato "${altro.nome}"` });
    const d = { ...stripId(c), nome, tipo: fd.get('kTipo'), referente: fd.get('kRef').trim(), telefono: fd.get('kTel').trim(), email: fd.get('kEmail').trim(), piva: fd.get('kPiva').trim(), indirizzo: fd.get('kInd').trim(), sdi: fd.get('kSdi').trim(), iva: fd.get('kIva'), note: fd.get('kNote').trim() };
    if (isNew) d.creato = TODAY;
    const id = store.put('clienti', isNew ? null : c.id, d);
    if (!isNew && normNome(c.nome) !== normNome(nome)) {
      // nome cambiato: aggiorna anche pose, interventi e preventivi collegati
      for (const x of s.lav) store.put('lavori', x.id, { ...stripId(x), cliente: nome, clienteId: id });
      for (const x of s.int) store.put('interventi', x.id, { ...stripId(x), cliente: nome, clienteId: id });
      for (const x of s.prev) store.put('preventivi', x.id, { ...stripId(x), cliente: { ...(x.cliente || {}), nome }, clienteId: id });
    }
    toast('Cliente salvato');
  }, { del: isNew ? null : async () => { store.drop('clienti', c.id); toast('Cliente tolto dalla rubrica (i lavori restano)'); } });
}
let cliCtx = null;
/** Campo cliente: si scrive il nome o si sceglie dalla rubrica. */
function campoCliente(id, label, valore, extra = '') {
  const elenco = [...S.clienti].sort((a, b) => a.nome.localeCompare(b.nome));
  return `<label class="f"><span>${label}</span><div class="clipick">${inp(id, valore, 'text', `required list="clilist" ${extra}`)}${elenco.length ? `<select id="pickCli" data-for="f_${id}" aria-label="Scegli dalla rubrica"><option value="">Rubrica</option>${elenco.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('')}</select>` : ''}</div></label>`;
}
/** Sotto il campo cliente: dice se è in rubrica o se verrà aggiunto. */
function aggiornaCliInfo() {
  const box = $('#cliInfo'); if (!box) return;
  const el = $('#f_cliente') || $('#f_cnome'); const nome = (el?.value || '').trim();
  const c = trovaCliente(nome);
  box.innerHTML = !nome ? '' : c
    ? `${svg('cli', 'i')} In rubrica · ${tipoCliente(c.tipo)}${c.telefono ? ' · ' + esc(c.telefono) : ''}${c.referente ? ' · ' + esc(c.referente) : ''}`
    : `${svg('cli', 'i')} Cliente nuovo: lo aggiungo alla rubrica quando salvi`;
  box.classList.toggle('nuovo', !c);
}
/** Quando scrivi il nome di un cliente in rubrica, completa i campi vuoti del modulo. */
function compilaDaRubrica(nome) {
  const c = trovaCliente(nome); if (!c) return false;
  const metti = (id, v) => { const el = $('#' + id); if (el && !el.value && v) el.value = v; };
  // preventivo
  metti('f_cindirizzo', c.indirizzo); metti('f_cpiva', c.piva); metti('f_ctel', c.telefono); metti('f_cemail', c.email);
  const t = $('#f_ctipo'); if (t && c.tipo) t.value = c.tipo;
  const iva = $('#f_iva'); if (iva && c.iva && $('#righeBox')?.dataset.kind === 'prev') { iva.value = c.iva; aggiornaTotali(); }
  // intervento e posa
  metti('f_telefono', c.telefono);
  metti('f_indirizzo', c.indirizzo);
  // moduli Cassero
  const dc = datiCliente(c);
  metti('f_u_tel', dc.telefono); metti('f_u_email', dc.email); metti('f_u_indirizzo', dc.indirizzo); metti('f_u_indirizzo_cantiere', dc.indirizzo);
  metti('f_u_cf', dc.cf); metti('f_u_piva', dc.piva); metti('f_u_sdi', dc.sdi); metti('f_u_pec', dc.pec);
  return true;
}

/* ---------- consuntivo di più giorni ---------- */
function lavoriSel() {
  const set = UI.sel || new Set(), out = [];
  S.lavori.filter(l => giorniPosa(l).some(g => set.has(g))).forEach(x => out.push({ x, kind: 'lavori', d: x.data }));
  S.interventi.filter(i => i.stato === 'completato' && set.has(i.dataProg || i.data)).forEach(x => out.push({ x, kind: 'interventi', d: x.dataProg || x.data }));
  return out.sort((a, b) => a.d.localeCompare(b.d));
}
const importoJob = j => n2(j.kind === 'lavori' ? j.x.importo : j.x.costo);
function barraSelezione() {
  if (!UI.sel) return `<div class="row between"><span class="small muted">Più giornate per lo stesso cliente?</span><button class="btn sm" data-act="selMode" type="button">Consuntivo di più giorni</button></div>`;
  const j = lavoriSel();
  return `<div class="selbar"><div><b>${UI.sel.size} ${UI.sel.size === 1 ? 'giorno scelto' : 'giorni scelti'}</b><div class="small">${j.length ? `${j.length} ${j.length === 1 ? 'lavoro' : 'lavori'} · ${eur(sum(j, importoJob))}` : 'Tocca i giorni nel calendario, anche di mesi diversi'}</div></div>
    <div class="row"><button class="btn sm" data-act="selAnnulla" type="button">Annulla</button><button class="btn sm dark" data-act="selCons" type="button" ${j.length ? '' : 'disabled'}>Crea consuntivo</button></div></div>`;
}
let cmCtx = null;
function sheetConsMulti() {
  const jobs = lavoriSel();
  if (!jobs.length) { toast('Nei giorni scelti non ci sono pose o interventi completati'); return; }
  const clienti = [...new Set(jobs.map(j => j.x.cliente || ''))];
  const conta = c => jobs.filter(j => (j.x.cliente || '') === c).length;
  const cli = [...clienti].sort((a, b) => conta(b) - conta(a))[0];
  cmCtx = { jobs };
  openSheet('Consuntivo di più giorni', `
    ${clienti.length > 1 ? F('Cliente', sel('cmCliente', clienti.map(c => [c, c || 'Senza nome']), cli)) : `<div class="small muted">Cliente</div><b>${esc(cli || 'Senza nome')}</b>`}
    <div class="fieldset"><span class="fs-t">Lavori compresi</span><div id="cmLista" class="stack"></div></div>
    ${F('IVA nel PDF', sel('iva', IVA.map(i => [i[0], i[1]]), String(AZ().ivaPredefinita)))}
    <pre class="cons" id="consTxt"></pre>`,
  async () => {
    const sc = jobsScelti(); if (!sc.length) throw Object.assign(new Error('vuoto'), { userMsg: 'Scegli almeno un lavoro' });
    for (const j of sc) if ((j.x.amm || 'da_cons') === 'da_cons') store.put(j.kind, j.x.id, { ...stripId(j.x), amm: 'cons' });
    UI.sel = null; toast(`Consuntivo segnato come inviato (${sc.length} ${sc.length === 1 ? 'lavoro' : 'lavori'})`);
  }, { saveLabel: 'Segna inviato', extra: `<button type="button" class="btn dark" data-act="consMultiPdf">PDF</button><button type="button" class="btn" data-act="copy">Copia</button>${navigator.share ? '<button type="button" class="btn" data-act="share">Condividi</button>' : ''}` });
  disegnaListaCM(cli);
}
function disegnaListaCM(cli) {
  const lista = cmCtx.jobs.filter(j => (j.x.cliente || '') === cli);
  $('#cmLista').innerHTML = lista.map(j => `<label class="check cmrow"><input type="checkbox" class="cmChk" data-kind="${j.kind}" data-id="${esc(j.x.id)}" checked><span><b>${fmtD(j.d, { weekday: 'short', day: 'numeric', month: 'short' })}</b> · ${j.kind === 'lavori' ? 'Posa' : 'Intervento'}${(j.kind === 'lavori' ? j.x.installato : j.x.descrizione) ? ' · ' + esc(j.kind === 'lavori' ? j.x.installato : j.x.descrizione) : ''}<br><span class="small muted">${eur(importoJob(j))}${(j.x.amm || 'da_cons') !== 'da_cons' ? ' · ' + ammOf(j.x.amm)[1].toLowerCase() : ''}</span></span></label>`).join('');
  aggiornaCM();
}
function jobsScelti() {
  return [...document.querySelectorAll('.cmChk:checked')].map(c => cmCtx.jobs.find(j => j.kind === c.dataset.kind && j.x.id === c.dataset.id)).filter(Boolean);
}
function docMulti(sc, iva) {
  const L = LIST(); let ore = 0;
  const gruppi = sc.map(j => {
    const d = docDaLavoro(j.x, j.kind, AZ());
    const t = totali(d, L);
    const righe = d.righe.map(r => ({ ...r }));
    if (t.urgenzaPct) righe.push({ descr: `Maggiorazione urgenza ${num(t.urgenzaPct)}%`, unita: 'corpo', qta: 1, prezzo: t.urgenza });
    ore += n2(j.x.ore);
    return { titolo: `${fmtD(j.d, { weekday: 'long', day: 'numeric', month: 'long' })} · ${j.kind === 'lavori' ? 'Posa' : 'Intervento'}${j.x.indirizzo ? ' · ' + j.x.indirizzo : ''}`, righe };
  });
  const indirizzi = [...new Set(sc.map(j => j.x.indirizzo).filter(Boolean))];
  return { data: sc[0].d, dataFine: sc[sc.length - 1].d, cliente: { nome: sc[0].x.cliente || '', telefono: sc[0].x.telefono || '' }, cantiere: indirizzi.length === 1 ? indirizzi[0] : '', oggetto: `${sc.length} ${sc.length === 1 ? 'giornata' : 'giornate'} di lavoro`, ore, righe: gruppi.flatMap(g => g.righe), gruppi, iva, note: '' };
}
function aggiornaCM() {
  const pre = $('#consTxt'); if (!pre) return;
  const sc = jobsScelti();
  if (!sc.length) { pre.textContent = 'Scegli almeno un lavoro.'; return; }
  const L = LIST(), doc = docMulti(sc, 'no'), t = totali(doc, L);
  const um = r => r.unita === 'ora' ? 'ore' : r.unita === 'km' ? 'km' : r.unita === 'pz' ? 'pz' : '';
  const dd = s => fmtD(s, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const riga = r => r.prezzo === '' ? `- ${r.descr}: da concordare` : um(r) ? `- ${r.descr}: ${num(r.qta, 2)} ${um(r)} × ${eur(prezzoUnitario(r, L))} = ${eur(totaleRiga(r, L))}` : `- ${r.descr}: ${eur(totaleRiga(r, L))}`;
  pre.textContent = `CONSUNTIVO LAVORI
Cliente: ${doc.cliente.nome}
Periodo: ${dd(doc.data)}${doc.dataFine !== doc.data ? ' – ' + dd(doc.dataFine) : ''}
${doc.cantiere ? 'Cantiere: ' + doc.cantiere + '\n' : ''}
${doc.gruppi.map(g => `${g.titolo.toUpperCase()}\n${g.righe.map(riga).join('\n') || '- nessuna voce'}`).join('\n\n')}

Ore totali: ${num(doc.ore, 2)}
Totale: ${eur(t.imponibile)} + IVA se dovuta`;
}

/* ---------- PDF ---------- */
let pdfCorrente = null;
function apriPdf(tipo, doc, indietro) {
  const cr = trovaCliente(doc.cliente?.nome);
  if (cr) doc = { ...doc, cliente: { indirizzo: cr.indirizzo, piva: cr.piva, email: cr.email, telefono: cr.telefono, ...Object.fromEntries(Object.entries(doc.cliente || {}).filter(([, v]) => v)) } };
  let bytes;
  try { bytes = creaDocumento({ tipo, doc, azienda: AZ(), listino: LIST(), immagini: IMG }); }
  catch (e) { console.warn(e); toast('Non sono riuscito a creare il PDF'); return; }
  const dIt = s => String(s || '').split('-').reverse().join('-');
  const base = tipo === 'preventivo' ? `Preventivo ${String(doc.numero || '').replace('/', '-')}` : `Consuntivo ${dIt(doc.data)}${doc.dataFine && doc.dataFine !== doc.data ? ' al ' + dIt(doc.dataFine) : ''}`;
  const nome = `${base} ${doc.cliente?.nome || ''}`.replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() + '.pdf';
  const file = new File([bytes], nome, { type: 'application/pdf' });
  if (pdfCorrente?.url) URL.revokeObjectURL(pdfCorrente.url);
  pdfCorrente = { file, url: URL.createObjectURL(file), indietro, doc, tipo };
  let share = false; try { share = !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch {}
  openSheet(tipo === 'preventivo' ? 'Preventivo pronto' : 'Consuntivo pronto', `
    <div class="pdfready">${svg('doc')}<div><b>${esc(nome)}</b><div class="small muted">${num(bytes.length / 1024, 0)} KB${tipo === 'preventivo' && doc.condizioni ? ' · con termini, condizioni e firma' : ''}</div></div></div>
    <div class="stack">
      ${share ? `<button type="button" class="btn primary" data-act="pdfShare">Invia o salva (WhatsApp, Mail, File…)</button>` : ''}
      <a class="btn ${share ? '' : 'primary'}" href="${pdfCorrente.url}" target="_blank" rel="noopener">Apri il PDF</a>
      <button type="button" class="btn" data-act="pdfDown">Scarica sul dispositivo</button>
      ${tipo === 'preventivo' && (doc.stato || 'bozza') === 'bozza' ? `<button type="button" class="btn" data-act="prevInviato">Segna come inviato al cliente</button>` : ''}
    </div>
    ${tipo === 'preventivo' && (doc.stato || 'bozza') === 'bozza' ? '<div class="small muted">Quando il preventivo è segnato come inviato, se il cliente non risponde entro 7 giorni te lo ricordo.</div>' : ''}
  `, null, { extra: indietro ? '<button type="button" class="btn" data-act="pdfBack">‹ Torna indietro</button>' : '' });
}

/* ---------- listino e dati azienda ---------- */
const listinoRow = v => `<div class="lrow" data-id="${esc(v.id)}" data-magg="${esc(v.magg || '')}">
  <div class="lname"><input name="ln" value="${esc(v.nome)}" aria-label="Nome voce" placeholder="Nome voce"><input name="lv" value="${esc(v.variante || '')}" placeholder="Dettaglio (facoltativo)" aria-label="Dettaglio"></div>
  <label class="lprezzo"><span>€</span><input name="lp" type="number" step="any" inputmode="decimal" value="${v.prezzo ?? ''}" placeholder="da concordare" aria-label="Prezzo"></label>
  <select name="lu" aria-label="Tipo di prezzo">${UNITA_OPT.map(([k, l]) => `<option value="${k}" ${k === (v.unita || 'pz') ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <button type="button" data-act="rmL" aria-label="Togli voce">×</button></div>`;
function sheetListino() {
  const L = LIST();
  const gruppi = [...new Set(L.voci.map(v => v.gruppo))];
  openSheet('Listino prezzi', `
    <div class="small muted">Prezzi IVA esclusa. Lascia vuoto il prezzo delle voci "da concordare". Le modifiche valgono per i nuovi preventivi e lavori: quelli già salvati non cambiano.</div>
    <div class="g2">${F('Anno del listino', inp('anno', L.anno, 'number'))}${F('Urgenza %', inp('urgenzaPct', L.urgenzaPct, 'number'))}</div>
    <div class="g2">${F('Blindati €/pz in più', inp('maggBlindato', L.maggBlindato, 'number'))}${F('Posa in luce €/pz in più', inp('maggLuce', L.maggLuce, 'number'))}</div>
    ${F('Trasferta € al km (pose e interventi)', inp('euroKmL', euroKm(), 'number'))}
    <div id="lgroups" class="stack">${gruppi.map(g => `<div class="fieldset lgroup" data-gruppo="${esc(g)}"><span class="fs-t">${esc(g)}</span>${L.voci.filter(v => v.gruppo === g).map(listinoRow).join('')}<button type="button" class="btn sm" data-act="addL">+ Voce in questa sezione</button></div>`).join('')}</div>
    ${S.listino ? '<button type="button" class="btn ghost small" data-act="resetListino">Ripristina il listino 2027 (PDF del 27 ottobre)</button>' : ''}
  `, async fd => {
    const voci = [...document.querySelectorAll('#lgroups .lrow')].map(el => {
      const q = n => el.querySelector(`[name="${n}"]`); const p = q('lp').value.trim();
      return { id: el.dataset.id, gruppo: el.closest('.lgroup').dataset.gruppo, nome: q('ln').value.trim(), variante: q('lv').value.trim(), prezzo: p === '' ? null : n2(p), unita: q('lu').value, magg: el.dataset.magg || '' };
    }).filter(v => v.nome);
    store.put('cfg', 'listino', { anno: n2(fd.get('anno')) || L.anno, urgenzaPct: n2(fd.get('urgenzaPct')), maggBlindato: n2(fd.get('maggBlindato')), maggLuce: n2(fd.get('maggLuce')), euroKm: n2(fd.get('euroKmL')), voci });
    toast('Listino salvato');
  });
}
function sheetAzienda() {
  const a = AZ();
  openSheet('Dati per preventivi', `
    ${F('Ragione sociale', inp('ragioneSociale', a.ragioneSociale, 'text', 'required'))}
    <div class="g2">${F('Partita IVA', inp('piva', a.piva))}${F('Telefono', inp('telefono', a.telefono, 'tel'))}</div>
    <div class="g2">${F('Email', inp('email', a.email, 'email'))}${F('Indirizzo (facoltativo)', inp('indirizzo', a.indirizzo))}</div>
    ${F('IBAN per i pagamenti (facoltativo)', inp('iban', a.iban))}
    <div class="g2">${F('IVA predefinita', sel('ivaPredefinita', IVA.map(i => [i[0], i[1]]), String(a.ivaPredefinita)))}${F('Validità preventivi (giorni)', inp('validitaGiorni', a.validitaGiorni, 'number'))}</div>
    ${F('Avviso imprevisti', inp('notaImprevisti', a.notaImprevisti))}
    ${F('Termini e condizioni allegati ai preventivi', `<textarea id="f_condTesto" name="condizioni" style="min-height:280px">${esc(a.condizioni)}</textarea>`)}
    <div class="small muted">Separa i punti con una riga vuota: la prima riga di ogni punto è il titolo.</div>`,
  async fd => {
    const d = {}; ['ragioneSociale', 'piva', 'telefono', 'email', 'indirizzo', 'iban', 'ivaPredefinita', 'notaImprevisti', 'condizioni'].forEach(k => d[k] = String(fd.get(k) || '').trim());
    d.validitaGiorni = n2(fd.get('validitaGiorni')) || 30;
    store.put('cfg', 'azienda', d); toast('Dati salvati');
  });
}

/* foto scontrino */
async function shrink(file, max = 1600) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || file), 'image/jpeg', .82));
  } catch { return file; }
}
let tessP = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  return tessP ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; s.onload = res; s.onerror = () => { tessP = null; rej(new Error('tesseract')); }; document.head.appendChild(s); });
}
async function onPhoto(file) {
  if (!file) return;
  openSheet('Lettura scontrino', `<div class="stack" style="align-items:center;padding:20px 0;text-align:center"><div class="spinner"></div><b id="phStep">Preparo la foto…</b><span class="small muted">La prima volta servono circa 30 secondi, poi è più veloce.</span></div>`, null);
  const blob = await shrink(file);
  const preview = URL.createObjectURL(blob);
  let foto = null, letto = null;
  try { foto = await store.uploadFile(blob, 'scontrino.jpg'); } catch (e) { toast(e.userMsg || 'Foto non salvata: la allego quando torna la rete'); }
  if (navigator.onLine) {
    try {
      const st = $('#phStep'); if (st) st.textContent = 'Leggo lo scontrino…';
      await loadTesseract();
      const { data } = await window.Tesseract.recognize(blob, 'ita');
      letto = leggiScontrino(data.text || '', S.magazzino.map(m => m.nome));
    } catch (e) { console.warn(e); toast('Lettura automatica non riuscita: compila a mano'); }
  }
  const ok = letto && (letto.totale || letto.fornitore);
  sheetMov(null, {
    foto, _preview: preview, _letto: !!ok, categoria: ok && letto.categoria !== 'altro' ? letto.categoria : 'materiale',
    data: ok && letto.data && letto.data <= TODAY ? letto.data : TODAY,
    importo: ok ? letto.totale || '' : '', fornitore: ok ? letto.fornitore : '', numero: ok ? letto.numero : '', descrizione: '',
    righe: ok ? letto.righe : [],
  });
}

/* magazzino */
function sheetMag(m) {
  const isNew = !m; m = m || { unita: 'pz', qta: 0, costoMedio: 0, soglia: 0 };
  openSheet(isNew ? 'Nuovo materiale' : m.nome, `
    ${isNew ? F('Nome materiale', inp('nome', '', 'text', 'required placeholder="Es. Schiuma poliuretanica"')) : ''}
    <div class="g2">${F('Giacenza attuale', inp('qta', m.qta, 'number', 'required'))}${F('Unità', inp('unita', m.unita, 'text', 'placeholder="pz, cartuccia, m…"'))}</div>
    <div class="g2">${F('Costo medio €', inp('costoMedio', m.costoMedio, 'number'))}${F('Avvisami sotto quota', inp('soglia', m.soglia, 'number'))}</div>
    <div class="small muted">Con "Avvisami sotto quota" il materiale compare nel riquadro "Da fare" quando sta per finire.</div>`,
  async fd => {
    const nome = isNew ? fd.get('nome').trim() : m.nome; const id = isNew ? slug(nome) : m.id;
    const d = { nome, unita: fd.get('unita').trim() || 'pz', qta: n2(fd.get('qta')), costoMedio: n2(fd.get('costoMedio')), soglia: n2(fd.get('soglia')) };
    if (m.esempio) d.esempio = true;
    store.put('magazzino', id, d); toast('Magazzino aggiornato');
  }, { del: isNew ? null : async () => { store.drop('magazzino', m.id); toast('Materiale tolto dal magazzino'); } });
}

/* cartelle */
function sheetCart(c) {
  const isNew = !c; c = c || {};
  openSheet(isNew ? 'Nuova cartella' : 'Cartella', `
    ${F('Nome', inp('nome', c.nome, 'text', 'required placeholder="Es. Preventivi 2026, Schede tecniche"'))}
    ${F('Link della cartella', inp('url', c.url, 'url', 'required placeholder="https://www.icloud.com/iclouddrive/…"'))}
    ${F('Nota (facoltativa)', inp('nota', c.nota, 'text', 'placeholder="Dove si trova sul Mac"'))}`,
  async fd => {
    const url = fd.get('url').trim();
    if (!isUrl(url)) throw Object.assign(new Error('url'), { userMsg: 'Il link deve iniziare con https://' });
    store.put('cartelle', isNew ? null : c.id, { nome: fd.get('nome').trim(), url, nota: fd.get('nota').trim() });
    toast('Cartella salvata');
  }, { del: isNew ? null : async () => { store.drop('cartelle', c.id); toast('Cartella tolta'); } });
}

/* furgone */
function sheetVan() {
  const f = S.furgone || {};
  openSheet('Dati del furgone', `
    <div class="g2">${F('Modello', inp('modello', f.modello, 'text', 'placeholder="Es. Fiat Ducato"'))}${F('Targa', inp('targa', f.targa))}</div>
    <div class="g2">${F('Km attuali', inp('km', f.km, 'number'))}${F('Compagnia assicurativa', inp('compagnia', f.compagnia))}</div>
    <div class="g2">${F('Scadenza assicurazione', inp('assicurazione', f.assicurazione, 'date'))}${F('Scadenza bollo', inp('bollo', f.bollo, 'date'))}</div>
    <div class="g2">${F('Prossima revisione', inp('revisione', f.revisione, 'date'))}${F('Prossimo tagliando', inp('tagliando', f.tagliando, 'date'))}</div>
    ${F('Tagliando a km', inp('tagliandoKm', f.tagliandoKm, 'number'))}`,
  async fd => { const d = { ...f }; delete d.esempio; ['modello', 'targa', 'compagnia', 'assicurazione', 'bollo', 'revisione', 'tagliando'].forEach(k => d[k] = String(fd.get(k) || '').trim()); ['km', 'tagliandoKm'].forEach(k => d[k] = n2(fd.get(k))); store.put('cfg', 'furgone', d); toast('Dati furgone salvati'); });
}
function sheetKm() {
  const f = S.furgone || {};
  openSheet('Aggiorna chilometri', F('Km attuali', inp('km', f.km, 'number', 'required')), async fd => { store.put('cfg', 'furgone', { ...f, km: n2(fd.get('km')) }); toast('Km aggiornati'); });
}
function sheetRinnova(k) {
  const f = S.furgone || {}; const [, lab, yy] = SCAD.find(s => s[0] === k);
  const next = f[k] ? addYears(f[k], yy) : '';
  openSheet(lab, `
    ${F('Nuova scadenza', inp('scad', next, 'date', 'required'))}
    ${k === 'tagliando' ? F('Prossimo tagliando a km', inp('tkm', n2(f.km) ? n2(f.km) + 30000 : f.tagliandoKm, 'number')) : ''}
    <div class="g2">${F('Importo pagato €', inp('importo', '', 'number', 'placeholder="vuoto se nessuna spesa"'))}${F('Data pagamento', inp('data', TODAY, 'date'))}</div>
    <div class="small muted">Se inserisci l'importo, la spesa viene registrata nei conti alla voce Furgone.</div>`,
  async fd => {
    const d = { ...f, [k]: fd.get('scad') }; if (k === 'tagliando' && fd.get('tkm')) d.tagliandoKm = n2(fd.get('tkm'));
    store.put('cfg', 'furgone', d);
    if (n2(fd.get('importo')) > 0) store.put('movimenti', null, { tipo: 'uscita', data: fd.get('data') || TODAY, categoria: 'furgone', importo: n2(fd.get('importo')), fornitore: k === 'assicurazione' ? (f.compagnia || '') : '', numero: '', descrizione: `${lab} furgone`, righe: [], magazzino: false });
    toast(`${lab} aggiornata`);
  });
}

/* avanzamento fatture */
function advance(kind, id) {
  const x = S[kind].find(r => r.id === id); if (!x) return;
  const i = AMM.findIndex(a => a[0] === (x.amm || 'da_cons'));
  const nx = AMM[Math.min(i + 1, AMM.length - 1)][0];
  store.put(kind, id, { ...stripId(x), amm: nx }); toast(ammOf(nx)[1]);
}

/* esportazione CSV */
function csv(kind) {
  const q = v => { const s = String(v ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const it = v => String(+v || 0).replace('.', ',');
  let rows;
  if (kind === 'movimenti') rows = [['Data', 'Tipo', 'Categoria', 'Fornitore', 'N. documento', 'Descrizione', 'Importo']].concat([...S.movimenti].sort((a, b) => String(a.data).localeCompare(b.data)).map(m => [m.data, m.tipo, catName(m.categoria), m.fornitore, m.numero, m.descrizione || (m.righe || []).map(r => r.nome).join(', '), it(m.importo)]));
  else rows = [['Data', 'Cliente', 'Indirizzo', 'Lavoro', 'Pezzi', 'Ore', 'Importo', 'Situazione']].concat([...S.lavori].sort((a, b) => String(a.data).localeCompare(b.data)).map(l => [l.data, l.cliente, l.indirizzo, l.installato, l.pezzi, it(l.ore), it(l.importo), ammOf(l.amm)[1]]));
  const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${kind === 'movimenti' ? 'spese' : 'lavori'}-${TODAY}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
}

/* dati di esempio */
function seed() {
  const d = n => { const x = pd(TODAY); x.setDate(x.getDate() + n); return iso(x); };
  const ex = { esempio: true };
  const mag = [['Schiuma poliuretanica', 'bomboletta', 7.9, 4], ['Silicone neutro bianco', 'cartuccia', 5.4, 6], ['Viti 6x80 telaio', 'pz', .18, 100], ['Nastro autoespandente', 'rotolo', 9.5, 3], ['Cunei di spessoramento', 'conf', 4.2, 2]];
  for (const [nome, unita, c, s] of mag) store.put('magazzino', slug(nome), { nome, unita, qta: 0, costoMedio: c, soglia: s, ...ex });
  const buys = [
    { data: d(-48), fornitore: 'Ferramenta Bianchi', importo: 159.6, righe: [{ nome: 'Schiuma poliuretanica', qta: 12, unita: 'bomboletta', prezzoUnit: 7.9 }, { nome: 'Silicone neutro bianco', qta: 12, unita: 'cartuccia', prezzoUnit: 5.4 }] },
    { data: d(-20), fornitore: 'Ferramenta Bianchi', importo: 110.7, righe: [{ nome: 'Schiuma poliuretanica', qta: 8, unita: 'bomboletta', prezzoUnit: 7.9 }, { nome: 'Nastro autoespandente', qta: 5, unita: 'rotolo', prezzoUnit: 9.5 }] },
    { data: d(-12), fornitore: 'Edilcolor', importo: 54, righe: [{ nome: 'Viti 6x80 telaio', qta: 300, unita: 'pz', prezzoUnit: .18 }] }];
  for (const b of buys) { moveStock(b.righe, +1, true); store.put('movimenti', null, { tipo: 'uscita', categoria: 'materiale', numero: '', descrizione: 'Materiale di consumo', magazzino: true, ...b, ...ex }); }
  store.put('movimenti', null, { tipo: 'uscita', data: d(-5), categoria: 'carburante', importo: 85, fornitore: 'Distributore', numero: '', descrizione: 'Gasolio', righe: [], magazzino: false, ...ex });
  store.put('movimenti', null, { tipo: 'uscita', data: d(-30), categoria: 'furgone', importo: 240, fornitore: 'Officina Rossi', numero: '', descrizione: 'Tagliando furgone', righe: [], magazzino: false, ...ex });
  const lav = [
    { data: d(-15), cliente: 'Impresa Edil Nord', indirizzo: 'Via Nizza 120, Torino', installato: '6 finestre PVC 120×140 con controtelaio', pezzi: 6, ore: 9, importo: 720, materiali: [{ nome: 'Schiuma poliuretanica', qta: 3 }, { nome: 'Silicone neutro bianco', qta: 4 }, { nome: 'Viti 6x80 telaio', qta: 48 }], amm: 'fatt' },
    { data: d(-8), cliente: 'Famiglia Ferrero', indirizzo: 'Corso Francia 45, Collegno', installato: '2 portefinestre alluminio + 2 persiane', pezzi: 4, ore: 7.5, importo: 560, materiali: [{ nome: 'Schiuma poliuretanica', qta: 2 }, { nome: 'Nastro autoespandente', qta: 2 }, { nome: 'Viti 6x80 telaio', qta: 24 }], amm: 'cons' },
    { data: d(-2), cliente: 'Serramenti Alpi srl', indirizzo: 'Via Roma 8, Rivoli', installato: 'Sostituzione 5 finestre legno-alluminio', pezzi: 5, ore: 8, importo: 650, materiali: [{ nome: 'Schiuma poliuretanica', qta: 3 }, { nome: 'Silicone neutro bianco', qta: 3 }, { nome: 'Cunei di spessoramento', qta: 1 }], amm: 'da_cons' },
    { data: d(3), cliente: 'Impresa Edil Nord', indirizzo: 'Via Nizza 120, Torino', installato: 'Secondo lotto: 8 finestre PVC', pezzi: 8, ore: 0, importo: 960, materiali: [], amm: 'da_cons' }];
  for (const l of lav) { moveStock(l.materiali, -1); store.put('lavori', null, { note: '', allegati: [], ...l, ...ex }); }
  const ints = [
    { cliente: 'Sig.ra Martini', telefono: '', indirizzo: 'Via Cibrario 12, Torino', descrizione: 'Anta ribalta non chiude, da regolare', urgenza: 'critica', stato: 'aperto', data: d(-1), dataProg: '', costo: 80, ore: 0, materiali: [], amm: 'da_cons' },
    { cliente: 'Condominio Aurora', telefono: '', indirizzo: 'Corso Vittorio 30, Torino', descrizione: 'Infiltrazione sotto davanzale, rifare sigillatura', urgenza: 'alta', stato: 'programmato', data: d(-4), dataProg: d(2), costo: 150, ore: 0, materiali: [], amm: 'da_cons' },
    { cliente: 'Famiglia Ferrero', telefono: '', indirizzo: 'Corso Francia 45, Collegno', descrizione: 'Sostituita guarnizione portafinestra', urgenza: 'normale', stato: 'completato', data: d(-10), dataProg: d(-6), costo: 60, ore: 1, materiali: [{ nome: 'Silicone neutro bianco', qta: 1 }], amm: 'pag' }];
  for (const i of ints) { moveStock(i.materiali, -1); store.put('interventi', null, { ...i, ...ex }); }
  if (!S.furgone || !S.furgone.targa) store.put('cfg', 'furgone', { modello: 'Fiat Ducato (esempio)', targa: 'AB123CD', km: 148200, tagliandoKm: 150000, compagnia: '', assicurazione: d(18), bollo: d(64), revisione: d(210), tagliando: d(95), esempio: true });
  toast('Esempi caricati');
}
function unseed() {
  for (const c of ['lavori', 'interventi', 'movimenti', 'magazzino']) for (const x of S[c].filter(r => r.esempio)) store.drop(c, x.id);
  if (S.furgone?.esempio) store.drop('cfg', 'furgone');
  toast('Esempi rimossi');
}

/* ---------- eventi ---------- */
let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2800); }
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.tagName === 'A') return;
  const a = b.dataset.act, arg = b.dataset.arg, id = b.dataset.id;
  if (b.closest('#drawer') && a !== 'menu') chiudiMenu();
  if (e.target.closest('.card a')) return;
  const go = () => { render(); window.scrollTo({ top: 0 }); };
  switch (a) {
    case 'tab': UI.tab = arg; try { history.replaceState(null, '', '#' + arg); } catch {} go(); break;
    case 'fatt': UI.tab = 'conti'; UI.seg = 'fatt'; go(); break;
    case 'mag': UI.tab = 'conti'; UI.seg = 'mag'; go(); break;
    case 'month': UI.month = shiftMonth(UI.month, +arg); UI.day = UI.month === TODAY.slice(0, 7) ? TODAY : UI.month + '-01'; render(); break;
    case 'cMonth': UI.cMonth = shiftMonth(UI.cMonth, +arg); render(); break;
    case 'day':
      if (UI.sel && UI.tab === 'cal') { UI.sel.has(arg) ? UI.sel.delete(arg) : UI.sel.add(arg); UI.day = arg; render(); break; }
      UI.tab = 'cal'; UI.day = arg; UI.month = arg.slice(0, 7); render(); break;
    case 'selMode': UI.sel = new Set(); render(); toast('Tocca i giorni da mettere nel consuntivo'); break;
    case 'selAnnulla': UI.sel = null; render(); break;
    case 'selCons': sheetConsMulti(); break;
    case 'consMultiPdf': { const sc = jobsScelti(); if (!sc.length) { toast('Scegli almeno un lavoro'); break; } apriPdf('consuntivo', docMulti(sc, $('#f_iva')?.value || AZ().ivaPredefinita), () => sheetConsMulti()); break; }
    case 'intF': UI.intFilter = arg; render(); break;
    case 'seg': UI.seg = arg; render(); break;
    case 'authView': UI.authView = arg; UI.authErr = ''; UI.authMsg = ''; render(); break;
    case 'newLav': sheetLav(null); break;
    case 'editLav': sheetLav(S.lavori.find(x => x.id === id)); break;
    case 'newInt': sheetInt(null, arg); break;
    case 'editInt': sheetInt(S.interventi.find(x => x.id === id)); break;
    case 'newMov': sheetMov(null); break;
    case 'editMov': sheetMov(S.movimenti.find(x => x.id === id)); break;
    case 'newMag': sheetMag(null); break;
    case 'editMag': sheetMag(S.magazzino.find(x => x.id === id)); break;
    case 'newCart': sheetCart(null); break;
    case 'editCart': sheetCart(S.cartelle.find(x => x.id === id)); break;
    case 'editVan': sheetVan(); break;
    case 'km': sheetKm(); break;
    case 'rinnova': sheetRinnova(arg); break;
    case 'cons': sheetCons(arg, id); break;
    case 'amm': advance(arg, id); render(); break;
    case 'close': closeSheet(); break;
    case 'addrow': $('#matrows').insertAdjacentHTML('beforeend', matRow({}, arg === 'buy')); break;
    case 'rmrow': { const rows = $('#matrows'); if (rows.children.length > 1) b.parentElement.remove(); else b.parentElement.querySelectorAll('input').forEach(i => i.value = ''); break; }
    case 'rmFile': sheetFiles.splice(+arg, 1); $('#filesList').innerHTML = filesHtml(); break;
    case 'openFile': openFile(sheetFiles[+arg].path); break;
    case 'openPath': openFile(arg); break;
    case 'copy': { const t = $('#consTxt').textContent; try { await navigator.clipboard.writeText(t); toast('Testo copiato'); } catch { const r = document.createRange(); r.selectNodeContents($('#consTxt')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Testo selezionato: copialo'); } break; }
    case 'share': try { await navigator.share({ text: $('#consTxt').textContent }); } catch {} break;
    case 'del':
      if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Conferma eliminazione'; break; }
      try { b.disabled = true; await sheetDel(); closeSheet(); render(); } catch { toast('Non eliminato, riprova'); b.disabled = false; }
      break;
    case 'seed': seed(); render(); break;
    case 'newCli': sheetCliente(null); break;
    case 'menu': apriMenu(); break;
    case 'modScegli': sheetScegliModello({}); break;
    case 'modDa': { const x = S[arg].find(r => r.id === id); if (x) sheetScegliModello(ctxDa(arg, x)); break; }
    case 'cliMod': if (cliCtx) sheetScegliModello(ctxDa('clienti', cliCtx)); break;
    case 'modNuovo': { const m = modelli().find(x => x.id === arg); if (!m) break;
      if (m.ufficiale) { const nome = modCtx.cliente || ''; sheetModuloU({ modelloId: m.id, titolo: m.nome, valori: valoriUfficiali(m, modCtx), cliente: nome, clienteId: modCtx.clienteId || '', ref: modCtx.ref || null, data: modCtx.data || TODAY, stato: 'bozza' }, true); modCtx = {}; break; }
      const campi = JSON.parse(JSON.stringify(m.campi || [])); sheetModulo({ modelloId: m.id, titolo: m.nome, campi, valori: valoriIniziali(campi, modCtx), cliente: modCtx.cliente || '', clienteId: modCtx.clienteId || '', ref: modCtx.ref || null, data: modCtx.data || TODAY, stato: 'bozza' }, true); break; }
    case 'editMod': { const m = S.moduli.find(x => x.id === id); if (!m) break; if (m.ufficiale && ufficiale(m.modelloId)) sheetModuloU(m, false); else sheetModulo(m, false); break; }
    case 'tuttiOk': { b.closest('.ugrid').querySelectorAll('.uctl').forEach(r => { const h = r.querySelector('input[type=hidden]'); if (h.value) return; const p = r.querySelector('button'); h.value = p.dataset.arg; r.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === p))); }); break; }
    case 'modPdf': {
      if (modEdit?.uff) {
        const form = $('#sheetForm'); if (!form.reportValidity()) break;
        const saved = salvaModuloU(new FormData(form)); const m = modEdit.uff;
        let bytes; try { bytes = creaModuloUfficiale({ mod: saved, modello: m, sfondo: await sfondoModulo(m.id) }); } catch (err) { console.warn(err); toast('Non sono riuscito a creare il PDF'); break; }
        const nome = `${m.nome} ${saved.cliente || ''} ${String(saved.data || '').split('-').reverse().join('-')}`.replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() + '.pdf';
        mostraPdf(bytes, nome, 'Modulo pronto', () => sheetModuloU(S.moduli.find(x => x.id === saved.id) || DIP.moduli.find(x => x.id === saved.id) || saved, false)); break;
      }
      const saved = salvaModulo(new FormData($('#sheetForm')));
      let bytes; try { bytes = creaModulo({ mod: { ...saved, clienteDati: trovaCliente(saved.cliente) || {} }, azienda: AZ(), immagini: IMG }); } catch (err) { console.warn(err); toast('Non sono riuscito a creare il PDF'); break; }
      const nome = `${saved.titolo} ${saved.cliente || ''} ${String(saved.data || '').split('-').reverse().join('-')}`.replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() + '.pdf';
      mostraPdf(bytes, nome, 'Modulo pronto', () => sheetModulo(S.moduli.find(x => x.id === saved.id) || saved, false)); break;
    }
    case 'siNo': { const h = $('#f_' + b.dataset.for); const v = h.value === arg ? '' : arg; h.value = v; b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.arg === v))); break; }
    case 'tabRiga': { const c = (modEdit?.mod.campi || []).find(x => x.id === arg); $('#tab_' + arg).insertAdjacentHTML('beforeend', rigaTab(c?.colonne || ['Voce'])); break; }
    case 'tabRm': { const t = b.closest('.mtab'); if (t.querySelectorAll('.mtr:not(.mth)').length > 1) b.parentElement.remove(); else b.parentElement.querySelectorAll('input').forEach(i => { i.value = ''; }); break; }
    case 'firmaCancella': { const cv = document.querySelector(`canvas.pad[data-for="${arg}"]`); cv?._pulisci?.(); $('#f_' + arg).value = ''; break; }
    case 'modelloNuovo': sheetModello(null); break;
    case 'editModello': sheetModello(modelli().find(x => x.id === arg)); break;
    case 'mcAdd': $('#mcampi').insertAdjacentHTML('beforeend', rigaCampo({ id: 'c' + Date.now().toString(36), tipo: 'testo', label: '' })); $('#mcampi').lastElementChild.querySelector('[name="mc_label"]').focus(); break;
    case 'mcSu': { const r = b.closest('.mcampo'); if (r.previousElementSibling) r.parentElement.insertBefore(r, r.previousElementSibling); break; }
    case 'mcGiu': { const r = b.closest('.mcampo'); if (r.nextElementSibling) r.parentElement.insertBefore(r.nextElementSibling, r); break; }
    case 'mcRm': b.closest('.mcampo').remove(); break;
    case 'calAttiva': case 'calNuovo': try { b.disabled = true; await attivaCalendario(a === 'calNuovo'); toast(a === 'calNuovo' ? 'Link cambiato: iscriviti di nuovo sull\'iPhone' : 'Calendario pronto: ora tocca «Iscriviti sull\'iPhone»'); } catch (err) { toast(err.userMsg || 'Non sono riuscito, riprova'); } render(); break;
    case 'calSpegni': { const pth = S.impostazioni?.calendario?.path; salvaImp({ calendario: null }); if (pth) store.removeFile(pth).catch(() => {}); toast('Calendario disattivato: puoi toglierlo anche dall\'iPhone'); render(); break; }
    case 'calCopia': { const u = S.impostazioni?.calendario?.url || ''; try { await navigator.clipboard.writeText(u); toast('Indirizzo copiato'); } catch { prompt('Copia questo indirizzo', u); } break; }
    case 'menuClose': chiudiMenu(); break;
    case 'menuGo': UI.tab = arg; if (arg !== 'cal') UI.calCli = null; try { history.replaceState(null, '', '#' + arg); } catch {} render(); window.scrollTo({ top: 0 }); break;
    case 'setNotifiche': sheetNotifiche(); break;
    case 'setGiornata': sheetGiornata(); break;
    case 'setAnalisi': sheetAnalisi(); break;
    case 'pushProva': pushProva(); break;
    case 'devRm': { b.disabled = true; let mio = ''; try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); mio = sub?.endpoint || ''; if (mio === arg) await sub.unsubscribe(); } catch {} await store.removePush(arg); toast('Dispositivo tolto dalle notifiche'); caricaDispositivi(); break; }
    case 'newEv': sheetEvento(null, arg); break;
    case 'editEv': sheetEvento(S.eventi.find(x => x.id === id)); break;
    case 'evTipo': document.querySelectorAll('.evseg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('#f_etipo').value = arg; break;
    case 'cliCal': { const c = cliCtx; if (!c) break; const s2 = storicoCliente(c); const prox = [...s2.lav.map(x => x.data), ...s2.int.map(x => x.dataProg || x.data)].filter(Boolean).sort(); const d = prox.find(x => x >= TODAY) || prox.pop() || TODAY; UI.calCli = c.id; UI.tab = 'cal'; UI.day = d; UI.month = d.slice(0, 7); closeSheet(); render(); window.scrollTo({ top: 0 }); break; }
    case 'calTutti': UI.calCli = null; render(); break;
    case 'editCli': sheetCliente(S.clienti.find(x => x.id === id)); break;
    case 'importaCli': { const n = importaClienti(); render(); toast(`${n} ${n === 1 ? 'scheda creata' : 'schede create'}`); break; }
    case 'cliTipo': UI.cliTipo = arg; render(); break;
    case 'cliOrd': UI.cliOrd = UI.cliOrd === 'nome' ? 'recenti' : 'nome'; render(); break;
    case 'cliPrev': { const c = cliCtx; if (!c) break; sheetPrev(null); $('#f_cnome').value = c.nome; compilaDaRubrica(c.nome); break; }
    case 'cliLav': { const c = cliCtx; if (!c) break; sheetLav(null, { cliente: c.nome }); break; }
    case 'cliInt': { const c = cliCtx; if (!c) break; sheetInt(null); $('#f_cliente').value = c.nome; compilaDaRubrica(c.nome); break; }
    case 'newPrev': sheetPrev(null); break;
    case 'editPrev': sheetPrev(S.preventivi.find(x => x.id === id)); break;
    case 'prevF': UI.prevFilter = arg; render(); break;
    case 'addLibera': $('#righe').insertAdjacentHTML('beforeend', rigaHtml({ descr: '', unita: 'corpo', qta: 1, prezzo: '' })); aggiornaTotali(); $('#righe').lastElementChild.querySelector('[name="rd"]').focus(); break;
    case 'rmRiga': b.closest('.riga').remove(); aggiornaTotali(); break;
    case 'ricalcola': { const imp = $('#f_importo') || $('#f_costo'); if (imp) { imp.dataset.auto = '1'; aggiornaTotali(); } break; }
    case 'prevPdf': {
      const form = $('#sheetForm');
      const bad = [...form.querySelectorAll('[required]')].find(i => !String(i.value).trim());
      if (bad) { bad.focus(); toast('Compila: ' + (bad.closest('label')?.querySelector('span')?.textContent || 'campo obbligatorio')); break; }
      const saved = salvaPrev(new FormData(form));
      apriPdf('preventivo', saved, () => sheetPrev(S.preventivi.find(x => x.id === saved.id) || saved));
      break;
    }
    case 'consPdf': { const x = S[arg].find(r => r.id === id); if (!x) break; const doc = docDaLavoro(x, arg, AZ()); doc.iva = $('#f_iva')?.value || doc.iva; apriPdf('consuntivo', doc, () => sheetCons(arg, id)); break; }
    case 'pdfShare': if (pdfCorrente) navigator.share({ files: [pdfCorrente.file], title: pdfCorrente.file.name }).catch(err => { if (err.name !== 'AbortError') toast('Condivisione non riuscita: usa "Apri il PDF"'); }); break;
    case 'pdfDown': if (pdfCorrente) { const a = Object.assign(document.createElement('a'), { href: pdfCorrente.url, download: pdfCorrente.file.name }); document.body.appendChild(a); a.click(); a.remove(); } break;
    case 'pdfBack': if (pdfCorrente?.indietro) pdfCorrente.indietro(); break;
    case 'prevInviato': { const p = S.preventivi.find(x => x.id === pdfCorrente?.doc?.id); if (p) { store.put('preventivi', p.id, { ...stripId(p), stato: 'inviato', dataInvio: p.dataInvio || TODAY }); pdfCorrente.doc = { ...p, stato: 'inviato' }; b.remove(); toast('Segnato come inviato'); } break; }
    case 'pianifica': { const p = prevCtx?.p; if (!p) break; sheetLav(null, { cliente: p.cliente?.nome || '', indirizzo: p.cantiere || p.cliente?.indirizzo || '', calcolo: 'pezzo', righe: p.righe || [], importo: totPrev(p).imponibile, note: [p.oggetto, p.note].filter(Boolean).join(' – '), preventivoId: p.id }); break; }
    case 'editListino': sheetListino(); break;
    case 'editAzienda': sheetAzienda(); break;
    case 'addL': b.insertAdjacentHTML('beforebegin', listinoRow({ id: 'v' + Date.now().toString(36), nome: '', variante: '', prezzo: '', unita: 'pz' })); b.previousElementSibling.querySelector('[name="ln"]').focus(); break;
    case 'rmL': b.closest('.lrow').remove(); break;
    case 'resetListino':
      if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Tocca di nuovo per ripristinare i prezzi originali'; break; }
      store.drop('cfg', 'listino'); closeSheet(); render(); toast('Listino 2027 ripristinato'); break;
    case 'unseed': unseed(); render(); break;
    case 'csv': csv(arg); break;
    case 'pushOn': case 'pushTest': pushOn(); break;
    case 'logout': await store.logout(); UI.tab = 'cal'; UI.authView = 'login'; Object.assign(RIV, { carico: false, mie: [], da: '', a: '', listino: null, listinoCarico: false, prev: null }); UI.rivTab = 'cal'; RIV.occ.clear(); RIV.mesiCaricati.clear(); Object.assign(DIP, { carico: false, lavori: [], moduli: [] }); Object.assign(ACC, { ok: null, t: 0, membri: [], richieste: [], pren: [] }); render(); break;
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
  else if (e.key === 'Escape') chiudiMenu();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.card[role="button"]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'photo') { const f = t.files && t.files[0]; t.value = ''; onPhoto(f); return; }
  if (t.id === 'attach') { const fs = [...(t.files || [])]; t.value = ''; addFiles(fs); return; }
  if (t.dataset.change === 'anY') { UI.anYear = +t.value; render(); return; }
  if (t.dataset.change === 'anM') { UI.anMonth = t.value; render(); return; }
  if (t.id === 'f_categoria') { const bb = $('#buyBox'); if (bb) bb.hidden = t.value !== 'materiale'; }
  if (t.id === 'addVoce') { const v = t.value; t.value = ''; aggiungiVoce(v); return; }
  if (t.id === 'f_urgApp') { t.dataset.touched = '1'; aggiornaTotali(); }
  if (t.id === 'f_urgenza') { const u = $('#f_urgApp'); if (u && !u.dataset.touched) { u.checked = t.value !== 'normale'; aggiornaTotali(); } }
  if (t.id === 'f_cnome') compilaCliente(t.value);
  if (t.id === 'f_cliente') { compilaDaRubrica(t.value); aggiornaCliInfo(); }
  if (t.id === 'f_mcliente') { compilaDaRubrica(t.value); aggiornaCliInfoModulo(); return; }
  if (t.name && t.name.startsWith('u_')) aggiornaRapporto(t);
  if (t.name === 'mc_tipo') { const o = t.closest('.mcampo').querySelector('[name="mc_opz"]'); o.hidden = !['scelta', 'tabella'].includes(t.value); o.placeholder = t.value === 'tabella' ? 'Colonne, separate da virgola' : 'Scelte, separate da virgola'; return; }
  if (t.id === 'pickCli') { const c = S.clienti.find(x => x.id === t.value); const target = $('#' + t.dataset.for); t.value = ''; if (c && target) { target.value = c.nome; if (target.id === 'f_cnome') compilaCliente(c.nome); else compilaDaRubrica(c.nome); aggiornaCliInfo(); if (target.id === 'f_mcliente') aggiornaCliInfoModulo(); } return; }
  if (t.id === 'f_calcolo') { cambiaCalcolo(t.value); return; }
  if (t.id === 'f_scontrini') { $('#wrapScG').hidden = t.value !== 'settimanale'; return; }
  if (t.id === 'f_gpausa' && $('#oreStd')) { $('#oreStd').textContent = num(oreGiornata({ inizio: $('#f_ginizio').value, fine: $('#f_gfine').value, pausa: t.value })) + ' ore'; return; }
  if (['f_data', 'f_dataFine', 'f_soloFeriali'].includes(t.id) && $('#giorniInfo')) { aggiornaGiorni(); aggiornaTotali(); }
  if (t.id === 'f_cmCliente') { disegnaListaCM(t.value); return; }
  if (t.classList && t.classList.contains('cmChk')) { aggiornaCM(); return; }
  if (t.closest && t.closest('#righeBox')) aggiornaTotali();
});
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'f_cliente' || t.id === 'f_cnome') aggiornaCliInfo();
  if (t.id === 'f_mcliente') { aggiornaCliInfoModulo(); return; }
  if (t.name && t.name.startsWith('u_')) { aggiornaRapporto(t); return; }
  if (t.id === 'cercaCantiere') { UI.cercaCant = t.value; const tmp = document.createElement('div'); tmp.innerHTML = rCantieri(); $('#listaCantieri').replaceWith(tmp.querySelector('#listaCantieri')); return; }
  if (t.id === 'cercaCliente') {
    UI.cerca = t.value;
    const tmp = document.createElement('div'); tmp.innerHTML = rClienti();
    $('#listaClienti').replaceWith(tmp.querySelector('#listaClienti'));
    return;
  }
  if (t.id === 'f_importo' || t.id === 'f_costo') { if ($('#righe .riga') || $('#f_calcolo')?.value === 'ore') t.dataset.auto = '0'; aggiornaTotali(); return; }
  if (t.id === 'f_pezzi') { t.dataset.auto = '0'; return; }
  if (t.id === 'f_ore') t.dataset.auto = '0';
  if (['f_data', 'f_dataFine'].includes(t.id) && $('#giorniInfo')) { aggiornaGiorni(); aggiornaTotali(); return; }
  if (['f_ginizio', 'f_gfine'].includes(t.id) && $('#oreStd')) { $('#oreStd').textContent = num(oreGiornata({ inizio: $('#f_ginizio').value, fine: $('#f_gfine').value, pausa: $('#f_gpausa').value })) + ' ore'; return; }
  if (['f_ore', 'f_tariffa', 'f_km', 'f_euroKm'].includes(t.id)) { aggiornaTotali(); return; }
  if (t.closest && t.closest('#righeBox')) aggiornaTotali();
});
caricaImmagini();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn(e));
render();

store.init().then(render);
