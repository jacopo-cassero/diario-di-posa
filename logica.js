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

/** Impostazioni predefinite (salvate per utente, valgono su tutti i dispositivi). */
export const IMPOSTAZIONI_BASE = {
  notifiche: {
    mattino: true, oraMattino: 7,
    sera: true, oraSera: 19,
    weekend: false,
    furgone: true, furgoneGiorni: 30, furgoneKm: 1500,
    consuntivi: true, fatture: true, incassi: true,
    preventivi: true, preventiviGiorni: 7,
    materiale: true, urgenti: true,
    programma: true, giornata: true,
    scontrini: 'settimanale', scontriniGiorno: 5,
  },
  giornata: { inizio: '07:30', fine: '17:00', pausa: 60, giorni: [1, 2, 3, 4, 5], precompila: true },
  analisi: { kpi: true, mensile: true, lavoro: true, voci: true, interventi: true, contabilita: true, spese: true, preventivi: true, clienti: true, trasferte: true, furgone: true, materiale: true, consumo: true },
};
/** Impostazioni dell'utente unite ai valori predefiniti. */
export function impostazioni(S) {
  const u = (S && S.impostazioni) || {};
  return {
    notifiche: { ...IMPOSTAZIONI_BASE.notifiche, ...(u.notifiche || {}) },
    giornata: { ...IMPOSTAZIONI_BASE.giornata, ...(u.giornata || {}) },
    analisi: { ...IMPOSTAZIONI_BASE.analisi, ...(u.analisi || {}) },
  };
}
/** Ore di una giornata standard secondo l'orario impostato. */
export function oreGiornata(g) {
  const m = t => { const [h, mm] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (mm || 0); };
  return Math.max(0, Math.round((m(g.fine) - m(g.inizio) - n2(g.pausa)) / 60 * 100) / 100);
}
const GIORNI_SETT = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

/**
 * Elenco delle cose da fare.
 * momento: 'app' (riquadro Da fare), 'mattino' (riepilogo), 'sera' (promemoria di fine giornata)
 * Ritorna [{lvl, txt, sub, act, arg}]
 */
