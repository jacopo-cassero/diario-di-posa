// Lettura delle fatture dei fornitori: fattura elettronica (XML o .p7m firmato), PDF o foto.
// Restituisce fornitore, numero, data, totale e le righe di materiale da caricare in magazzino.

const n = v => { const x = parseFloat(String(v ?? '').replace(/\s/g, '')); return isFinite(x) ? x : 0; };
const r2 = x => Math.round(x * 100) / 100;
const pulisci = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const tag = (xml, nome) => { const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nome}>`)); return m ? pulisci(m[1]) : ''; };
const tutti = (xml, nome) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${nome}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nome}>`, 'g'))].map(m => m[1]);
const UNITA = { PZ: 'pz', NR: 'pz', N: 'pz', NUM: 'pz', PEZZI: 'pz', CF: 'conf', CONF: 'conf', CT: 'conf', SC: 'conf', MT: 'm', M: 'm', ML: 'm', KG: 'kg', LT: 'l', L: 'l', RT: 'rotolo', ROT: 'rotolo' };
const unita = u => UNITA[String(u || '').toUpperCase().replace(/\.$/, '')] || (u ? String(u).toLowerCase().slice(0, 10) : 'pz');
const nomeBello = s => { const t = pulisci(s).replace(/^[\d\-\/.\s]+(?=[A-Za-zÀ-ú])/, '').slice(0, 60); return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ''; };

/** Estrae l'XML della fattura elettronica da un file .xml o .p7m (anche a blocchi o in base64). */
export function xmlDaFile(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const trova = t => {
    const a = t.search(/<(\w+:)?FatturaElettronica[\s>]/); if (a < 0) return '';
    const fine = t.slice(a).match(/<\/(\w+:)?FatturaElettronica>/); if (!fine) return '';
    // nei .p7m il testo può essere spezzato in blocchi: tolgo le intestazioni dei blocchi (byte 0x04 + lunghezza)
    return t.slice(a, a + fine.index + fine[0].length).replace(/\x04(?:\x82[\s\S]{2}|\x81[\s\S]|[\x00-\x7f])/g, '');
  };
  let xml = trova(s);
  if (!xml && /^[A-Za-z0-9+/=\r\n]+$/.test(s.trim().slice(0, 200))) { try { xml = trova(atob(s.replace(/\s/g, ''))); } catch {} }
  if (!xml) return '';
  // il testo è in UTF-8: lo ridecodifico per gli accenti
  try { xml = new TextDecoder('utf-8').decode(Uint8Array.from(xml, c => c.charCodeAt(0) & 0xff)); } catch {}
  return xml;
}

/** Fattura elettronica (FatturaPA) → dati della spesa. */
export function leggiFatturaXml(xml, { forfettario = false } = {}) {
  const ced = tag(xml, 'CedentePrestatore');
  const fornitore = tag(ced, 'Denominazione') || [tag(ced, 'Nome'), tag(ced, 'Cognome')].filter(Boolean).join(' ');
  const gen = tag(xml, 'DatiGeneraliDocumento');
  const righe = tutti(xml, 'DettaglioLinee').map(l => {
    const qta = n(tag(l, 'Quantita')) || 1, tot = n(tag(l, 'PrezzoTotale')), aliq = n(tag(l, 'AliquotaIVA'));
    let pu = n(tag(l, 'PrezzoUnitario')); if (tot && qta) pu = tot / qta; // sconti di riga già compresi nel totale
    if (forfettario) pu *= 1 + aliq / 100; // per il forfettario l'IVA è un costo
    return { nome: nomeBello(tag(l, 'Descrizione')), qta: r2(qta), unita: unita(tag(l, 'UnitaMisura')), prezzoUnit: r2(pu), totale: r2(tot) };
  }).filter(r => r.nome && r.totale >= 0);
  const imponibile = tutti(xml, 'DatiRiepilogo').reduce((a, b) => a + n(tag(b, 'ImponibileImporto')), 0);
  const imposta = tutti(xml, 'DatiRiepilogo').reduce((a, b) => a + n(tag(b, 'Imposta')), 0);
  const totale = n(tag(gen, 'ImportoTotaleDocumento')) || r2(imponibile + imposta);
  return { tipo: 'xml', fornitore: fornitore.slice(0, 60), numero: tag(gen, 'Numero'), data: tag(gen, 'Data').slice(0, 10), totale: r2(totale), imponibile: r2(imponibile), righe };
}

