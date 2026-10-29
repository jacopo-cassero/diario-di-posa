// Impaginazione di preventivi e consuntivi in PDF, nello stile del listino CASSERO.
import { PDF } from './pdf.js';
import { totali, prezzoUnitario, totaleRiga, ivaOf, UNITA, LISTINO_BASE, AZIENDA_BASE, rigaSconto, baseSconto } from './listino.js';

const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const eur = n => EUR.format(+n || 0).replace(/ | /g, ' ');
const qtaFmt = n => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(+n || 0);
const dataIt = s => s ? s.split('-').reverse().join('/') : '';
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const C = { testo: '#1A1A1A', grigio: '#6B6B6B', bordo: '#BFBFBF', fondo: '#F2F2F2', riga: '#F8F8F8', rosso: '#C0161D', arancio: '#E8A317' };
const X0 = 15, X1 = 195, LARG = X1 - X0, TOP = 36, BOTTOM = 274;

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
    if (img.posaclima) pdf.image(img.posaclima, X0, 9, 17);
    if (img.logo) pdf.image(img.logo, 105 - 26, 10, 52);
    else pdf.text(105, 21, 'CASSERO INSTALLAZIONI', { size: 18, font: 'bold', align: 'center' });
    if (img.dekra) pdf.image(img.dekra, X1 - 14.5, 7, 14.5);
  };
  const nuovaPagina = () => { pdf.addPage(); testata(); return TOP; };
  testata();

  const T = totali(doc, L);
  const prev = tipo === 'preventivo';
  let y = TOP;

  // Titolo e numero
  pdf.text(X0, y + 4, prev ? 'PREVENTIVO' : 'CONSUNTIVO', { size: 17, font: 'bold' });
  pdf.rect(X0, y + 7, 22, 1.1, { fill: C.arancio });
  const destra = [];
  if (doc.numero) destra.push([`N. ${doc.numero}`, 'bold', 11]);
  if (!prev && doc.dataFine && doc.dataFine !== doc.data) destra.push([`Lavori dal ${dataIt(doc.data)} al ${dataIt(doc.dataFine)}`, 'normal', 9.5]);
  else destra.push([`${prev ? 'Data' : 'Data lavori'}: ${dataIt(doc.data)}`, 'normal', 9.5]);
  if (prev && +doc.validita > 0) destra.push([`Valido fino al: ${dataIt(addDays(doc.data, +doc.validita))}`, 'normal', 9.5]);
  destra.forEach(([t, font, size], i) => pdf.text(X1, y + 1 + i * 5.2, t, { size, font, align: 'right', color: i ? C.grigio : C.testo }));
  y += 16;

  // Cliente e cantiere
  const cli = doc.cliente || {};
  const colW = 82;
  let yl = y, yr = y;
  pdf.text(X0, yl, prev ? 'SPETT.LE' : 'CLIENTE', { size: 7, font: 'bold', color: C.grigio }); yl += 4.5;
  yl = pdf.paragraph(X0, yl, cli.nome || '—', colW, { size: 10.5, font: 'bold', lead: 1.25 });
  for (const t of [cli.indirizzo, [cli.piva && `P. IVA / C.F. ${cli.piva}`, cli.telefono && `Tel. ${cli.telefono}`].filter(Boolean).join(' · '), cli.email].filter(Boolean)) yl = pdf.paragraph(X0, yl, t, colW, { size: 8.5, lead: 1.25 });
  const xr = 110, wr = X1 - xr;
  if (doc.cantiere) { pdf.text(xr, yr, 'CANTIERE', { size: 7, font: 'bold', color: C.grigio }); yr = pdf.paragraph(xr, yr + 4.5, doc.cantiere, wr, { size: 9, lead: 1.25 }) + 1.5; }
  if (doc.oggetto) { pdf.text(xr, yr, prev ? 'OGGETTO' : 'LAVORI ESEGUITI', { size: 7, font: 'bold', color: C.grigio }); yr = pdf.paragraph(xr, yr + 4.5, doc.oggetto, wr, { size: 9, lead: 1.25 }) + 1.5; }
  if (!prev && +doc.ore > 0) { pdf.text(xr, yr, 'ORE IMPIEGATE', { size: 7.5, font: 'bold', color: C.grigio }); pdf.text(xr, yr + 5, qtaFmt(doc.ore), { size: 9.5 }); yr += 9; }
  y = Math.max(yl, yr) + 3;

  // Tabella
  const col = { descr: X0 + 2, qta: X0 + 114, um: X0 + 125, prezzo: X0 + 152, importo: X1 - 2 };
  const intestazione = () => {
    pdf.rect(X0, y, LARG, 6, { fill: C.fondo, stroke: C.bordo });
    const o = { size: 7.8, font: 'bold' };
    pdf.text(col.descr, y + 4.1, 'Descrizione', o);
    pdf.text(col.qta, y + 4.1, 'Q.tà', { ...o, align: 'right' });
    pdf.text(col.um, y + 4.1, 'U.M.', { ...o, align: 'center' });
    pdf.text(col.prezzo, y + 4.1, 'Prezzo unit.', { ...o, align: 'right' });
    pdf.text(col.importo, y + 4.1, 'Importo', { ...o, align: 'right' });
    y += 6;
  };
  intestazione();
  const righe = T.righe;
  if (!righe.length) {
    pdf.rect(X0, y, LARG, 9, { stroke: C.bordo });
    pdf.text(col.descr, y + 5.8, 'Nessuna voce inserita', { size: 9, color: C.grigio, font: 'italic' });
    y += 9;
  }
  // con più giornate, ogni giornata ha la sua intestazione nella tabella
  const baseTutto = baseSconto((doc.righe || []).filter(r => r.descr || r.prezzo), L);
  const elenco = doc.gruppi ? doc.gruppi.flatMap(g => [{ gruppo: g.titolo }, ...(g.righe || []).filter(r => r.descr || r.prezzo).map(r => r.voce === 'sconto' ? rigaSconto(r, baseTutto) : r)]) : righe;
  let ir = 0;
  elenco.forEach(r => {
    if (r.gruppo) {
      const hg = 5.8;
      if (y + hg + 6 > BOTTOM) { y = nuovaPagina(); intestazione(); }
      pdf.rect(X0, y, LARG, hg, { fill: '#FFF3D1', stroke: C.bordo });
      pdf.text(col.descr, y + 4, r.gruppo, { size: 8, font: 'bold' });
      y += hg; ir = 0; return;
    }
    const i = ir++;
    const descr = pdf.wrap(r.descr || 'Voce', 104, 8.8);
    const extra = [];
    if (r.blindato) extra.push(`compresa maggiorazione prodotto blindato ${eur(r.maggBlindato ?? L.maggBlindato)}/pz`);
    if (r.luce) extra.push(`compresa maggiorazione posa in luce ${eur(r.maggLuce ?? L.maggLuce)}/pz`);
    if (r.nota) extra.push(r.nota);
    const extraL = extra.flatMap(e => pdf.wrap(e, 104, 7.2, 'italic'));
    const h = Math.max(6, 2.4 + descr.length * 3.8 + extraL.length * 3.1 + 0.9);
    if (y + h > BOTTOM) { y = nuovaPagina(); intestazione(); }
    if (i % 2) pdf.rect(X0, y, LARG, h, { fill: C.riga });
    pdf.line(X0, y + h, X1, y + h, { color: C.bordo });
    pdf.line(X0, y, X0, y + h, { color: C.bordo }); pdf.line(X1, y, X1, y + h, { color: C.bordo });
    const by = y + 4.2;
    let ty = by;
    descr.forEach(l => { pdf.text(col.descr, ty, l, { size: 8.8 }); ty += 3.8; });
    extraL.forEach(l => { pdf.text(col.descr, ty - 0.7, l, { size: 7.2, font: 'italic', color: C.grigio }); ty += 3.1; });
    const vuoto = r.prezzo === '' || r.prezzo == null;
    const sc = r.voce === 'sconto';
    if (!sc) {
      pdf.text(col.qta, by, qtaFmt(r.qta), { size: 8.8, align: 'right' });
      pdf.text(col.um, by, r.unita === 'corpo' ? 'corpo' : (UNITA[r.unita] || r.unita || ''), { size: 8.2, align: 'center', color: C.grigio });
      pdf.text(col.prezzo, by, vuoto ? 'da concordare' : eur(prezzoUnitario(r, L)), { size: vuoto ? 7.6 : 8.8, align: 'right', color: vuoto ? C.grigio : C.testo, font: vuoto ? 'italic' : 'normal' });
    }
    pdf.text(col.importo, by, vuoto ? '—' : eur(totaleRiga(r, L)), { size: 8.8, align: 'right', font: 'bold' });
    y += h;
  });

  // Totali (a destra) e note (a sinistra), affiancati
  const tl = [];
  if (T.urgenzaPct) { tl.push(['Totale lavori', T.imponibileRighe]); tl.push([`Maggiorazione urgenza ${qtaFmt(T.urgenzaPct)}%`, T.urgenza]); }
  if (T.ivaPct > 0) { tl.push(['Imponibile', T.imponibile]); tl.push([T.ivaLabel, T.iva]); }
  const tx = 124, nw = tx - X0 - 6;
  const ora = (L.voci || []).find(v => v.id === 'ora');
  const note = [];
  if (T.ivaNota) note.push([T.ivaNota, { font: 'italic', size: 7.4, color: C.grigio }]);
  if (doc.note) note.push([`Note: ${doc.note}`, { size: 8 }]);
  const info = [];
  if (prev && +doc.validita > 0) info.push(`Validità dell'offerta: ${doc.validita} giorni dalla data del preventivo.`);
  info.push(`Pagamento: bonifico bancario all'emissione della fattura${az.iban ? ` – IBAN ${az.iban}` : ''}.`);
  note.push([info.join('\n'), { size: 8 }]);
  if (az.notaImprevisti) note.push([az.notaImprevisti.toUpperCase() + (ora && ora.prezzo ? ` (${eur(ora.prezzo)}/ora)` : ''), { size: 7.2, font: 'bold', color: C.rosso }]);
  const altNote = note.reduce((a, [t, o]) => a + pdf.wrap(t, nw, o.size, o.font || 'normal').length * o.size * 1.3 / (72 / 25.4) + 1.6, 0);
  const altTot = tl.length * 5.2 + 9;
  if (y + 3 + Math.max(altNote, altTot) > BOTTOM) y = nuovaPagina(); else y += 3;
  let yt = y;
  tl.forEach(([l, v]) => { pdf.text(tx + 2, yt + 3.6, l, { size: 8.5, color: C.grigio }); pdf.text(col.importo, yt + 3.6, eur(v), { size: 9, align: 'right' }); yt += 5.2; });
  pdf.rect(tx, yt, X1 - tx, 8.5, { fill: C.fondo, stroke: C.bordo });
  pdf.rect(tx, yt, 1.6, 8.5, { fill: C.arancio });
  pdf.text(tx + 4, yt + 5.7, T.ivaPct > 0 ? 'TOTALE IVA COMPRESA' : 'TOTALE', { size: 9, font: 'bold' });
  pdf.text(col.importo, yt + 5.8, eur(T.totale), { size: 11.5, font: 'bold', align: 'right' });
  yt += 8.5;
  let yn = y + 1;
  for (const [t, o] of note) yn = pdf.paragraph(X0, yn + 3, t, nw, { lead: 1.3, color: C.testo, ...o }) - 1.4;
  y = Math.max(yt, yn) + 2;

  // Modulo: condizioni compatte su due colonne, rimpicciolite quanto basta per stare nella pagina, e firma
  const FIRMA = 17;
  if (prev && doc.condizioni && az.condizioni) {
    const sezioni = az.condizioni.split(/\n\s*\n/).map(sez => { const [titolo, ...corpo] = sez.trim().split('\n'); return { titolo: titolo.trim(), testo: corpo.join(' ').trim() }; }).filter(x => x.titolo);
    const GAP = 6, COLW = (LARG - GAP) / 2;
    const impagina = size => {
      const lh = size * 1.22 / (72 / 25.4);
      const righe = [];
      sezioni.forEach((sz, i) => {
        if (i) righe.push({ t: '', h: lh * 0.45, spazio: true });
        pdf.wrap(sz.titolo, COLW, size, 'bold').forEach((l, j) => righe.push({ t: l, font: 'bold', h: lh, titolo: j === 0 }));
        pdf.wrap(sz.testo, COLW, size).forEach(l => righe.push({ t: l, h: lh }));
      });
      const tot = righe.reduce((a, r) => a + r.h, 0);
      // divide in due colonne di altezza simile, senza lasciare un titolo in fondo alla prima
      let acc = 0, taglio = righe.length;
      for (let i = 0; i < righe.length; i++) { if (acc + righe[i].h > tot / 2) { taglio = i; break; } acc += righe[i].h; }
      while (taglio > 0 && (righe[taglio - 1].font === 'bold' || righe[taglio - 1].spazio)) taglio--;
      const col1 = righe.slice(0, taglio), col2 = righe.slice(taglio);
      while (col2.length && col2[0].spazio) col2.shift();
      const h = Math.max(col1.reduce((a, r) => a + r.h, 0), col2.reduce((a, r) => a + r.h, 0));
      return { size, col1, col2, h };
    };
    const disponibile = () => BOTTOM - FIRMA - (y + 9);
    y += 2;
    let L2 = [7, 6.6, 6.2, 5.8, 5.4, 5].map(impagina).find(x => x.h <= disponibile());
    if (!L2) { y = nuovaPagina(); L2 = impagina(7); }
    pdf.line(X0, y, X1, y, { color: C.bordo, width: 0.2 });
    pdf.text(X0, y + 4.6, 'Termini e condizioni', { size: 8.5, font: 'bold' });
    y += 7.5;
    [[L2.col1, X0], [L2.col2, X0 + COLW + GAP]].forEach(([col, x]) => {
      let yy = y;
      for (const r of col) { yy += r.h; if (r.t) pdf.text(x, yy - r.h * 0.25, r.t, { size: L2.size, font: r.font || 'normal', color: r.font ? C.testo : '#333333' }); }
    });
    y += L2.h + 1;
  }
  if (prev) {
    const frase = doc.condizioni ? 'Il Cliente dichiara di aver letto e accettato il presente preventivo e i termini e le condizioni sopra riportati.' : 'Per accettazione del presente preventivo.';
    if (y + FIRMA > BOTTOM + 4) y = nuovaPagina();
    y = Math.max(y + 3, BOTTOM - FIRMA + 3);
    pdf.paragraph(X0, y, frase, LARG, { size: 7.8, font: 'italic', color: C.grigio });
    y += 10;
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
    dataFine: L ? (x.dataFine || '') : '',
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

/** Listino prezzi in PDF (per i rivenditori e per te), con maggiorazioni e condizioni. */
export function creaListino({ listino = LISTINO_BASE, azienda = AZIENDA_BASE, immagini = {} }) {
  const az = { ...AZIENDA_BASE, ...Object.fromEntries(Object.entries(azienda || {}).filter(([, v]) => v != null && v !== '')) };
  const L = { ...LISTINO_BASE, ...(listino || {}) };
  if (!Array.isArray(L.voci)) L.voci = LISTINO_BASE.voci;
  const pdf = new PDF();
  const img = {};
  for (const k of ['logo', 'posaclima', 'dekra']) if (immagini[k]) { try { img[k] = pdf.addJpeg(immagini[k]); } catch {} }
  const testata = () => {
    if (img.posaclima) pdf.image(img.posaclima, X0, 9, 17);
    if (img.logo) pdf.image(img.logo, 105 - 26, 10, 52);
    else pdf.text(105, 21, 'CASSERO INSTALLAZIONI', { size: 18, font: 'bold', align: 'center' });
    if (img.dekra) pdf.image(img.dekra, X1 - 14.5, 7, 14.5);
  };
  const nuovaPagina = () => { pdf.addPage(); testata(); return TOP; };
  testata();
  let y = TOP;
  pdf.text(X0, y + 4, `LISTINO PREZZI POSA ${L.anno || ''}`.trim(), { size: 17, font: 'bold' });
  pdf.rect(X0, y + 7, 22, 1.1, { fill: C.arancio });
  pdf.text(X1, y + 1, 'Prezzi IVA esclusa', { size: 9.5, align: 'right', color: C.grigio });
  y += 14;
  const UL = { pz: 'a pezzo', ora: 'a ora', corpo: 'a corpo' };
  const col = { unita: 150, prezzo: X1 - 3 };
  const gruppi = [...new Set(L.voci.map(v => v.gruppo))];
  for (const g of gruppi) {
    const voci = L.voci.filter(v => v.gruppo === g);
    if (y + 6 + 7 * Math.min(voci.length, 3) > BOTTOM) y = nuovaPagina();
    pdf.rect(X0, y, LARG, 6.5, { fill: C.fondo, stroke: C.bordo });
    pdf.rect(X0, y, 1.6, 6.5, { fill: C.arancio });
    pdf.text(X0 + 4, y + 4.5, g.toUpperCase(), { size: 8.2, font: 'bold' });
    y += 6.5;
    voci.forEach((v, i) => {
      const nome = pdf.wrap(v.nome, 120, 9.2, 'bold');
      const vari = v.variante ? pdf.wrap(v.variante, 120, 8) : [];
      const extra = v.magg === 'blindato' ? [`Prodotto blindato: + ${eur(L.maggBlindato)}`] : v.magg === 'luce' ? [`Posa in luce: + ${eur(L.maggLuce)}`] : [];
      const h = 3 + nome.length * 4 + (vari.length + extra.length) * 3.6 + 1;
      if (y + h > BOTTOM) { y = nuovaPagina(); }
      if (i % 2) pdf.rect(X0, y, LARG, h, { fill: C.riga });
      let yy = y + 4.8;
      nome.forEach(t => { pdf.text(X0 + 4, yy, t, { size: 9.2, font: 'bold' }); yy += 4; });
      [...vari, ...extra].forEach(t => { pdf.text(X0 + 4, yy - 0.4, t, { size: 8, color: C.grigio }); yy += 3.6; });
      pdf.text(col.unita, y + 4.8, UL[v.unita] || v.unita || '', { size: 8.5, color: C.grigio });
      pdf.text(col.prezzo, y + 4.8, v.prezzo == null || v.prezzo === '' ? 'da concordare' : eur(v.prezzo), { size: 9.5, font: v.prezzo == null || v.prezzo === '' ? 'normal' : 'bold', align: 'right', color: v.prezzo == null || v.prezzo === '' ? C.grigio : C.testo });
      pdf.line(X0, y + h, X1, y + h, { color: C.bordo });
      pdf.line(X0, y, X0, y + h, { color: C.bordo }); pdf.line(X1, y, X1, y + h, { color: C.bordo });
      y += h;
    });
    y += 4;
  }
  // note sui prezzi
  const note = [
    `Trasferta: ${eur(L.euroKm ?? 1)} al km.`,
    `Lavori urgenti: maggiorazione del ${L.urgenzaPct ?? 10}% sulle voci di posa.`,
    `Prodotti blindati: + ${eur(L.maggBlindato)} al pezzo dove indicato. Posa in luce: + ${eur(L.maggLuce)} al pezzo dove indicato.`,
    az.notaImprevisti,
  ].filter(Boolean);
  if (y + 8 + note.length * 4.5 > BOTTOM) y = nuovaPagina();
  pdf.text(X0, y + 2, 'Note', { size: 9, font: 'bold' }); y += 5;
  for (const t of note) y = pdf.paragraph(X0, y + 1, '• ' + t, LARG, { size: 8.4, lead: 1.3 }) + 0.6;
  // condizioni
  if (az.condizioni) {
    y += 4;
    const sezioni = az.condizioni.split(/\n\s*\n/).map(s => { const [t, ...c] = s.trim().split('\n'); return { t: t.trim(), c: c.join(' ').trim() }; }).filter(s => s.t);
    if (y + 20 > BOTTOM) y = nuovaPagina();
    pdf.line(X0, y, X1, y, { color: C.bordo }); pdf.text(X0, y + 5, 'Termini e condizioni', { size: 9, font: 'bold' }); y += 9;
    for (const s of sezioni) {
      const righe = pdf.wrap(s.c, LARG, 7.6);
      if (y + 4 + Math.min(righe.length, 3) * 3.3 > BOTTOM) y = nuovaPagina();
      pdf.text(X0, y, s.t, { size: 7.9, font: 'bold' }); y += 3.6;
      for (const r of righe) { if (y > BOTTOM) y = nuovaPagina(); pdf.text(X0, y, r, { size: 7.6, color: '#333333' }); y += 3.3; }
      y += 1.6;
    }
  }
  const n = pdf.pageNo;
  for (let p = 1; p <= n; p++) {
    pdf.setPage(p);
    pdf.text(X0, 281, az.ragioneSociale, { size: 7.8 });
    pdf.text(X0, 284.6, [az.piva && `P. Iva ${az.piva}`, az.indirizzo].filter(Boolean).join(' · '), { size: 7.8 });
    pdf.text(X1, 281, az.email || '', { size: 7.8, align: 'right' });
    pdf.text(X1, 284.6, az.telefono || '', { size: 7.8, align: 'right' });
    if (n > 1) pdf.text(105, 290, `Pagina ${p} di ${n}`, { size: 7, color: C.grigio, align: 'center' });
  }
  return pdf.output({ title: `Listino prezzi posa ${L.anno || ''}`.trim(), author: az.ragioneSociale });
}