export function promemoria(S, today = oggi(), momento = 'app') {
  const out = [], f = S.furgone || {};
  const N = impostazioni(S).notifiche, G = impostazioni(S).giornata;
  const sera = momento === 'sera';
  // il riepilogo del mattino e il riquadro Da fare contengono le scadenze; la sera solo la giornata
  if (!sera) {
    if (N.furgone) {
      for (const [k, lab] of SCAD) {
        const d = f[k]; if (!d) continue;
        const n = daysBetween(today, d);
        if (n <= n2(N.furgoneGiorni)) out.push({ lvl: n < 0 ? 'bad' : n <= 7 ? 'warn' : 'in', txt: `${lab} furgone ${n < 0 ? `scaduta da ${-n} giorni` : n === 0 ? 'scade oggi' : `scade tra ${n} giorni`}`, sub: d.split('-').reverse().join('/'), act: 'tab', arg: 'van' });
      }
      const kmAtt = kmFurgone(S), manca = n2(f.tagliandoKm) - kmAtt;
      if (kmAtt && n2(f.tagliandoKm) && manca <= n2(N.furgoneKm ?? 1500)) {
        const r = ritmoKm(S, today), gg = r > 0 && manca > 0 ? Math.round(manca / r) : null;
        out.push({ lvl: manca <= 0 ? 'bad' : manca <= 500 ? 'warn' : 'in', txt: manca <= 0 ? `Tagliando superato di ${Math.round(-manca)} km` : `Tagliando tra ${Math.round(manca)} km`, sub: `furgone a ${Math.round(kmAtt).toLocaleString('it-IT')} km · tagliando a ${Math.round(n2(f.tagliandoKm)).toLocaleString('it-IT')} km${gg != null ? ` · al ritmo attuale circa ${gg <= 1 ? 'domani' : gg + ' giorni'}` : ''}`, act: 'tab', arg: 'van' });
      }
    }
    const all = [
      ...(S.lavori || []).map(x => ({ ...x, _d: x.dataFine || x.data })),
      ...(S.interventi || []).filter(i => i.stato === 'completato').map(x => ({ ...x, _d: x.dataProg || x.data, importo: x.costo })),
    ].filter(x => x._d && x._d <= today && n2(x.importo) > 0);
    const dc = all.filter(x => (x.amm || 'da_cons') === 'da_cons');
    if (N.consuntivi && dc.length) out.push({ lvl: 'bad', txt: `${dc.length} ${dc.length === 1 ? 'lavoro da consuntivare' : 'lavori da consuntivare'}`, sub: eur(sum(dc, x => x.importo)), act: 'fatt' });
    const df = all.filter(x => x.amm === 'cons');
    if (N.fatture && df.length) out.push({ lvl: 'warn', txt: `${df.length} ${df.length === 1 ? 'fattura da emettere' : 'fatture da emettere'}`, sub: eur(sum(df, x => x.importo)), act: 'fatt' });
    const di = all.filter(x => x.amm === 'fatt');
    if (N.incassi && di.length) out.push({ lvl: 'in', txt: `${di.length} ${di.length === 1 ? 'fattura da incassare' : 'fatture da incassare'}`, sub: eur(sum(di, x => x.importo)), act: 'fatt' });

    const low = (S.magazzino || []).filter(m => n2(m.soglia) > 0 && n2(m.qta) <= n2(m.soglia));
    if (N.materiale && low.length) out.push({ lvl: 'warn', txt: 'Materiale da riordinare', sub: low.map(m => m.nome).slice(0, 3).join(', ') + (low.length > 3 ? ` e altri ${low.length - 3}` : ''), act: 'mag' });

    const urg = (S.interventi || []).filter(i => ['aperto', 'programmato', 'in_corso'].includes(i.stato || 'aperto') && i.urgenza === 'critica');
    if (N.urgenti && urg.length) out.push({ lvl: 'bad', txt: `${urg.length} ${urg.length === 1 ? 'intervento molto urgente' : 'interventi molto urgenti'} aperti`, sub: urg.map(i => i.cliente).slice(0, 2).join(', '), act: 'tab', arg: 'int' });

    const gg = n2(N.preventiviGiorni) || 7;
    const attesa = (S.preventivi || []).filter(p => p.stato === 'inviato' && daysBetween(p.dataInvio || p.data || today, today) >= gg);
    if (N.preventivi && attesa.length) out.push({ lvl: 'warn', txt: `${attesa.length} ${attesa.length === 1 ? 'preventivo senza risposta' : 'preventivi senza risposta'} da più di ${gg} giorni`, sub: attesa.map(p => (p.cliente && p.cliente.nome) || p.numero).slice(0, 3).join(', '), act: 'tab', arg: 'prev' });
  }

  // programma: al mattino quello di oggi, altrimenti quello di domani
  if (N.programma) {
    const giorno = momento === 'mattino' ? today : iso(new Date(pd(today).getTime() + 864e5));
    const etichetta = momento === 'mattino' ? 'Oggi' : 'Domani';
    const inRange = (a, b, k) => k >= a && k <= (b || a);
    const pose = (S.lavori || []).filter(l => inRange(l.data, l.dataFine, giorno));
    const ints = (S.interventi || []).filter(i => i.dataProg === giorno && i.stato !== 'completato' && i.stato !== 'annullato');
    const ev = (S.eventi || []).filter(e => e.data === giorno);
    const NOMI_EV = { ferie: 'inizio ferie', fiera: 'fiera', corso: 'corso', altro: 'impegno' };
    if (ev.length) out.push({ lvl: 'in', txt: `${etichetta}: ${ev.map(e => e.titolo || NOMI_EV[e.tipo] || 'impegno').join(', ')}`, sub: ev.map(e => [NOMI_EV[e.tipo], e.orario, e.luogo].filter(Boolean).join(' · ')).join(' / '), act: 'day', arg: giorno });
    if (pose.length || ints.length) out.push({ lvl: 'in', txt: `${etichetta}: ${[pose.length ? `${pose.length} ${pose.length === 1 ? 'posa' : 'pose'}` : '', ints.length ? `${ints.length} ${ints.length === 1 ? 'intervento' : 'interventi'}` : ''].filter(Boolean).join(' e ')}`, sub: [...pose, ...ints].sort((a, b) => ((orarioDi(a) || ['99'])[0]).localeCompare((orarioDi(b) || ['99'])[0])).map(x => [orarioDi(x) && !x.tuttoGiorno ? orarioDi(x)[0] : '', x.cliente, x.indirizzo].filter(Boolean).join(' ')).slice(0, 3).join(' / '), act: 'day', arg: giorno });
  }

  if (sera) {
    const dow = pd(today).getDay();
    const lavorativo = (G.giorni || []).includes(dow);
    const inFerie = (S.eventi || []).some(e => e.tipo === 'ferie' && today >= e.data && today <= (e.dataFine || e.data));
    const segnato = (S.lavori || []).some(l => today >= l.data && today <= (l.dataFine || l.data)) || (S.interventi || []).some(i => (i.dataProg || '') === today) || (S.eventi || []).some(e => today >= e.data && today <= (e.dataFine || e.data));
    if (N.giornata && lavorativo && !inFerie && !segnato) out.push({ lvl: 'warn', txt: 'Non hai ancora segnato il lavoro di oggi', sub: 'Aggiungi la posa o l\'intervento finché te lo ricordi', act: 'day', arg: today });
    const oggiScontrini = N.scontrini === 'sera' ? lavorativo : N.scontrini === 'settimanale' && dow === n2(N.scontriniGiorno);
    if (oggiScontrini) out.push({ lvl: 'in', txt: 'Hai scontrini da caricare?', sub: N.scontrini === 'settimanale' ? `Promemoria del ${GIORNI_SETT[dow]}: fotografali in Conti` : 'Fotografali in Conti prima di perderli', act: 'tab', arg: 'conti' });
  }
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

/* ---------- orari di pose e interventi ---------- */
export const TUTTO_GIORNO = ['08:00', '18:00'];
/** [inizio, fine] del lavoro, oppure null se non ha un orario. */
export function orarioDi(x) {
  if (!x) return null;
  if (x.tuttoGiorno) return [x.oraInizio || TUTTO_GIORNO[0], x.oraFine || TUTTO_GIORNO[1]];
  if (x.oraInizio) return [x.oraInizio, x.oraFine || ''];
  return null;
}
export function testoOrario(x) {
  const o = orarioDi(x); if (!o) return '';
  if (x.tuttoGiorno) return 'tutto il giorno';
  return o[1] ? `${o[0]}–${o[1]}` : `dalle ${o[0]}`;
}

/* ---------- chilometri del furgone ---------- */
/** Km attuali: il più alto tra quelli del furgone e quelli segnati nelle spese (carburante, officina). */
export function kmFurgone(S) {
  return Math.max(n2((S.furgone || {}).km), ...(S.movimenti || []).map(m => n2(m.km)), 0);
}
/** Km al giorno degli ultimi mesi, dalle letture segnate nelle spese (0 se non bastano). */
export function ritmoKm(S, today = oggi()) {
  const L = (S.movimenti || []).filter(m => n2(m.km) > 0 && m.data && daysBetween(m.data, today) <= 180).map(m => [m.data, n2(m.km)]).sort((a, b) => a[0].localeCompare(b[0]));
  if (L.length < 2) return 0;
  const gg = daysBetween(L[0][0], L[L.length - 1][0]), km = L[L.length - 1][1] - L[0][1];
  return gg >= 7 && km > 0 ? km / gg : 0;
}
/** Consumo medio (km/l) dai pieni con km e litri. */
export function consumoMedio(S) {
  const L = (S.movimenti || []).filter(m => m.categoria === 'carburante' && n2(m.km) > 0).sort((a, b) => n2(a.km) - n2(b.km));
  if (L.length < 2) return 0;
  const litri = L.slice(1).reduce((a, m) => a + n2(m.litri), 0), km = n2(L[L.length - 1].km) - n2(L[0].km);
  const c = litri > 0 && km > 0 ? km / litri : 0;
  return c >= 4 && c <= 25 ? c : 0; // fuori da questi valori mancano dei pieni: meglio non mostrarlo
}
/** Litri e km letti da uno scontrino del carburante (se ci sono). */
export function leggiCarburante(testo) {
  const t = String(testo || '');
  const lm = t.match(/(\d{1,3}[.,]\d{2,3})\s*(?:lt\b|l\b|litri)/i) || t.match(/(?:litri|lt\.?|quantit[aà])\s*[:=]?\s*(\d{1,3}[.,]\d{2,3})/i);
  const km = t.match(/\b(?:km|chilometri|odometro)\s*[:.=]?\s*(\d{1,3}(?:[.\s]?\d{3})+|\d{4,7})\b/i);
  return { litri: lm ? n2(lm[1].replace(',', '.')) : 0, km: km ? n2(km[1].replace(/[.\s]/g, '')) : 0 };
}
/** Categoria di una spesa dal testo del documento. */
export function categoriaDa(testo) {
  const low = String(testo || '').toLowerCase();
  if (/gasolio|diesel|benzina|carburant|self ?service|adblue|\bgpl\b|metano|rifornimento|erogat/.test(low)) return 'carburante';
  if (/officina|tagliando|revisione|assicuraz|bollo auto|pneumatic|gommist|ricambi auto|autoriparaz|carrozzeria|cambio olio|filtro olio/.test(low)) return 'furgone';
  if (/telefon|cellulare|tim\b|vodafone|wind|iliad|fastweb|cancelleria|toner|stampant/.test(low)) return 'telefono';
  if (/silicon|schiuma|poliuretan|vit[ei]\b|tassell|guarnizion|nastro|sigillant|cune[io]|spessor|staff[ae]|coprifil|primer|ferramenta|edil|serrament|controtelai/.test(low)) return 'materiale';
  if (/punt[ae] |disco|dischi|trapan|avvitator|utensil|scala|livella|smerigliatric|batteria makita|dewalt|hilti|bosch/.test(low)) return 'attrezzatura';
  return 'altro';
}
