// Logica condivisa tra l'app e il controllo giornaliero delle notifiche.
// Nessuna dipendenza: funziona nel browser e in Node.

export const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
export const AMM = [['da_cons','Da consuntivare','bad'],['cons','Consuntivo inviato','warn'],['fatt','Fatturato','in'],['pag','Pagato','ok']];
export const STATI = [['aperto','Aperto','bad'],['programmato','Programmato','in'],['in_corso','In corso','warn'],['completato','Completato','ok'],['annullato','Annullato','']];
export const URG = [['normale','Normale',''],['alta','Urgente','warn'],['critica','Molto urgente','bad']];
export const CAT = [['materiale','Materiale da posa'],['furgone','Furgone (assic., bollo, tagliandi)'],['carburante','Carburante'],['attrezzatura','Attrezzatura'],['telefono','Telefono e ufficio'],['altro','Altro']];
export const SCAD = [['assicurazione','Assicurazione',1],['bollo','Bollo',1],['revisione','Revisione',2],['tagliando','Tagliando',1]];

/** Data di oggi (YYYY-MM-DD) in Italia, indipendente dal fuso del dispositivo o del server. */
export function oggi(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export const pd = s => new Date(s + 'T12:00:00');
export const iso = d => { const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
export const daysBetween = (from, to) => Math.round((pd(to) - pd(from)) / 864e5);
export const n2 = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };
export const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
export const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'materiale';
export const eur = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(+n || 0);

/**
 * Elenco delle cose da fare.
 * S = { lavori, interventi, movimenti, magazzino, furgone }
 * Ritorna [{lvl, txt, sub, act, arg}]
 */
export function promemoria(S, today = oggi()) {
  const out = [], f = S.furgone || {};
  for (const [k, lab] of SCAD) {
    const d = f[k]; if (!d) continue;
    const n = daysBetween(today, d);
    if (n <= 30) out.push({ lvl: n < 0 ? 'bad' : n <= 7 ? 'warn' : 'in', txt: `${lab} furgone ${n < 0 ? `scaduta da ${-n} giorni` : n === 0 ? 'scade oggi' : `scade tra ${n} giorni`}`, sub: d.split('-').reverse().join('/'), act: 'tab', arg: 'van' });
  }
  if (n2(f.km) && n2(f.tagliandoKm) && n2(f.tagliandoKm) - n2(f.km) <= 1000)
    out.push({ lvl: 'warn', txt: 'Tagliando vicino per chilometri', sub: `mancano ${Math.round(n2(f.tagliandoKm) - n2(f.km))} km`, act: 'tab', arg: 'van' });

  const all = [
    ...(S.lavori || []).map(x => ({ ...x, _d: x.data })),
    ...(S.interventi || []).filter(i => i.stato === 'completato').map(x => ({ ...x, _d: x.dataProg || x.data, importo: x.costo })),
  ].filter(x => x._d && x._d <= today && n2(x.importo) > 0);
  const dc = all.filter(x => (x.amm || 'da_cons') === 'da_cons');
  if (dc.length) out.push({ lvl: 'bad', txt: `${dc.length} ${dc.length === 1 ? 'lavoro da consuntivare' : 'lavori da consuntivare'}`, sub: eur(sum(dc, x => x.importo)), act: 'fatt' });
  const df = all.filter(x => x.amm === 'cons');
  if (df.length) out.push({ lvl: 'warn', txt: `${df.length} ${df.length === 1 ? 'fattura da emettere' : 'fatture da emettere'}`, sub: eur(sum(df, x => x.importo)), act: 'fatt' });
  const di = all.filter(x => x.amm === 'fatt');
  if (di.length) out.push({ lvl: 'in', txt: `${di.length} ${di.length === 1 ? 'fattura da incassare' : 'fatture da incassare'}`, sub: eur(sum(di, x => x.importo)), act: 'fatt' });

  const low = (S.magazzino || []).filter(m => n2(m.soglia) > 0 && n2(m.qta) <= n2(m.soglia));
  if (low.length) out.push({ lvl: 'warn', txt: 'Materiale da riordinare', sub: low.map(m => m.nome).slice(0, 3).join(', ') + (low.length > 3 ? ` e altri ${low.length - 3}` : ''), act: 'mag' });

  const urg = (S.interventi || []).filter(i => ['aperto', 'programmato', 'in_corso'].includes(i.stato || 'aperto') && i.urgenza === 'critica');
  if (urg.length) out.push({ lvl: 'bad', txt: `${urg.length} ${urg.length === 1 ? 'intervento molto urgente' : 'interventi molto urgenti'} aperti`, sub: urg.map(i => i.cliente).slice(0, 2).join(', '), act: 'tab', arg: 'int' });

  const attesa = (S.preventivi || []).filter(p => p.stato === 'inviato' && daysBetween(p.dataInvio || p.data || today, today) >= 7);
  if (attesa.length) out.push({ lvl: 'warn', txt: `${attesa.length} ${attesa.length === 1 ? 'preventivo senza risposta' : 'preventivi senza risposta'} da più di 7 giorni`, sub: attesa.map(p => (p.cliente && p.cliente.nome) || p.numero).slice(0, 3).join(', '), act: 'tab', arg: 'prev' });

  const domani = iso(new Date(pd(today).getTime() + 864e5));
  const pose = (S.lavori || []).filter(l => l.data === domani);
  const ints = (S.interventi || []).filter(i => i.dataProg === domani && i.stato !== 'completato' && i.stato !== 'annullato');
  const evDomani = (S.eventi || []).filter(e => e.data === domani);
  const NOMI_EV = { ferie: 'inizio ferie', fiera: 'fiera', corso: 'corso', altro: 'impegno' };
  if (evDomani.length) out.push({ lvl: 'in', txt: `Domani: ${evDomani.map(e => e.titolo || NOMI_EV[e.tipo] || 'impegno').join(', ')}`, sub: evDomani.map(e => [NOMI_EV[e.tipo], e.orario, e.luogo].filter(Boolean).join(' · ')).join(' / '), act: 'day', arg: domani });
  if (pose.length || ints.length) out.push({ lvl: 'in', txt: `Domani: ${[pose.length ? `${pose.length} ${pose.length === 1 ? 'posa' : 'pose'}` : '', ints.length ? `${ints.length} ${ints.length === 1 ? 'intervento' : 'interventi'}` : ''].filter(Boolean).join(' e ')}`, sub: [...pose, ...ints].map(x => x.cliente).slice(0, 3).join(', '), act: 'day', arg: domani });
  return out;
}

/** Lettura semplice dello scontrino dal testo riconosciuto (OCR). */
export function leggiScontrino(testo, nomiMagazzino = []) {
  const righe = testo.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  const amountRe = /(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+[.,]\d{2})(?!\d)/g;
  const toNum = s => n2(s.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  let totale = 0;
  for (const r of righe) {
    if (/tot(ale)?|importo pagato|pagamento|contanti|da pagare/i.test(r) && !/sub ?tot|iva|imponibile|resto/i.test(r)) {
      const m = r.match(amountRe); if (m) totale = Math.max(totale, ...m.map(toNum));
    }
  }
  if (!totale) { const all = testo.match(amountRe) || []; totale = all.length ? Math.max(...all.map(toNum).filter(x => x < 100000)) : 0; }

  let data = null;
  const dm = testo.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (dm) {
    let [, g, m, a] = dm; if (a.length === 2) a = '20' + a;
    if (+m >= 1 && +m <= 12 && +g >= 1 && +g <= 31) data = `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
  }
  const fornitore = (righe.find(r => /[a-zà-ù]{3,}/i.test(r) && (r.match(/\d/g) || []).length < 4) || '').replace(/[^\p{L}\p{N} .,&'-]/gu, '').trim().slice(0, 60);
  const numero = (testo.match(/(?:\bn\.|\bnum(?:ero)?\.?|\bfattura|\bscontrino)\s*(?:n\.)?\s*[:#]?\s*([A-Z0-9\/-]*\d[A-Z0-9\/-]*)/i) || [])[1] || '';

  const low = testo.toLowerCase();
  let categoria = 'altro';
  if (/gasolio|diesel|benzina|carburant|self ?service|adblue|\bgpl\b/.test(low)) categoria = 'carburante';
  else if (/officina|tagliando|revisione|assicuraz|bollo auto|pneumatic|gommist|ricambi auto/.test(low)) categoria = 'furgone';
  else if (/silicon|schiuma|poliuretan|vit[ei]\b|tassell|guarnizion|nastro|sigillant|cune[io]|spessor|staff[ae]|coprifil|primer|ferramenta|edil/.test(low)) categoria = 'materiale';
  else if (/punt[ae] |disco|dischi|trapan|avvitator|utensil|scala|livella/.test(low)) categoria = 'attrezzatura';

  const mat = [];
  if (categoria === 'materiale') {
    const kw = /silicon|schiuma|poliuretan|vit[ei]|tassell|guarnizion|nastro|sigillant|cune|spessor|staff|coprifil|primer/i;
    let attesa = null; // nome su una riga, prezzo sulla riga dopo
    for (const r of righe) {
      const known = nomiMagazzino.find(n => n.length > 3 && r.toLowerCase().includes(n.toLowerCase().split(' ')[0]));
      const am = r.match(amountRe);
      const qm = r.match(/(\d+)\s*[xX*]\s*(\d+[.,]\d{2})/);
      const soloNumeri = !/[a-zà-ù]{3,}/i.test(r.replace(/\b[xX]\b/g, ''));
      if (am && soloNumeri && attesa) {
        const tot = toNum(am[am.length - 1]); const qta = qm ? +qm[1] : 1;
        mat.push({ nome: attesa, qta, unita: 'pz', prezzoUnit: Math.round(tot / qta * 100) / 100 });
        attesa = null; continue;
      }
      if (!kw.test(r) && !known) { attesa = null; continue; }
      let nome = known || r.replace(amountRe, '').replace(/(\d+)\s*[xX*]\s*(?=\d+[.,]\d{2})/, '').replace(/[^\p{L}\p{N} .,x\/-]/gu, '').replace(/\s+/g, ' ').trim();
      nome = nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
      if (nome.length < 3) continue;
      if (!am) { attesa = nome.slice(0, 50); continue; }
      const prezzoTot = toNum(am[am.length - 1]);
      const qta = qm ? +qm[1] : 1;
      mat.push({ nome: nome.slice(0, 50), qta, unita: 'pz', prezzoUnit: Math.round(prezzoTot / qta * 100) / 100 });
      attesa = null;
    }
  }
  return { data, fornitore, numero, totale, categoria, descrizione: '', righe: mat.slice(0, 15) };
}
