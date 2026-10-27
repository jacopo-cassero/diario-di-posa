import { MESI, AMM, STATI, URG, CAT, SCAD, oggi, pd, iso, n2, sum, slug, eur, promemoria, leggiScontrino } from './logica.js';
import { LISTINO_BASE, AZIENDA_BASE, IVA, ivaOf, totali, totaleRiga, prezzoUnitario, rigaDaVoce, prossimoNumero } from './listino.js';
import { creaDocumento, docDaLavoro } from './documento.js';
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
};
const svg = (k, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${ICON[k]}</svg>`;

/* ---------- stato ---------- */
const CFG = window.DIARIO_CONFIG || {};
const store = createStore(CFG, () => render());
const S = store.S;
const UI = { tab: 'cal', month: TODAY.slice(0, 7), day: TODAY, intFilter: 'aperti', prevFilter: 'aperti', sel: null, calCli: null, cerca: '', cliTipo: 'tutti', cliOrd: 'recenti', seg: 'mov', cMonth: TODAY.slice(0, 7), anYear: +TODAY.slice(0, 4), anMonth: 'all', authView: 'login', authMsg: '', authErr: '' };
const TABS = [['cal', 'Calendario', 'cal'], ['int', 'Interventi', 'int'], ['prev', 'Preventivi', 'prev'], ['cli', 'Clienti', 'cli'], ['conti', 'Conti', 'conti'], ['van', 'Furgone', 'van'], ['an', 'Analisi', 'an']];
function readHash() {
  const h = location.hash.slice(1);
  if (TABS.some(t => t[0] === h) || h === 'set') UI.tab = h;
  if (h === 'fatture') { UI.tab = 'conti'; UI.seg = 'fatt'; }
  if (h === 'magazzino') { UI.tab = 'conti'; UI.seg = 'mag'; }
}
readHash();
window.addEventListener('hashchange', () => { readHash(); render(); });

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
  $('#tabsNav').hidden = !logged;
  $('#settingsBtn').hidden = !logged;
  $('#tabs').innerHTML = TABS.map(([k, l, i]) => `<button class="tab" data-act="tab" data-arg="${k}" aria-current="${UI.tab === k}">${svg(i)}${l}</button>`).join('');
  const pend = store.pending();
  $('#sync').innerHTML = st.mode === 'demo' ? '<span class="st off">Prova</span>'
    : !logged ? '' : !st.online ? `<span class="st off">Offline${pend ? ' · ' + pend + ' da inviare' : ''}</span>`
    : st.syncing || pend ? '<span class="st busy">Sincronizzo</span>' : '<span class="st">Sincronizzato</span>';
  $('#matlist').innerHTML = S.magazzino.map(m => `<option value="${esc(m.nome)}"></option>`).join('');
  $('#clilist').innerHTML = [...new Set([...S.clienti.map(c => c.nome), ...[...S.lavori, ...S.interventi].map(x => x.cliente)].filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(c => `<option value="${esc(c)}"></option>`).join('');

  if (st.auth === 'checking') { $('#main').innerHTML = '<div class="empty" style="margin-top:20px">Caricamento…</div>'; return; }
  if (st.auth === 'out' || st.auth === 'recovery') { $('#main').innerHTML = rAuth(); return; }

  let h = '';
  if (st.mode === 'demo') h += `<div class="notice">Modalità prova: i dati restano solo su questo dispositivo. Dopo il collegamento al database si sincronizzano su tutti i tuoi dispositivi.</div>`;
  if (st.error) h += `<div class="notice">${esc(st.error)}</div>`;
  h += ({ cal: rCal, int: rInt, prev: rPrev, cli: rClienti, conti: rConti, van: rVan, an: rAn, set: rSet })[UI.tab]();
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
      ${v === 'login' ? `<button class="linkbtn" data-act="authView" data-arg="signup" type="button">Prima volta? Crea l'account</button><button class="linkbtn" data-act="authView" data-arg="reset" type="button">Password dimenticata</button>` : ''}
      ${v === 'signup' || v === 'reset' ? `<button class="linkbtn" data-act="authView" data-arg="login" type="button">Ho già un account: accedi</button>` : ''}
    </div>
    <p class="small muted">I tuoi dati sono visibili solo a te, su tutti i dispositivi in cui accedi con questa email.</p>
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
const cliDi = x => (x.clienteId && S.clienti.find(c => c.id === x.clienteId)) || trovaCliente(x.cliente);
const chipCli = x => { const c = cliDi(x); return c && c.tipo && c.tipo !== 'finale' ? ` <span class="chip ${c.tipo === 'rivenditore' ? 'in' : 'warn'} small">${tipoCliente(c.tipo)}</span>` : ''; };
const linkCli = x => { const c = cliDi(x); return c ? `<button type="button" class="linkbtn" data-act="editCli" data-id="${c.id}">Scheda cliente</button>` : ''; };
function lavoroCard(l) {
  const a = ammOf(l.amm);
  const mats = (l.materiali || []).filter(m => m.nome);
  const cart = S.cartelle.find(c => c.id === l.cartellaId);
  const nAll = (l.allegati || []).length;
  return `<div class="card" role="button" tabindex="0" data-act="editLav" data-id="${l.id}">
    <div class="row between"><span class="t">${esc(l.cliente || 'Cliente')}${chipCli(l)}</span><span class="price">${n2(l.importo) ? eur(l.importo) : ''}</span></div>
    ${l.indirizzo ? `<div class="addr">${esc(l.indirizzo)}</div>` : ''}
    ${l.installato ? `<div>${esc(l.installato)}</div>` : ''}
    <div class="meta">${n2(l.pezzi) ? `<span><b class="num">${num(l.pezzi, 0)}</b> pezzi</span>` : ''}${n2(l.ore) ? `<span><b class="num">${num(l.ore)}</b> ore</span>` : ''}<span class="chip ${a[2]}">${a[1]}</span>${l.esempio ? '<span class="chip ex">esempio</span>' : ''}</div>
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
    const nl = LAV.filter(l => l.data === k).length;
    const ints = INT.filter(i => (i.dataProg || '') === k);
    cells += `<button class="day ${k === TODAY ? 'today' : ''} ${dow >= 5 ? 'we' : ''} ${UI.sel && UI.sel.has(k) ? 'sel' : ''}" data-act="day" data-arg="${k}" aria-pressed="${k === UI.day}" aria-label="${fmtD(k)}" type="button"><span class="n">${d}</span><span class="marks">${'<i class="mk"></i>'.repeat(Math.min(nl, 3))}${ints.map(i => `<i class="mk int ${i.stato === 'completato' ? 'done' : ''}"></i>`).slice(0, 2).join('')}</span></button>`;
  }
  const ml = LAV.filter(l => (l.data || '').startsWith(UI.month));
  const dl = LAV.filter(l => l.data === UI.day);
  const di = INT.filter(i => i.dataProg === UI.day);
  const empty = !S.lavori.length && !S.interventi.length && !S.movimenti.length;
  return `${rTodo()}
  ${empty ? `<div class="empty"><b>Il diario è vuoto.</b><span>Tocca un giorno e segna la prima posa, oppure carica alcuni dati di esempio per vedere come funziona. Gli esempi si cancellano con un tocco.</span><button class="btn" data-act="seed" type="button">Carica dati di esempio</button></div>` : ''}
  <section class="stack">
    <div class="cal-head"><button class="iconbtn" data-act="month" data-arg="-1" aria-label="Mese precedente" type="button">${svg('l')}</button><h2>${monthName(UI.month)}</h2><button class="iconbtn" data-act="month" data-arg="1" aria-label="Mese successivo" type="button">${svg('r')}</button></div>
    ${cc ? `<div class="selbar"><div><b>Calendario di ${esc(cc.nome)}</b><div class="small">${LAV.length} ${LAV.length === 1 ? 'posa' : 'pose'} · ${INT.length} ${INT.length === 1 ? 'intervento' : 'interventi'} · solo i suoi lavori</div></div><div class="row"><button class="btn sm" data-act="editCli" data-id="${cc.id}" type="button">Scheda</button><button class="btn sm dark" data-act="calTutti" type="button">Mostra tutti</button></div></div>` : ''}
    <div class="cal">${cells}</div>
    <div class="legend"><span><i class="mk"></i> posa</span><span><i class="mk int"></i> intervento</span><span><i class="mk int done"></i> intervento fatto</span><span class="num">${ml.length} pose · ${num(sum(ml, l => l.ore))} h · ${eur(sum(ml, l => l.importo))}</span></div>
    ${barraSelezione()}
  </section>
  <section class="stack">
    <div class="row between"><h3>${fmtD(UI.day, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
      <div class="row"><button class="btn sm" data-act="newInt" data-arg="${UI.day}" type="button">+ Intervento</button><button class="btn primary sm" data-act="newLav" type="button">${svg('plus')} Posa</button></div></div>
    ${dl.map(lavoroCard).join('')}${di.map(intCard).join('')}
    ${!dl.length && !di.length ? `<div class="empty small">Nessun lavoro segnato in questo giorno.</div>` : ''}
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
  return `<div class="row between"><h2>Analisi</h2><div class="row">
    <select id="anY" data-change="anY" aria-label="Anno" class="btn sm">${yrs.map(y => `<option ${+y === UI.anYear ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <select id="anM" data-change="anM" aria-label="Mese" class="btn sm"><option value="all">Tutto l'anno</option>${MESI.map((m, i) => { const v = String(i + 1).padStart(2, '0'); return `<option value="${v}" ${UI.anMonth === v ? 'selected' : ''}>${m}</option>`; }).join('')}</select></div></div>
  <div class="kpis"><div class="kpi"><div class="l">Entrate</div><div class="v">${eur(entr)}</div></div><div class="kpi"><div class="l">Uscite</div><div class="v">${eur(usc)}</div></div><div class="kpi ${utile >= 0 ? 'pos' : 'neg'}"><div class="l">Utile</div><div class="v">${eur(utile)}</div></div><div class="kpi"><div class="l">Resa oraria</div><div class="v">${ore ? eur(utile / ore) : '—'}</div></div></div>
  <div class="small muted num">${lav.length} pose · ${ints.length} interventi chiusi · ${num(ore)} ore lavorate · ${num(sum(lav, l => l.pezzi), 0)} serramenti posati</div>
  <section class="panel stack"><div class="row between"><h3>Mese per mese ${UI.anYear}</h3><div class="legend"><span><i class="swatch" style="background:var(--in)"></i> entrate</span><span><i class="swatch" style="background:var(--tape)"></i> uscite</span></div></div>${ch}</section>
  <section class="panel stack"><h3>Dove vanno i soldi</h3>${byCat.length ? `<div class="bars">${byCat.map(([k, v]) => `<div><div class="bar-l"><span>${esc(catName(k))}</span><span class="num">${eur(v)} · ${num(v / usc * 100, 0)}%</span></div><div class="bar-t"><div class="bar-f ${k === 'materiale' ? 'tape' : ''}" style="width:${v / maxC * 100}%"></div></div></div>`).join('')}</div>` : '<div class="small muted">Nessuna spesa nel periodo.</div>'}</section>
  <section class="stack"><div class="row between"><h3>Quanto incide il materiale</h3><span class="chip ${incMed > 15 ? 'warn' : 'ok'} num">media ${num(incMed)}%</span></div>
    <div class="small muted">Costo del materiale usato in ogni posa (al costo medio di magazzino) rispetto a quanto incassato. Nel periodo: <b class="num">${eur(sum(inc, x => x.c))}</b> di materiale.</div>
    ${inc.length ? `<div class="tbl-wrap"><table><thead><tr><th>Cantiere</th><th class="r">Incasso</th><th class="r">Materiale</th><th class="r">Incidenza</th><th class="r">€ / ora</th></tr></thead><tbody>${inc.sort((a, b) => String(b.l.data).localeCompare(a.l.data)).slice(0, 15).map(x => `<tr><td>${fmtD(x.l.data, { day: 'numeric', month: 'short' })} · ${esc(x.l.cliente)}</td><td class="r num">${eur(x.l.importo)}</td><td class="r num">${eur(x.c)}</td><td class="r num">${num(x.p)}%</td><td class="r num">${n2(x.l.ore) ? eur((n2(x.l.importo) - x.c) / n2(x.l.ore)) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty small">Segna importo e materiale usato nelle pose per vedere l\'incidenza.</div>'}
  </section>
  ${clientiPrincipali(lav, ints)}
  <section class="stack"><h3>Consumo e ordini materiale</h3>
    ${matRows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Materiale</th><th class="r">Usato</th><th class="r">Comprato</th><th class="r">Ordini</th><th class="r">Ordini ogni</th><th>Ultimo</th></tr></thead><tbody>${matRows.map(r => `<tr><td><b>${esc(r.s.nome)}</b></td><td class="r num">${num(r.used)} ${esc(r.s.unita)}</td><td class="r num">${num(r.bought)} ${esc(r.s.unita)}</td><td class="r num">${r.ordini}</td><td class="r num">${r.ogni !== null ? r.ogni + ' gg' : '—'}</td><td class="num">${r.ultimo ? fmtD(r.ultimo, { day: 'numeric', month: 'short' }) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty small">Qui vedrai quanto materiale usi e ogni quanti giorni lo riordini, appena registri acquisti e pose.</div>'}
  </section>
  <div class="row"><button class="btn sm" data-act="csv" data-arg="movimenti" type="button">Esporta spese (CSV)</button><button class="btn sm" data-act="csv" data-arg="lavori" type="button">Esporta lavori (CSV)</button></div>
  <div class="small muted">I file CSV si aprono con Excel o Numbers: utili per il commercialista.</div>`;
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
  <section class="stack"><h3>Notifiche</h3><div class="panel stack">
    ${ps === 'granted' ? `<div class="row between"><span>Notifiche attive su questo dispositivo. Ogni mattina ricevi le cose da fare.</span><button class="btn sm" data-act="pushTest" type="button">Riattiva</button></div>`
      : ps === 'install' ? `<div><b>Prima aggiungi l'app alla schermata Home.</b> Su iPhone e iPad le notifiche funzionano solo così:</div><ol class="ios-steps"><li>In Safari tocca il pulsante <b>Condividi</b> (il quadrato con la freccia).</li><li>Scegli <b>Aggiungi alla schermata Home</b>.</li><li>Apri l'app dall'icona e torna qui.</li></ol>`
      : ps === 'notready' ? `<div class="small muted">Le notifiche si attivano dopo il collegamento al database (vedi la guida di installazione).</div>`
      : ps === 'denied' ? `<div class="small">Hai bloccato le notifiche. Riattivale da Impostazioni › Notifiche › Posa.</div>`
      : ps === 'unsupported' ? `<div class="small muted">Questo browser non supporta le notifiche.</div>`
      : `<div class="row between"><span>Ricevi ogni mattina scadenze del furgone, fatture e lavori del giorno dopo.</span><button class="btn primary sm" data-act="pushOn" type="button">Attiva notifiche</button></div>`}
  </div></section>
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
function separaKm(righe) { const r = righe || []; const k = r.find(x => x.voce === 'km'); return { km: k ? n2(k.qta) : '', euro: k ? n2(k.prezzo) : euroKm(), altre: r.filter(x => x.voce !== 'km') }; }
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
    ${F('Data', inp('data', l.data, 'date', 'required'))}
    ${F('Indirizzo cantiere', inp('indirizzo', l.indirizzo, 'text', 'placeholder="Via, civico, comune"'))}
    ${F('Calcolo della giornata', sel('calcolo', [['pezzo', 'A pezzo · voci del listino'], ['ore', 'A ore · tariffa oraria']], calcolo))}
    <div class="g3">
      ${F('Ore impiegate', inp('ore', l.ore, 'number'))}
      <label class="f" id="wrapPezzi" ${calcolo === 'ore' ? 'hidden' : ''}><span>Pezzi posati</span>${inp('pezzi', l.pezzi, 'number')}</label>
      <label class="f" id="wrapTariffa" ${calcolo === 'ore' ? '' : 'hidden'}><span>Tariffa €/ora</span>${inp('tariffa', tariffa, 'number')}</label>
      ${F('Importo €', inp('importo', l.importo, 'number'))}
    </div>
    ${impHint()}
    ${kmBox(KM.km, KM.euro)}
    <div id="modoPezzo" ${calcolo === 'ore' ? 'hidden' : ''}>${righeBox(calcolo === 'ore' ? [] : KM.altre, 'lav')}</div>
    <div class="notice small" id="modoOre" ${calcolo === 'ore' ? '' : 'hidden'}>Importo = ore impiegate × tariffa oraria + trasferta.</div>
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
    righe = conKm(righe, fd);
    if (n2(fd.get('km')) > 0) installato = [installato, `trasferta ${num(n2(fd.get('km')), 1)} km`].filter(Boolean).join(', ');
    const d = { data: fd.get('data'), cliente: fd.get('cliente').trim(), indirizzo: fd.get('indirizzo').trim(), calcolo: modo, installato, pezzi, ore, importo: n2(fd.get('importo')), righe, materiali: mats, amm: fd.get('amm'), note: fd.get('note').trim(), cartellaId: fd.get('cartellaId') || '', cartellaUrl: fd.get('cartellaUrl').trim(), allegati: sheetFiles };
    if (l.preventivoId) d.preventivoId = l.preventivoId;
    if (l.esempio) d.esempio = true;
    if (!isNew) moveStock(l.materiali, +1);
    moveStock(mats, -1);
    d.clienteId = assicuraCliente(d.cliente);
    const id = store.put('lavori', isNew ? null : l.id, d);
    if (isNew && d.preventivoId) {
      const p = S.preventivi.find(x => x.id === d.preventivoId);
      if (p) store.put('preventivi', p.id, { ...stripId(p), stato: 'accettato', lavoroId: id });
    }
    UI.day = d.data; UI.month = d.data.slice(0, 7);
    toast('Posa salvata');
  }, {
    del: isNew ? null : async () => { moveStock(l.materiali, +1); for (const f of l.allegati || []) store.removeFile(f.path).catch(() => {}); store.drop('lavori', l.id); toast('Posa eliminata'); },
    extra: isNew ? '' : `<button type="button" class="btn" data-act="cons" data-arg="lavori" data-id="${l.id}">Consuntivo</button>`,
  });
  const pz = $('#f_pezzi');
  if (pz) pz.dataset.auto = !n2(l.pezzi) || Math.abs(n2(l.pezzi) - contaPezzi(l.righe)) < 0.01 ? '1' : '0';
  const imp = $('#f_importo');
  if (calcolo === 'ore') { imp.dataset.auto = !n2(l.importo) || Math.abs(n2(l.importo) - n2(l.ore) * tariffa - n2(KM.km) * KM.euro) < 0.01 ? '1' : '0'; aggiornaTotali(); }
  else initImporto('#f_importo', l.righe, l.importo);
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
    store.put('interventi', isNew ? null : i.id, d);
    toast('Intervento salvato');
  }, {
    del: isNew ? null : async () => { moveStock(i.materiali, +1); for (const f of i.allegati || []) store.removeFile(f.path).catch(() => {}); store.drop('interventi', i.id); toast('Intervento eliminato'); },
    extra: isNew || i.stato !== 'completato' ? '' : `<button type="button" class="btn" data-act="cons" data-arg="interventi" data-id="${i.id}">Consuntivo</button>`,
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
  const trasf = Math.round(n2($('#f_km')?.value) * n2($('#f_euroKm')?.value) * 100) / 100;
  let target = t.imponibile + trasf, conVoci = righe.length > 0 || trasf > 0;
  if (kind !== 'prev' && trasf > 0) {
    $('#totBox').innerHTML = (righe.length ? h.replace('Totale (IVA esclusa)', 'Totale voci') : '') + `<div class="tl"><span>Trasferta ${num(n2($('#f_km').value), 1)} km × ${eur(n2($('#f_euroKm').value))}</span><span class="price">${eur(trasf)}</span></div><div class="tl big"><span>Totale (IVA esclusa)</span><span class="price">${eur(target)}</span></div>`;
  }
  if (kind === 'lav' && $('#f_calcolo')?.value === 'ore') {
    target = Math.round((n2($('#f_ore')?.value) * n2($('#f_tariffa')?.value) + trasf) * 100) / 100; conVoci = target > 0;
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
  const isNew = !p, az = AZ();
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
  const lav = S.lavori.filter(mio), int = S.interventi.filter(mio), prev = S.preventivi.filter(mio);
  const fatt = [...lav.map(x => ({ imp: n2(x.importo), d: x.data, amm: x.amm })), ...int.filter(i => i.stato === 'completato').map(x => ({ imp: n2(x.costo), d: x.dataProg || x.data, amm: x.amm }))].filter(x => x.d && x.d <= TODAY);
  return {
    lav, int, prev,
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
    ...s.lav.map(l => ({ d: l.data, h: voce(l.data, 'Posa', l.installato, l.importo, `<span class="chip ${ammOf(l.amm)[2]}">${ammOf(l.amm)[1]}</span>`, 'editLav', l.id) })),
    ...s.int.map(i => ({ d: i.dataProg || i.data, h: voce(i.dataProg || i.data, 'Intervento', i.descrizione, i.costo, `<span class="chip ${(STATI.find(x => x[0] === (i.stato || 'aperto')) || STATI[0])[2]}">${(STATI.find(x => x[0] === (i.stato || 'aperto')) || STATI[0])[1]}</span>`, 'editInt', i.id) })),
  ].sort((a, b) => String(b.d).localeCompare(String(a.d)));
  cliCtx = isNew ? null : c;
  openSheet(isNew ? 'Nuovo cliente' : c.nome, `
    ${isNew ? '' : `<div class="kpis"><div class="kpi"><div class="l">Lavorato</div><div class="v">${eur(s.fatturato)}</div></div><div class="kpi"><div class="l">Quest'anno</div><div class="v">${eur(s.anno)}</div></div><div class="kpi"><div class="l">Da incassare</div><div class="v">${eur(s.aperto)}</div></div><div class="kpi"><div class="l">Ultimo lavoro</div><div class="v">${s.ultimo ? fmtD(s.ultimo, { day: 'numeric', month: 'short' }) : '—'}</div></div></div>
    <div class="row">${c.telefono ? `<a class="btn sm" href="tel:${esc(c.telefono.replace(/\s/g, ''))}">Chiama</a><a class="btn sm" href="https://wa.me/${esc(c.telefono.replace(/\D/g, '').replace(/^(?!39)(?=3)/, '39'))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}">Email</a>` : ''}${c.indirizzo ? `<a class="btn sm" href="https://maps.apple.com/?q=${encodeURIComponent(c.indirizzo)}" target="_blank" rel="noopener">Mappa</a>` : ''}</div>
    <div class="row"><button class="btn sm dark" data-act="cliCal" type="button">${svg('cal', 'i')} Vedi nel calendario</button><button class="btn sm primary" data-act="cliPrev" type="button">+ Preventivo</button><button class="btn sm" data-act="cliLav" type="button">+ Posa</button><button class="btn sm" data-act="cliInt" type="button">+ Intervento</button></div>
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
  return true;
}

/* ---------- consuntivo di più giorni ---------- */
function lavoriSel() {
  const set = UI.sel || new Set(), out = [];
  S.lavori.filter(l => set.has(l.data)).forEach(x => out.push({ x, kind: 'lavori', d: x.data }));
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
    case 'logout': await store.logout(); UI.tab = 'cal'; render(); break;
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
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
  if (t.id === 'f_urgApp') t.dataset.touched = '1';
  if (t.id === 'f_urgenza') { const u = $('#f_urgApp'); if (u && !u.dataset.touched) { u.checked = t.value !== 'normale'; aggiornaTotali(); } }
  if (t.id === 'f_cnome') compilaCliente(t.value);
  if (t.id === 'f_cliente') { compilaDaRubrica(t.value); aggiornaCliInfo(); }
  if (t.id === 'pickCli') { const c = S.clienti.find(x => x.id === t.value); const target = $('#' + t.dataset.for); t.value = ''; if (c && target) { target.value = c.nome; if (target.id === 'f_cnome') compilaCliente(c.nome); else compilaDaRubrica(c.nome); aggiornaCliInfo(); } return; }
  if (t.id === 'f_calcolo') { cambiaCalcolo(t.value); return; }
  if (t.id === 'f_cmCliente') { disegnaListaCM(t.value); return; }
  if (t.classList && t.classList.contains('cmChk')) { aggiornaCM(); return; }
  if (t.closest && t.closest('#righeBox')) aggiornaTotali();
});
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'f_cliente' || t.id === 'f_cnome') aggiornaCliInfo();
  if (t.id === 'cercaCliente') {
    UI.cerca = t.value;
    const tmp = document.createElement('div'); tmp.innerHTML = rClienti();
    $('#listaClienti').replaceWith(tmp.querySelector('#listaClienti'));
    return;
  }
  if (t.id === 'f_importo' || t.id === 'f_costo') { if ($('#righe .riga') || $('#f_calcolo')?.value === 'ore') t.dataset.auto = '0'; aggiornaTotali(); return; }
  if (t.id === 'f_pezzi') { t.dataset.auto = '0'; return; }
  if (['f_ore', 'f_tariffa', 'f_km', 'f_euroKm'].includes(t.id)) { aggiornaTotali(); return; }
  if (t.closest && t.closest('#righeBox')) aggiornaTotali();
});
caricaImmagini();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn(e));
render();
store.init().then(render);
