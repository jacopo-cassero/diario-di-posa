// Moduli compilabili: modelli pronti, modelli personalizzati e stampa in PDF.
import { PDF } from './pdf.js';
import { AZIENDA_BASE } from './listino.js';

// tipi di campo: titolo, testo, testolungo, numero, data, si_no, scelta, check, tabella, firma, nota
// auto: valore iniziale preso dal cliente o dal lavoro (indirizzo, data, lavori, telefono, descrizione, ore, posatore)
const C = (id, tipo, label, extra = {}) => ({ id, tipo, label, ...extra });
export const TIPI_CAMPO = [
  ['titolo', 'Titolo di sezione'], ['testo', 'Testo breve'], ['testolungo', 'Testo lungo'], ['numero', 'Numero'], ['data', 'Data'],
  ['si_no', 'Sì / No'], ['scelta', 'Scelta da elenco'], ['check', 'Casella da spuntare'], ['tabella', 'Tabella'], ['firma', 'Firma'], ['nota', 'Testo fisso'],
];

export const MODELLI_BASE = [
  { id: 'fine-lavori', nome: 'Verbale di fine lavori e consegna', descr: 'Controlli alla consegna, riserve del cliente e firme', campi: [
    C('ind', 'testo', 'Indirizzo del cantiere', { auto: 'indirizzo' }),
    C('data', 'data', 'Data', { auto: 'data' }),
    C('lavori', 'testolungo', 'Lavori eseguiti', { auto: 'lavori' }),
    C('t1', 'titolo', 'Controlli alla consegna'),
    C('c1', 'check', 'Apertura e chiusura di tutte le ante verificate'),
    C('c2', 'check', 'Regolazioni, ferramenta e guarnizioni verificate'),
    C('c3', 'check', 'Sigillature e finiture completate'),
    C('c4', 'check', 'Avvolgibili, zanzariere e accessori funzionanti'),
    C('c5', 'check', 'Cantiere pulito e materiale di risulta rimosso'),
    C('c6', 'check', "Istruzioni d'uso e manutenzione consegnate"),
    C('riserve', 'testolungo', 'Osservazioni o riserve del cliente'),
    C('n1', 'nota', 'Con la firma il Cliente dichiara di aver visionato i lavori e di riceverli in consegna, salvo le riserve sopra indicate.'),
    C('f1', 'firma', 'Firma del posatore'), C('f2', 'firma', 'Firma del cliente'),
  ] },
  { id: 'rilievo', nome: 'Rilievo misure e sopralluogo', descr: 'Accesso al cantiere, muratura e misure delle aperture', campi: [
    C('ind', 'testo', 'Indirizzo', { auto: 'indirizzo' }),
    C('data', 'data', 'Data', { auto: 'data' }),
    C('tel', 'testo', 'Telefono', { auto: 'telefono' }),
    C('t1', 'titolo', 'Accesso al cantiere'),
    C('piano', 'testo', 'Piano'), C('asc', 'si_no', 'Ascensore'), C('furg', 'si_no', 'Furgone parcheggiabile vicino'),
    C('mur', 'scelta', 'Tipo di muratura', { opzioni: ['Laterizio', 'Cemento armato', 'Legno', 'Cartongesso', 'Pietra', 'Altro'] }),
    C('ctl', 'si_no', 'Controtelaio presente'), C('smont', 'si_no', 'Smontaggio dei vecchi serramenti'),
    C('t2', 'titolo', 'Misure'),
    C('aperture', 'tabella', 'Aperture', { colonne: ['Locale', 'Tipo', 'Largh. mm', 'Alt. mm', 'Note'] }),
    C('note', 'testolungo', 'Note'),
    C('f1', 'firma', 'Firma del tecnico'),
  ] },
  { id: 'corretta-posa', nome: 'Dichiarazione di corretta posa', descr: 'Tipo di posa, materiali usati e dichiarazione del posatore', campi: [
    C('ind', 'testo', 'Indirizzo del cantiere', { auto: 'indirizzo' }),
    C('data', 'data', 'Data', { auto: 'data' }),
    C('prod', 'testolungo', 'Serramenti posati', { auto: 'lavori' }),
    C('tipo', 'scelta', 'Tipo di posa', { opzioni: ['In luce', 'A filo muro', 'In mazzetta', 'Su controtelaio', 'Su telaio esistente'] }),
    C('t1', 'titolo', 'Materiali utilizzati'),
    C('m1', 'check', 'Nastro autoespandente'), C('m2', 'check', 'Schiuma poliuretanica'), C('m3', 'check', 'Sigillante siliconico'),
    C('m4', 'check', 'Membrane o nastri barriera al vapore'), C('m5', 'check', 'Fissaggi meccanici (viti, tasselli, zanche)'),
    C('n1', 'nota', 'Il sottoscritto dichiara che la posa in opera dei serramenti sopra indicati è stata eseguita a regola d\'arte, secondo le indicazioni del produttore e i principi della norma UNI 11673-1.'),
    C('pos', 'testo', 'Posatore', { auto: 'posatore' }),
    C('qual', 'testo', 'Qualifica', { valore: 'Installatore/Posatore Caposquadra EQF 4 – UNI 11673-2:2019 (certificazione DEKRA)' }),
    C('f1', 'firma', 'Firma del posatore'),
  ] },
  { id: 'intervento', nome: 'Verbale di intervento', descr: 'Problema, lavoro eseguito, esito e firma del cliente', campi: [
    C('ind', 'testo', 'Indirizzo', { auto: 'indirizzo' }),
    C('data', 'data', 'Data', { auto: 'data' }),
    C('prob', 'testolungo', 'Problema segnalato', { auto: 'descrizione' }),
    C('fatto', 'testolungo', 'Intervento eseguito'),
    C('mat', 'testo', 'Materiali utilizzati'),
    C('ore', 'numero', 'Ore', { auto: 'ore' }),
    C('esito', 'scelta', 'Esito', { opzioni: ['Risolto', 'Da ricontrollare', 'Serve un nuovo intervento'] }),
    C('f1', 'firma', 'Firma del cliente'),
  ] },
];

