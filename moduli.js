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