/** Testo di una fattura (da PDF o foto) → righe con quantità e prezzi, quando si riconoscono. */
export function leggiFatturaTesto(testo, { forfettario = false } = {}) {
  const amount = /-?\d{1,3}(?:\.\d{3})*,\d{2,4}|-?\d+,\d{2,4}|-?\d+\.\d{2}(?!\d)/g;
  const num = s => n(String(s).includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  const salta = /totale|imponibile|iva\b|aliquota|scadenza|pagamento|bonifico|iban|banca|contributo|bollo|cassa|ritenuta|riepilogo|spese di|trasporto|sconto merce|abbuono/i;
  const righe = [];
  for (const raw of String(testo).split(/\r?\n/)) {
    const r = raw.replace(/\s+/g, ' ').trim();
    if (r.length < 8 || salta.test(r) || !/[A-Za-zÀ-ú]{3,}/.test(r)) continue;
    const am = [...r.matchAll(amount)];
    if (am.length < 2) continue;
    const tot = num(am[am.length - 1][0]), pu = num(am[am.length - 2][0]);
    if (!(tot > 0) || !(pu > 0)) continue;
    // quantità: un numero prima del prezzo unitario (con eventuale unità di misura)
    const prima = r.slice(0, am[am.length - 2].index);
    const qm = prima.match(/(\d+(?:[.,]\d+)?)\s*(PZ|NR|N\.?|CF|CONF|CT|MT|ML|M|KG|LT|L|RT)?\s*$/i) || prima.match(/\b(PZ|NR|N\.?|CF|CONF|CT|MT|ML|M|KG|LT|RT)\s*(\d+(?:[.,]\d+)?)\s*$/i);
    let qta = 0, um = '';
    if (qm) { if (/^\d/.test(qm[1])) { qta = num(qm[1]); um = qm[2] || ''; } else { qta = num(qm[2]); um = qm[1]; } }
    if (!qta || Math.abs(qta * pu - tot) > Math.max(0.05, tot * 0.15)) { qta = r2(tot / pu); if (Math.abs(Math.round(qta) - qta) > 0.02) continue; }
    // descrizione: il testo prima della quantità, senza codici articolo in testa
    let desc = qm ? prima.slice(0, prima.length - qm[0].length) : prima;
    const um2 = desc.match(/\s(PZ|NR|N\.?|CF|CONF|CT|MT|ML|M|KG|LT|L|RT)\s*$/i); if (um2) { um = um || um2[1]; desc = desc.slice(0, um2.index); }
    desc = desc.replace(/^\s*[A-Z0-9][A-Z0-9.\-\/]{3,}\s+(?=[A-Za-zÀ-ú])/, '');
    const nome = nomeBello(desc); if (nome.length < 3) continue;
    righe.push({ nome, qta: r2(qta), unita: unita(um), prezzoUnit: r2(forfettario ? pu * 1.22 : pu), totale: r2(tot) });
  }
  // intestazione
  const t = String(testo);
  const tm = [...t.matchAll(/(?:totale(?: documento| fattura| da pagare)?|netto a pagare)[^\d\n]{0,25}(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi)].map(m => num(m[1]));
  const dm = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/);
  const data = dm ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : '';
  const numero = (t.match(/(?:fattura|documento|doc\.)\s*(?:n\.?|nr\.?|numero)?\s*[:°º#]?\s*([A-Z0-9][A-Z0-9\/\-]*\d[A-Z0-9\/\-]*)/i) || [])[1] || '';
  const fornitore = (t.split(/\r?\n/).map(x => x.trim()).find(x => /\b(s\.?r\.?l|s\.?p\.?a|s\.?n\.?c|s\.?a\.?s|srls)\b/i.test(x) && x.length < 70) || '').replace(/[^\p{L}\p{N} .,&'-]/gu, '').trim();
  return { tipo: 'testo', fornitore: fornitore.slice(0, 60), numero, data, totale: tm.length ? Math.max(...tm) : r2(righe.reduce((a, b) => a + b.totale, 0)), righe: righe.slice(0, 40) };
}
