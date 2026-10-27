// Impaginazione di preventivi e consuntivi in PDF, nello stile del listino CASSERO.
import { PDF } from './pdf.js';
import { totali, prezzoUnitario, totaleRiga, ivaOf, UNITA, LISTINO_BASE, AZIENDA_BASE } from './listino.js';

const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const eur = n => EUR.format(+n || 0).replace(/ | /g, ' ');
const qtaFmt = n => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(+n || 0);
const dataIt = s => s ? s.split('-').reverse().join('/') : '';
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const C = { testo: '#1A1A1A', grigio: '#6B6B6B', bordo: '#BFBFBF', fondo: '#F2F2F2', riga: '#F8F8F8', rosso: '#C0161D', arancio: '#E8A317' };
const X0 = 18, X1 = 192, LARG = X1 - X0, TOP = 48, BOTTOM = 268;

/**
 * tipo: 'preventivo' | 'consuntivo'
 * doc: { numero, data, cliente:{nome,indirizzo,piva,email,telefono}, cantiere, oggetto, lavori, ore,
 *        righe, urgenza, urgenzaPct, iva, validita, note, condizioni }
 * immagini: { logo, posaclima, dekra } come Uint8Array JPEG (facoltative)
 */
export function creaDocumento({ tipo = 'preventivo', doc, azienda = AZIENDA_BASE, listino = LISTINO_BASE, immagini = {} }) {
  const az = { ...AZIENDA_BASE, ...(azienda || {}) };
  const L = listino || LISTINO_BASE;
  const pdf = new PDF();
  const img = {};
  for (const k of ['logo', 'posaclima', 'dekra']) if (immagini[k]) { try { img[k] = pdf.addJpeg(immagini[k]); } catch {} }

  const testata = () => {
    if (img.posaclima) pdf.image(img.posaclima, X0, 11, 21);
    if (img.logo) pdf.image(img.logo, 105 - 31, 13, 62);
    else pdf.text(105, 26, 'CASSERO INSTALLAZIONI', { size: 18, font: 'bold', align: 'center' });
    if (img.dekra) pdf.image(img.dekra, X1 - 18, 8, 18);
  };
  const nuovaPagina = () => { pdf.addPage(); testata(); return TOP; };
  testata();

  const T = totali(doc, L);
  const prev = tipo === 'preventivo';
  let y = TOP + 2;

  // Titolo e numero
  pdf.text(X0, y + 4, prev ? 'PREVENTIVO' : 'CONSUNTIVO', { size: 17, font: 'bold' });
  pdf.rect(X0, y + 7, 22, 1.1, { fill: C.arancio });
  const destra = [];
  if (doc.numero) destra.push([`N. ${doc.numero}`, 'bold', 11]);
  destra.push([`${prev ? 'Data' : 'Data lavori'}: ${dataIt(doc.data)}`, 'normal', 9.5]);
  if (prev && +doc.validita > 0) destra.push([`Valido fino al: ${dataIt(addDays(doc.data, +doc.validita))}`, 'normal', 9.5]);
  destra.forEach(([t, font, size], i) => pdf.text(X1, y + 1 + i * 5.2, t, { size, font, align: 'right', color: i ? C.grigio : C.testo }));
  y += 16;

  // Cliente e cantiere
  const cli = doc.cliente || {};
  const colW = 82;
  let yl = y, yr = y;
  pdf.text(X0, yl, prev ? 'SPETT.LE' : 'CLIENTE', { size: 7.5, font: 'bold', color: C.grigio }); yl += 5;
  yl = pdf.paragraph(X0, yl, cli.nome || '—', colW, { size: 11, font: 'bold' });
  for (const t of [cli.indirizzo, cli.piva && `P. IVA / C.F. ${cli.piva}`, cli.email, cli.telefono && `Tel. ${cli.telefono}`].filter(Boolean)) yl = pdf.paragraph(X0, yl, t, colW, { size: 9 });
  const xr = 110, wr = X1 - xr;
  if (doc.cantiere) { pdf.text(xr, yr, 'CANTIERE', { size: 7.5, font: 'bold', color: C.grigio }); yr = pdf.paragraph(xr, yr + 5, doc.cantiere, wr, { size: 9.5 }) + 2; }
  if (doc.oggetto) { pdf.text(xr, yr, prev ? 'OGGETTO' : 'LAVORI ESEGUITI', { size: 7.5, font: 'bold', color: C.grigio }); yr = pdf.paragraph(xr, yr + 5, doc.oggetto, wr, { size: 9.5 }) + 2; }
  if (!prev && +doc.ore > 0) { pdf.text(xr, yr, 'ORE IMPIEGATE', { size: 7.5, font: 'bold', color: C.grigio }); pdf.text(xr, yr + 5, qtaFmt(doc.ore), { size: 9.5 }); yr += 9; }
  y = Math.max(yl, yr) + 5;

  // Tabella
  const col = { descr: X0 + 2, qta: X0 + 110, um: X0 + 120, prezzo: X0 + 146, importo: X1 - 2 };
  const intestazione = () => {
    pdf.rect(X0, y, LARG, 7, { fill: C.fondo, stroke: C.bordo });
    const o = { size: 8, font: 'bold' };
    pdf.text(col.descr, y + 4.7, 'Descrizione', o);
    pdf.text(col.qta, y + 4.7, 'Q.tà', { ...o, align: 'right' });
    pdf.text(col.um, y + 4.7, 'U.M.', { ...o, align: 'center' });
    pdf.text(col.prezzo, y + 4.7, 'Prezzo unit.', { ...o, align: 'right' });
    pdf.text(col.importo, y + 4.7, 'Importo', { ...o, align: 'right' });
    y += 7;
  };
  intestazione();
  const righe = T.righe;
  if (!righe.length) {
    pdf.rect(X0, y, LARG, 9, { stroke: C.bordo });
    pdf.text(col.descr, y + 5.8, 'Nessuna voce inserita', { size: 9, color: C.grigio, font: 'italic' });
    y += 9;
  }
  righe.forEach((r, i) => {
    const descr = pdf.wrap(r.descr || 'Voce', 100, 9);
    const extra = [];
    if (r.blindato) extra.push(`compresa maggiorazione prodotto blindato ${eur(r.maggBlindato ?? L.maggBlindato)}/pz`);
    if (r.luce) extra.push(`compresa maggiorazione posa in luce ${eur(r.maggLuce ?? L.maggLuce)}/pz`);
    if (r.nota) extra.push(r.nota);
    const extraL = extra.flatMap(e => pdf.wrap(e, 100, 7.5, 'italic'));
    const h = Math.max(7.5, 3.2 + descr.length * 4.1 + extraL.length * 3.4 + 1.2);
    if (y + h > BOTTOM) { y = nuovaPagina(); intestazione(); }
    if (i % 2) pdf.rect(X0, y, LARG, h, { fill: C.riga });
    pdf.line(X0, y + h, X1, y + h, { color: C.bordo });
    pdf.line(X0, y, X0, y + h, { color: C.bordo }); pdf.line(X1, y, X1, y + h, { color: C.bordo });
    let ty = y + 4.9;
    descr.forEach(l => { pdf.text(col.descr, ty, l, { size: 9 }); ty += 4.1; });
    extraL.forEach(l => { pdf.text(col.descr, ty - 0.6, l, { size: 7.5, font: 'italic', color: C.grigio }); ty += 3.4; });
    const vuoto = r.prezzo === '' || r.prezzo == null;
    pdf.text(col.qta, y + 4.9, qtaFmt(r.qta), { size: 9, align: 'right' });
    pdf.text(col.um, y + 4.9, r.unita === 'corpo' ? 'corpo' : (UNITA[r.unita] || r.unita || ''), { size: 8.5, align: 'center', color: C.grigio });
    pdf.text(col.prezzo, y + 4.9, vuoto ? 'da concordare' : eur(prezzoUnitario(r, L)), { size: vuoto ? 7.8 : 9, align: 'right', color: vuoto ? C.grigio : C.testo, font: vuoto ? 'italic' : 'normal' });
    pdf.text(col.importo, y + 4.9, vuoto ? '—' : eur(totaleRiga(r, L)), { size: 9, align: 'right', font: 'bold' });
    y += h;
  });

  // Totali
  const tl = [];
  if (T.urgenzaPct) { tl.push(['Totale lavori', T.imponibileRighe]); tl.push([`Maggiorazione urgenza ${qtaFmt(T.urgenzaPct)}%`, T.urgenza]); }
  if (T.ivaPct > 0) { tl.push(['Imponibile', T.imponibile]); tl.push([T.ivaLabel, T.iva]); }
  const altezzaTot = tl.length * 6 + 12;
  if (y + 4 + altezzaTot > BOTTOM) y = nuovaPagina(); else y += 4;
  const tx = 116;
  tl.forEach(([l, v]) => { pdf.text(tx + 2, y + 4, l, { size: 9, color: C.grigio }); pdf.text(col.importo, y + 4, eur(v), { size: 9.5, align: 'right' }); y += 6; });
  pdf.rect(tx, y, X1 - tx, 9.5, { fill: C.fondo, stroke: C.bordo });
  pdf.rect(tx, y, 1.6, 9.5, { fill: C.arancio });
  pdf.text(tx + 4, y + 6.3, T.ivaPct > 0 ? 'TOTALE IVA COMPRESA' : 'TOTALE', { size: 9.5, font: 'bold' });
  pdf.text(col.importo, y + 6.4, eur(T.totale), { size: 12, font: 'bold', align: 'right' });
  y += 14;

  // Note
  const blocco = (titolo, testo, opt = {}) => {
    if (!testo) return;
    const linee = pdf.wrap(testo, LARG, opt.size || 8.5, opt.font || 'normal');
    const h = (titolo ? 5 : 0) + linee.length * (opt.size || 8.5) * 1.35 / (72 / 25.4) + 2.5;
    if (y + h > BOTTOM) y = nuovaPagina();
    if (titolo) { pdf.text(X0, y + 3, titolo, { size: 8.5, font: 'bold' }); y += 6.5; }
    y = pdf.paragraph(X0, y + 2, testo, LARG, { size: 8.5, color: C.testo, ...opt }) + 1;
  };
  blocco('', T.ivaNota, { font: 'italic', size: 8, color: C.grigio });
  blocco('Note', doc.note);
  const info = [];
  if (prev && +doc.validita > 0) info.push(`Validità dell'offerta: ${doc.validita} giorni dalla data del preventivo.`);
  info.push(`Pagamento: bonifico bancario all'emissione della fattura${az.iban ? ` – IBAN ${az.iban}` : ''}.`);
  blocco('', info.join('\n'), { size: 8.5 });
  const ora = (L.voci || []).find(v => v.id === 'ora');
  if (az.notaImprevisti) blocco('', az.notaImprevisti.toUpperCase() + (ora && ora.prezzo ? ` (${eur(ora.prezzo)}/ora)` : ''), { size: 7.8, font: 'bold', color: C.rosso });

  // Modulo: condizioni e firma
  if (prev && doc.condizioni && az.condizioni) {
    y += 3;
    if (y + 30 > BOTTOM) y = nuovaPagina();
    pdf.text(X0, y + 3, 'Termini e condizioni', { size: 10, font: 'bold' });
    pdf.line(X0, y + 4, X0 + pdf.width('Termini e condizioni', 10, 'bold'), y + 4, { width: 0.25 });
    y += 8;
    for (const sez of az.condizioni.split(/\n\s*\n/)) {
      const [titolo, ...corpo] = sez.trim().split('\n');
      const testo = corpo.join(' ').trim();
      const linee = pdf.wrap(testo, LARG, 8);
      const h = 4.5 + linee.length * 3.8 + 2.5;
      if (y + h > BOTTOM) y = nuovaPagina();
      pdf.text(X0, y + 3, titolo, { size: 8.5, font: 'bold' });
      y = pdf.paragraph(X0, y + 7, testo, LARG, { size: 8, lead: 1.33 }) + 1.2;
    }
  }
  if (prev) {
    const frase = doc.condizioni ? 'Il Cliente dichiara di aver letto e accettato il presente preventivo e i termini e le condizioni sopra riportati.' : 'Per accettazione del presente preventivo.';
    if (y + 24 > BOTTOM) y = nuovaPagina();
    y = Math.max(y + 4, BOTTOM - 20);
    pdf.paragraph(X0, y, frase, LARG, { size: 8.5, font: 'italic', color: C.grigio });
    y += 12;
    pdf.text(X0, y, 'Luogo e data', { size: 9 }); pdf.line(X0 + 21, y + 0.6, X0 + 72, y + 0.6, { width: 0.25 });
    pdf.text(100, y, 'Firma per accettazione', { size: 9 }); pdf.line(136, y + 0.6, X1, y + 0.6, { width: 0.25 });
  }

  // Piè di pagina su tutte le pagine
  const n = pdf.pageNo;
  for (let p = 1; p <= n; p++) {
    pdf.setPage(p);
    pdf.text(X0, 281, az.ragioneSociale, { size: 7.8 });
    pdf.text(X0, 284.6, [az.piva && `P. Iva ${az.piva}`, az.indirizzo].filter(Boolean).join(' · '), { size: 7.8 });
    pdf.text(X1, 281, az.email || '', { size: 7.8, align: 'right' });
    pdf.text(X1, 284.6, az.telefono || '', { size: 7.8, align: 'right' });
    if (n > 1) pdf.text(105, 290, `Pagina ${p} di ${n}`, { size: 7, color: C.grigio, align: 'center' });
  }
  return pdf.output({ title: `${prev ? 'Preventivo' : 'Consuntivo'} ${doc.numero || ''} ${cli.nome || ''}`.trim(), author: az.ragioneSociale });
}

/** Trasforma una posa o un intervento del calendario nel documento del consuntivo. */
export function docDaLavoro(x, tipoLavoro, azienda) {
  const L = tipoLavoro === 'lavori';
  const righe = (x.righe || []).length ? x.righe : (+(L ? x.importo : x.costo) > 0 ? [{ descr: L ? `Posa in opera${x.installato ? ' – ' + x.installato : ''}` : `Intervento${x.descrizione ? ' – ' + x.descrizione : ''}`, unita: 'corpo', qta: 1, prezzo: +(L ? x.importo : x.costo) }] : []);
  return {
    data: L ? x.data : (x.dataProg || x.data),
    cliente: { nome: x.cliente, telefono: x.telefono || '' },
    cantiere: x.indirizzo,
    oggetto: L ? x.installato : x.descrizione,
    ore: x.ore,
    righe,
    urgenza: !!x.urgenzaApplicata,
    urgenzaPct: x.urgenzaPct,
    iva: x.iva ?? (azienda && azienda.ivaPredefinita) ?? '22',
    note: x.note || '',
  };
}