const dataIt = s => s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : (s || '');
function jpegDaDataUrl(u) {
  const m = String(u || '').match(/^data:image\/jpeg;base64,(.+)$/); if (!m) return null;
  const bin = atob(m[1]); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

/** PDF di un modulo compilato. mod = { titolo, campi, valori, cliente, clienteDati, data } */
export function creaModulo({ mod, azienda, immagini = {} }) {
  const az = { ...AZIENDA_BASE, ...(azienda || {}) };
  const pdf = new PDF();
  const X0 = 15, X1 = 195, LARG = X1 - X0, TOP = 36, BOTTOM = 276;
  const COL = { testo: '#1A1A1A', grigio: '#6B6B6B', bordo: '#BFBFBF', fondo: '#F2F2F2', arancio: '#E8A317' };
  const img = {};
  for (const k of ['logo', 'posaclima', 'dekra']) if (immagini[k]) { try { img[k] = pdf.addJpeg(immagini[k]); } catch {} }
  const testata = () => {
    if (img.posaclima) pdf.image(img.posaclima, X0, 9, 17);
    if (img.logo) pdf.image(img.logo, 105 - 26, 10, 52); else pdf.text(105, 21, 'CASSERO INSTALLAZIONI', { size: 18, font: 'bold', align: 'center' });
    if (img.dekra) pdf.image(img.dekra, X1 - 14.5, 7, 14.5);
  };
  testata();
  let y = TOP;
  const spazio = h => { if (y + h > BOTTOM) { pdf.addPage(); testata(); y = TOP; } };

  // titolo e cliente
  const tl = pdf.wrap(String(mod.titolo || 'Modulo').toUpperCase(), 130, 15, 'bold');
  tl.forEach((l, i) => pdf.text(X0, y + 5 + i * 6.2, l, { size: 15, font: 'bold' }));
  pdf.rect(X0, y + 7.5 + (tl.length - 1) * 6.2, 22, 1.1, { fill: COL.arancio });
  if (mod.data) pdf.text(X1, y + 4, `Data: ${dataIt(mod.data)}`, { size: 9.5, align: 'right', color: COL.grigio });
  y += 12 + (tl.length - 1) * 6.2;
  const cd = mod.clienteDati || {};
  if (mod.cliente) {
    pdf.text(X0, y + 3, 'CLIENTE', { size: 7, font: 'bold', color: COL.grigio });
    pdf.text(X0, y + 8, mod.cliente, { size: 10.5, font: 'bold' });
    const extra = [cd.indirizzo, [cd.piva && `P. IVA / C.F. ${cd.piva}`, cd.telefono && `Tel. ${cd.telefono}`].filter(Boolean).join(' · ')].filter(Boolean);
    extra.forEach((t, i) => pdf.text(X0, y + 12.5 + i * 4, t, { size: 8.5 }));
    y += 12 + extra.length * 4 + 2;
  }
  y += 2;

  const campi = mod.campi || [], v = mod.valori || {};
  for (let i = 0; i < campi.length; i++) {
    const c = campi[i], val = v[c.id];
    if (c.tipo === 'titolo') {
      spazio(14); y += 2;
      pdf.rect(X0, y, LARG, 6.4, { fill: COL.fondo });
      pdf.rect(X0, y, 1.6, 6.4, { fill: COL.arancio });
      pdf.text(X0 + 4, y + 4.4, c.label.toUpperCase(), { size: 8.5, font: 'bold' });
      y += 9;
    } else if (c.tipo === 'nota') {
      const h = pdf.wrap(c.label, LARG, 8.5, 'italic').length * 4.1 + 3; spazio(h);
      y = pdf.paragraph(X0, y + 3.5, c.label, LARG, { size: 8.5, font: 'italic', color: '#333333', lead: 1.35 }) + 1.5;
    } else if (c.tipo === 'check') {
      spazio(6.5);
      pdf.rect(X0, y + 0.6, 4, 4, { stroke: '#555555', width: 0.3 });
      if (val) { pdf.line(X0 + 0.8, y + 2.7, X0 + 1.8, y + 3.9, { width: 0.6 }); pdf.line(X0 + 1.8, y + 3.9, X0 + 3.4, y + 1.2, { width: 0.6 }); }
      pdf.text(X0 + 6.5, y + 3.8, c.label, { size: 9.2, color: val ? COL.testo : COL.grigio });
      y += 6.3;
    } else if (c.tipo === 'testolungo') {
      const testo = String(val || '').trim() || '—';
      const lines = pdf.wrap(testo, LARG - 4, 9);
      spazio(8 + Math.min(lines.length, 6) * 4.2);
      pdf.text(X0, y + 3, c.label, { size: 7.5, font: 'bold', color: COL.grigio });
      y += 5;
      for (const l of lines) { spazio(4.4); pdf.text(X0 + 2, y + 3.4, l, { size: 9 }); y += 4.3; }
      pdf.line(X0, y + 1, X1, y + 1, { color: COL.bordo }); y += 3.5;
    } else if (c.tipo === 'tabella') {
      const cols = c.colonne || ['Voce'];
      const righe = (Array.isArray(val) ? val : []).filter(r => r.some(x => String(x || '').trim()));
      spazio(16);
      pdf.text(X0, y + 3, c.label, { size: 7.5, font: 'bold', color: COL.grigio }); y += 5;
      const w = LARG / cols.length;
      const head = () => { pdf.rect(X0, y, LARG, 6, { fill: COL.fondo, stroke: COL.bordo }); cols.forEach((h, j) => pdf.text(X0 + j * w + 1.5, y + 4.1, h, { size: 7.8, font: 'bold' })); y += 6; };
      head();
      (righe.length ? righe : [cols.map(() => '')]).forEach(r => {
        const celle = cols.map((_, j) => pdf.wrap(String(r[j] || ''), w - 3, 8.6));
        const h = Math.max(6, 2.4 + Math.max(...celle.map(x => x.length)) * 3.7);
        if (y + h > BOTTOM) { pdf.addPage(); testata(); y = TOP; head(); }
        pdf.rect(X0, y, LARG, h, { stroke: COL.bordo });
        for (let j = 1; j < cols.length; j++) pdf.line(X0 + j * w, y, X0 + j * w, y + h, { color: COL.bordo });
        celle.forEach((ls, j) => ls.forEach((l, k) => pdf.text(X0 + j * w + 1.5, y + 4.1 + k * 3.7, l, { size: 8.6 })));
        y += h;
      });
      y += 3;
    } else if (c.tipo === 'firma') {
      // due firme vicine sulla stessa riga
      const coppia = campi[i + 1] && campi[i + 1].tipo === 'firma' ? [c, campi[i + 1]] : [c];
      spazio(34);
      const w = coppia.length === 2 ? (LARG - 10) / 2 : 85;
      coppia.forEach((f, j) => {
        const x = X0 + j * (w + 10);
        pdf.text(x, y + 4, f.label, { size: 8, color: COL.grigio });
        const b = jpegDaDataUrl(v[f.id]);
        if (b) { try { const n = pdf.addJpeg(b); pdf.image(n, x, y + 6, null, 20); } catch {} }
        pdf.line(x, y + 27, x + w, y + 27, { width: 0.3 });
      });
      if (coppia.length === 2) i++;
      y += 32;
    } else {
      // testo, numero, data, si_no, scelta: etichetta e valore sulla stessa riga
      const testo = c.tipo === 'data' ? dataIt(val) : c.tipo === 'si_no' ? (val === 'si' ? 'Sì' : val === 'no' ? 'No' : '—') : (String(val ?? '').trim() || '—');
      const lines = pdf.wrap(testo, LARG - 62, 9.2);
      spazio(4 + lines.length * 4.3);
      pdf.text(X0, y + 3.8, c.label, { size: 8.5, color: COL.grigio });
      lines.forEach((l, k) => pdf.text(X0 + 60, y + 3.8 + k * 4.3, l, { size: 9.2, font: k === 0 && testo !== '—' ? 'bold' : 'normal' }));
      y += 2 + lines.length * 4.3;
      pdf.line(X0, y + 0.6, X1, y + 0.6, { color: '#E2E2E2' }); y += 2;
    }
  }

  const n = pdf.pageNo;
  for (let p = 1; p <= n; p++) {
    pdf.setPage(p);
    pdf.text(X0, 283, az.ragioneSociale, { size: 7.8 });
    pdf.text(X0, 286.6, [az.piva && `P. Iva ${az.piva}`, az.indirizzo].filter(Boolean).join(' · '), { size: 7.8 });
    pdf.text(X1, 283, az.email || '', { size: 7.8, align: 'right' });
    pdf.text(X1, 286.6, az.telefono || '', { size: 7.8, align: 'right' });
    if (n > 1) pdf.text(105, 291, `Pagina ${p} di ${n}`, { size: 7, color: COL.grigio, align: 'center' });
  }
  return pdf.output({ title: `${mod.titolo || 'Modulo'} ${mod.cliente || ''}`.trim(), author: az.ragioneSociale });
}

/* ---------- moduli CASSERO: stessi PDF degli originali, compilati dall'app ---------- */
import { POSIZIONI } from './moduli-posizioni.js';

const OPZ_TIPO_M = POSIZIONI['scheda-manutenzione'].campi.serr1_tipo.opz;
const OPZ_TIPO_C = POSIZIONI['verbale-collaudo'].campi.prod1_tipo.opz;
const righe4 = (pref, tipo) => [1, 2, 3, 4].map(i => [`${pref}${i}_tipo`, `${pref}${i}_qta`, `${pref}${i}_ambiente`, `${pref}${i}_note`]);

export const MODELLI_UFFICIALI = [
  { id: 'rapporto-assistenza', ufficiale: true, nome: 'Rapporto di assistenza', descr: 'Serramenti, porte, zanzariere, persiane, avvolgibili', sezioni: [
    { titolo: '', campi: [{ n: 'data_intervento', t: 'data', l: 'Data intervento', auto: 'data' }] },
    { titolo: '1. Dati cliente', campi: [
      { n: 'cliente', t: 'testo', l: 'Cliente / ragione sociale', auto: 'cliente', full: 1 },
      { n: 'cf', t: 'testo', l: 'Cod. fiscale', auto: 'cf' }, { n: 'piva', t: 'testo', l: 'P.IVA', auto: 'piva' },
      { n: 'tel', t: 'testo', l: 'Tel. / cell.', auto: 'telefono', tipo: 'tel' }, { n: 'sdi', t: 'testo', l: 'SDI', auto: 'sdi' },
      { n: 'indirizzo', t: 'testo', l: 'Indirizzo', auto: 'indirizzo', full: 1 },
      { n: 'email', t: 'testo', l: 'E-mail', auto: 'email', tipo: 'email' }, { n: 'pec', t: 'testo', l: 'PEC', auto: 'pec' },
    ] },
    { titolo: '2. Lavoro eseguito / note tecniche', campi: [{ n: 'lavoro_eseguito', t: 'testolungo', l: 'Lavoro eseguito / note tecniche', auto: 'descrizione', full: 1 }] },
    { titolo: '3. Lavoro da completare', campi: [{ n: 'da_completare', t: 'testolungo', l: 'Lavoro da completare', full: 1 }] },
    { titolo: '4. Orario', campi: [{ n: 'ora_inizio', t: 'ora', l: "Ora d'inizio" }, { n: 'ora_fine', t: 'ora', l: 'Ora di fine' }, { n: 'tempo', t: 'testo', l: 'Tempo impiegato', full: 1 }] },
    { titolo: '5. Costi intervento', campi: [
      { n: 'costo_chiamata', t: 'euro', l: 'Diritto di chiamata (70 € compresa la prima ora lavorativa)', def: '70,00', full: 1 },
      { n: 'costo_manodopera', t: 'euro', l: 'Manodopera (tariffa oraria 35,00 €/ora)', full: 1 },
      { n: 'costo_trasferta', t: 'euro', l: 'Trasferta (1,00 €/km)', full: 1 },
      { n: 'costo_materiali', t: 'euro', l: 'Materiali / ricambi', full: 1 },
      { n: 'costo_totale', t: 'euro', l: 'Totale', full: 1, calc: 1 },
    ] },
    { titolo: '6. Esito e completamento intervento', campi: [
      { n: 'esito_completato', t: 'check', l: 'Lavoro completato' }, { n: 'esito_da_completare', t: 'check', l: 'Lavoro da completare' }, { n: 'esito_preventivo', t: 'check', l: 'Necessario preventivo / ricambi' },
      { t: 'nota', l: "Il cliente conferma che l'intervento sopra descritto è stato eseguito e prende visione delle lavorazioni indicate nel presente rapporto." },
      { n: 'data_completamento', t: 'data', l: 'Data completamento lavori' },
    ] },
    { titolo: '7. Firme', campi: [{ n: 'firma_tecnico', t: 'firma', l: 'Firma tecnico / posatore' }, { n: 'firma_cliente', t: 'firma', l: 'Firma cliente' }] },
    { titolo: '8. Metodo di pagamento', campi: [{ n: 'pag_contanti', t: 'check', l: 'Contanti' }, { n: 'pag_bonifico', t: 'check', l: 'Bonifico' }, { n: 'pag_pos', t: 'check', l: 'POS' }, { n: 'pag_satispay', t: 'check', l: 'Satispay' }] },
  ] },
  { id: 'scheda-manutenzione', ufficiale: true, nome: 'Scheda di manutenzione', descr: 'Pacchetto manutenzione serramenti', sezioni: [
    { titolo: '', campi: [{ n: 'data_intervento', t: 'data', l: 'Data intervento', auto: 'data' }, { n: 'prossima_manutenzione', t: 'data', l: 'Prossima manutenzione consigliata', auto: 'traUnAnno' }] },
    { titolo: '1. Dati cliente', campi: [
      { n: 'cliente', t: 'testo', l: 'Cliente / ragione sociale', auto: 'cliente', full: 1 },
      { n: 'tel', t: 'testo', l: 'Tel. / cell.', auto: 'telefono', tipo: 'tel' }, { n: 'email', t: 'testo', l: 'E-mail', auto: 'email', tipo: 'email' },
      { n: 'indirizzo', t: 'testo', l: 'Indirizzo intervento', auto: 'indirizzo', full: 1 },
      { n: 'n_serramenti', t: 'testo', l: 'N. serramenti trattati', auto: 'pezzi' },
    ] },
    { titolo: '2. Serramenti controllati', campi: [{ t: 'griglia', col: [{ l: 'Tipologia', t: 'scelta', opz: OPZ_TIPO_M }, { l: 'Q.tà', t: 'numero' }, { l: 'Ambiente / posizione' }, { l: 'Note (modello, anno, stato)' }], righe: righe4('serr') }] },
    { titolo: '3. Controlli eseguiti', campi: [{ t: 'controlli', opz: [['OK', 'OK'], ['SISTEMATO', 'Sistemato'], ['DA_SOSTITUIRE', 'Sostituire']], gruppi: [
      { l: '01 Pulizia e lubrificazione', righe: [['controllo_01', 'Pulizia telai e canaline di scolo'], ['controllo_02', 'Lubrificazione ferramenta'], ['controllo_03', 'Pulizia binari e scorrevoli']] },
      { l: '02 Regolazione ante', righe: [['controllo_04', 'Regolazione ante e chiusure'], ['controllo_05', 'Maniglie e serrature'], ['controllo_06', 'Allineamento e squadratura']] },
      { l: '03 Guarnizioni', righe: [['controllo_07', 'Guarnizioni di battuta e vetro'], ['controllo_08', 'Sigillature perimetrali'], ['controllo_09', "Tenuta all'aria e all'acqua"]] },
      { l: '04 Avvolgibili e zanzariere', righe: [['controllo_10', 'Cinghie, molle e rulli'], ['controllo_11', 'Motori e comandi'], ['controllo_12', 'Zanzariere: rete, molle e guide']] },
    ] }, { t: 'nota', l: 'Lasciare vuote le voci non presenti sui serramenti trattati.' }] },
    { titolo: '4. Stato generale', campi: [{ n: 'stato_generale', t: 'radio', l: 'Stato generale', opz: [['BUONO', 'Buono'], ['DISCRETO', 'Discreto'], ['DA_RIVEDERE', 'Da rivedere']], full: 1 }] },
    { titolo: '5. Materiali sostituiti e consigli', campi: [{ n: 'materiali_note', t: 'testolungo', l: 'Materiali sostituiti e consigli', full: 1 }] },
    { titolo: '6. Importo e pagamento', campi: [{ n: 'importo', t: 'euro', l: 'Importo €' }, { n: 'pag_contanti', t: 'check', l: 'Contanti' }, { n: 'pag_bonifico', t: 'check', l: 'Bonifico' }, { n: 'pag_pos', t: 'check', l: 'POS' }, { n: 'pag_satispay', t: 'check', l: 'Satispay' }] },
    { titolo: '7. Firme', campi: [{ n: 'firma_tecnico', t: 'firma', l: 'Firma tecnico' }, { n: 'firma_cliente', t: 'firma', l: 'Firma cliente' }] },
  ] },
  { id: 'verbale-collaudo', ufficiale: true, nome: 'Verbale di collaudo finale', descr: 'Posa serramenti e complementi · posa qualificata UNI 11673-2', sezioni: [
    { titolo: '', campi: [{ n: 'data_fine_posa', t: 'data', l: 'Data fine posa', auto: 'dataLavoro' }, { n: 'data_collaudo', t: 'data', l: 'Data collaudo', auto: 'oggi' }] },
    { titolo: '1. Dati cliente e cantiere', campi: [
      { n: 'cliente', t: 'testo', l: 'Cliente / ragione sociale', auto: 'cliente', full: 1 },
      { n: 'tel', t: 'testo', l: 'Tel. / cell.', auto: 'telefono', tipo: 'tel' }, { n: 'email', t: 'testo', l: 'E-mail', auto: 'email', tipo: 'email' },
      { n: 'indirizzo_cantiere', t: 'testo', l: 'Indirizzo cantiere', auto: 'indirizzo', full: 1 },
      { n: 'rif_ordine', t: 'testo', l: 'Rif. ordine / preventivo', auto: 'rif' },
    ] },
    { titolo: '2. Prodotti installati', campi: [{ t: 'griglia', col: [{ l: 'Tipologia', t: 'scelta', opz: OPZ_TIPO_C }, { l: 'Q.tà', t: 'numero' }, { l: 'Ambiente / posizione' }, { l: 'Note (modello, colore, misure)' }], righe: righe4('prod'), auto: 'prodotti' }] },
    { titolo: '3. Verifiche eseguite', campi: [{ t: 'controlli', opz: [['OK', 'OK'], ['NON_OK', 'Non OK'], ['NA', 'N.A.']], gruppi: [{ l: '', righe: [
      ['verifica_01', 'Fissaggio e stabilità del telaio'], ['verifica_02', 'Piombo, livello e squadra'], ['verifica_03', 'Sigillatura e isolamento del giunto'],
      ['verifica_04', 'Apertura, chiusura e regolazione ante'], ['verifica_05', 'Ferramenta, maniglie e serrature'], ['verifica_06', 'Tenuta guarnizioni'],
      ['verifica_07', 'Integrità vetri e superfici'], ['verifica_08', 'Avvolgibili, persiane e zanzariere'], ['verifica_09', 'Motorizzazioni / automatismi'],
      ['verifica_10', 'Finiture: coprifili, davanzali, raccordi'], ['verifica_11', 'Pulizia e rimozione imballi'], ['verifica_12', 'Funzionamento generale']] }] }] },
    { titolo: '4. Documentazione consegnata', campi: [{ n: 'doc_manuale', t: 'check', l: "Manuale d'uso e manutenzione" }, { n: 'doc_garanzia', t: 'check', l: 'Certificato di garanzia' }, { n: 'doc_dop', t: 'check', l: 'Dichiarazione di prestazione / CE' }, { n: 'doc_chiavi', t: 'check', l: 'Chiavi, telecomandi, accessori' }] },
    { titolo: '5. Anomalie, riserve e note', campi: [{ n: 'anomalie', t: 'testolungo', l: 'Anomalie, riserve e note', full: 1 }] },
    { titolo: '6. Esito del collaudo', campi: [{ n: 'esito', t: 'radio', l: 'Esito del collaudo', opz: [['POSITIVO', 'Collaudo positivo'], ['RISERVE', 'Positivo con riserve (vedi sez. 5)'], ['NEGATIVO', 'Collaudo negativo']], full: 1 },
      { t: 'nota', l: "Il collaudo è stato eseguito alla presenza del cliente. Con la firma il cliente dichiara di aver verificato le opere sopra elencate e di accettarle secondo l'esito indicato, fatte salve le riserve annotate e gli eventuali vizi non riconoscibili al momento del collaudo." }] },
    { titolo: '7. Firme', campi: [{ n: 'firma_tecnico', t: 'firma', l: 'Firma tecnico / posatore' }, { n: 'firma_cliente', t: 'firma', l: 'Firma cliente' }] },
  ] },
  { id: 'consenso-foto-video', ufficiale: true, nome: 'Consenso foto e video', descr: 'Riprese dei lavori in casa e uso su Facebook e Instagram', sezioni: [
    { titolo: '', campi: [{ n: 'luogo', t: 'testo', l: 'Luogo', auto: 'comune' }, { n: 'data', t: 'data', l: 'Data', auto: 'oggi' }] },
    { titolo: '1. Dati del cliente', campi: [
      { n: 'nome', t: 'testo', l: 'Nome e cognome', auto: 'cliente', full: 1 },
      { n: 'tel', t: 'testo', l: 'Telefono', auto: 'telefono', tipo: 'tel' }, { n: 'email', t: 'testo', l: 'E-mail', auto: 'email', tipo: 'email' },
      { n: 'indirizzo', t: 'testo', l: 'Indirizzo dove si svolgono i lavori', auto: 'indirizzo', full: 1 },
    ] },
    { titolo: '2. Cosa ti chiedo', campi: [{ t: 'nota', l: 'Durante i lavori vorrei scattare foto e girare brevi video dei serramenti installati, per mostrare il mio lavoro sulle pagine Facebook e Instagram di Cassero Installazioni. In particolare:\n• riprendo solo i lavori: serramenti, porte, tapparelle, zanzariere e le fasi di posa;\n• non mostro mai indirizzo, numero civico, targhe, documenti, foto di famiglia o oggetti che permettano di riconoscere te o la casa;\n• non riprendo minori;\n• se scegli di non comparire, nelle riprese non si vedranno il tuo volto né si sentirà la tua voce;\n• il consenso è gratuito e facoltativo: se non acconsenti, il lavoro si svolge esattamente nello stesso modo.' }] },
    { titolo: '3. Le tue scelte', campi: [
      { n: 'consenso_riprese', t: 'radio', l: 'Foto e video dei lavori in casa mia', opz: [['SI', 'Acconsento'], ['NO', 'Non acconsento']], full: 1 },
      { n: 'comparire', t: 'radio', l: 'Se vengo ripreso, voglio comparire?', opz: [['SI', 'Sì, posso comparire'], ['NO', 'No, non voglio comparire']], full: 1 },
      { n: 'nome_tag', t: 'radio', l: 'Nome o tag nei post', opz: [['SI', 'Sì'], ['NO', 'No, nessun nome']], full: 1 },
    ] },
    { titolo: '4. Informativa privacy (art. 13 Regolamento UE 2016/679)', campi: [{ t: 'nota', l: "• Titolare del trattamento: Cassero Installazioni di Jacopo Andrea Cassero, C.F. CSSJPN98C13A182L, P.IVA 02809200062, info@casseroinstallazioni.it, cell. 328 0180313.\n• Finalità: pubblicazione di foto e video dei lavori sulle pagine Facebook e Instagram dell'attività, a scopo promozionale.\n• Base giuridica: il tuo consenso (art. 6.1.a GDPR), dato anche ai sensi degli artt. 10 c.c. e 96-97 L. 633/1941 sull'uso dell'immagine.\n• Conservazione: i contenuti restano pubblicati e archiviati finché non revochi il consenso.\n• Revoca: puoi revocare il consenso in qualsiasi momento, senza motivo e senza costi, scrivendo via e-mail o WhatsApp. Rimuoverò i contenuti dalle mie pagine; la revoca non rende illecito quanto pubblicato prima. Non posso controllare copie o condivisioni fatte da altri utenti.\n• Comunicazione: i dati non vengono ceduti a terzi; foto e video sono visibili al pubblico sulle piattaforme indicate, che trattano i contenuti secondo le proprie condizioni.\n• I tuoi diritti: accesso, rettifica, cancellazione, limitazione e opposizione (artt. 15-22 GDPR), e reclamo al Garante per la protezione dei dati personali (garanteprivacy.it)." }] },
    { titolo: '5. Firma del cliente', campi: [{ t: 'nota', l: "Dichiaro di aver letto l'informativa e di esprimere liberamente le scelte indicate nella sezione 3." }, { n: 'firma_cliente', t: 'firma', l: 'Firma del cliente' }] },
  ] },
];

/** Tutti i nomi dei campi di un modulo CASSERO, con il loro tipo. */
export function campiUfficiali(m) {
  const out = [];
  for (const s of m.sezioni) for (const c of s.campi) {
    if (c.t === 'griglia') c.righe.forEach(r => r.forEach((n, j) => out.push({ n, t: c.col[j].t || 'testo' })));
    else if (c.t === 'controlli') c.gruppi.forEach(g => g.righe.forEach(([n]) => out.push({ n, t: 'radio' })));
    else if (c.n) out.push(c);
  }
  return out;
}

const fmtVal = (c, v) => {
  if (v == null || v === '') return '';
  if (c.t === 'data') return dataIt(v);
  if (c.t === 'euro') { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x.toFixed(2).replace('.', ',') : String(v); }
  return String(v);
};

/** PDF del modulo CASSERO: lo sfondo originale con i valori scritti nelle caselle. */
export function creaModuloUfficiale({ mod, modello, sfondo }) {
  const pos = POSIZIONI[modello.id].campi;
  const pdf = new PDF();
  const PT = 72 / 25.4, HPT = 841.89;
  if (sfondo) { try { pdf.image(pdf.addJpeg(sfondo), 0, 0, 210, 297); } catch {} }
  const box = r => ({ x: r[0] / PT, y: (HPT - r[3]) / PT, w: (r[2] - r[0]) / PT, h: (r[3] - r[1]) / PT });
  const segno = r => { const b = box(r); const p = Math.min(b.w, b.h); const x = b.x + (b.w - p) / 2, y = b.y + (b.h - p) / 2; pdf.line(x + p * .2, y + p * .55, x + p * .42, y + p * .78, { width: .55, color: '#1A1A1A' }); pdf.line(x + p * .42, y + p * .78, x + p * .82, y + p * .22, { width: .55, color: '#1A1A1A' }); };
  const v = mod.valori || {};
  for (const c of campiUfficiali(modello)) {
    const p = pos[c.n]; if (!p) continue;
    const val = v[c.n];
    if (c.t === 'check') { if (val) segno(p.r); continue; }
    if (c.t === 'radio') { if (val && p.opz && p.opz[val]) segno(p.opz[val]); continue; }
    if (c.t === 'firma') {
      const m = String(val || '').match(/^data:image\/jpeg;base64,(.+)$/); if (!m) continue;
      const b = box(p.r);
      pdf.rect(b.x + .5, b.y + .5, b.w - 1, b.h - 1, { fill: p.fondo || '#FFF8E6' });
      try {
        const bin = atob(m[1]); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        const im = pdf.addJpeg(a); const info = pdf.images.find(x => x.name === im);
        const sc = Math.min((b.w - 3) / info.w, (b.h - 3) / info.h);
        const w = info.w * sc, h = info.h * sc;
        pdf.image(im, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
      } catch {}
      continue;
    }
    const testo = fmtVal(c, val); if (!testo) continue;
    const b = box(p.r);
    let fs = p.fs || 10;
    const pad = 1.3;
    if (p.ml) {
      let lines; const lh = s => s * 1.22 / PT;
      for (; fs > 6; fs -= .5) { lines = pdf.wrap(testo, b.w - pad * 2, fs); if (lines.length * lh(fs) <= b.h - 1.5) break; }
      lines = pdf.wrap(testo, b.w - pad * 2, fs);
      const max = Math.floor((b.h - 1.5) / lh(fs));
      lines.slice(0, max).forEach((l, i) => pdf.text(b.x + pad, b.y + 1 + fs * .95 / PT + i * lh(fs), l, { size: fs }));
    } else {
      while (fs > 6 && pdf.width(testo, fs) > b.w - pad * 2) fs -= .5;
      let t = testo; while (t.length > 1 && pdf.width(t, fs) > b.w - pad * 2) t = t.slice(0, -1);
      pdf.text(c.t === 'euro' ? b.x + b.w - pad : b.x + pad, b.y + b.h / 2 + fs * .35 / PT, t, { size: fs, align: c.t === 'euro' ? 'right' : 'left' });
    }
  }
  return pdf.output({ title: `${modello.nome} ${mod.cliente || ''}`.trim(), author: 'CASSERO INSTALLAZIONI' });
}
