// Listino prezzi 2027 di CASSERO INSTALLAZIONI e calcolo dei prezzi.
// Il listino si può modificare dall'app (Impostazioni › Listino prezzi):
// questi sono solo i valori di partenza.

// unita: 'pz' = a pezzo, 'ora' = tariffa oraria, 'corpo' = a corpo (importo fisso)
// prezzo: null = da concordare (si scrive il prezzo nel preventivo)
// magg: 'blindato' = +20 €/pz per prodotti blindati, 'luce' = +20 €/pz per posa in luce
const V = (id, gruppo, nome, variante, prezzo, unita = 'pz', magg = '') => ({ id, gruppo, nome, variante, prezzo, unita, magg });

export const LISTINO_BASE = {
  anno: 2027,
  maggBlindato: 20,
  maggLuce: 20,
  urgenzaPct: 10,
  euroKm: 1,
  voci: [
    V('ctf', 'Posa controtelai e spalle', 'Controtelaio finestra', '', 60),
    V('ctpf', 'Posa controtelai e spalle', 'Controtelaio portafinestra', '', 80),
    V('spf', 'Posa controtelai e spalle', 'Spalla coibentata finestra', '', 80),
    V('sppf', 'Posa controtelai e spalle', 'Spalla coibentata portafinestra', '', 100),

    V('fin', 'Posa serramenti', 'Finestra', '', 80),
    V('pf', 'Posa serramenti', 'Portafinestra', '', 90),
    V('alz', 'Posa serramenti', 'Alzante scorrevole', '', 250),

    V('zf', 'Posa accessori', 'Zanzariera finestra', '', 30),
    V('zpf', 'Posa accessori', 'Zanzariera portafinestra', '', 40),
    V('av1', 'Posa accessori', 'Avvolgibile', 'Solo telo', 20, 'pz', 'blindato'),
    V('av2', 'Posa accessori', 'Avvolgibile', 'Telo, guide, rullo, cinghia e avvolgitore', 50, 'pz', 'blindato'),
    V('av3', 'Posa accessori', 'Avvolgibile', 'Telo, guide e motore', 70, 'pz', 'blindato'),
    V('aca1', 'Posa accessori', 'Accessorio avvolgibile', 'Sporgere', 20),
    V('aca2', 'Posa accessori', 'Accessorio avvolgibile', 'Cinghia e avvolgitore', 20),
    V('mot', 'Posa accessori', 'Motore avvolgibile', 'Installazione', 30),
    V('cas', 'Posa accessori', 'Cassonetto avvolgibile', '', 40),
    V('inf', 'Posa accessori', 'Inferriata finestra', '', 40),
    V('inpf', 'Posa accessori', 'Inferriata portafinestra', '', 50),
    V('pcf', 'Posa accessori', 'Persiana chimico finestra', '', 60),
    V('pcpf', 'Posa accessori', 'Persiana chimico portafinestra', '', 70),
    V('ptf', 'Posa accessori', 'Persiana telaio finestra', '', 40, 'pz', 'blindato'),
    V('ptpf', 'Posa accessori', 'Persiana telaio portafinestra', '', 50, 'pz', 'blindato'),
    V('frf', 'Posa accessori', 'Frangisole finestra', '', 60, 'pz', 'luce'),
    V('frpf', 'Posa accessori', 'Frangisole portafinestra', '', 70, 'pz', 'luce'),
    V('coi1', 'Posa accessori', 'Coibentazione cassonetti', 'Termica', 60),
    V('coi2', 'Posa accessori', 'Coibentazione cassonetti', 'Termica e acustica', 80),

    V('pi1', 'Posa porte interne e blindate', 'Porta interna 1 anta', '', 70),
    V('pi2', 'Posa porte interne e blindate', 'Porta interna 2 ante', '', 100),
    V('pis', 'Posa porte interne e blindate', 'Porta interna scorrevole', '', 90),
    V('vet', 'Posa porte interne e blindate', 'Vetrata', 'Scorrevole/battente', 120),
    V('foro', 'Posa porte interne e blindate', 'Realizzazione foro chiave', '', 20),
    V('pb1', 'Posa porte interne e blindate', 'Porta blindata', 'Solo posa', 100),
    V('pb2', 'Posa porte interne e blindate', 'Porta blindata', 'Con posa controtelaio (chimico)', 300),
    V('pdi', 'Posa porte interne e blindate', 'Portoncino d’ingresso', '', 100),
    V('pan1', 'Posa porte interne e blindate', 'Pannello blindato', '', 40),
    V('pan2', 'Posa porte interne e blindate', 'Pannello blindato', 'Fori maniglieria da realizzare', 50),
    V('pan3', 'Posa porte interne e blindate', 'Pannello blindato', 'Fori maniglieria da realizzare e rifilare', 70),
    V('kit', 'Posa porte interne e blindate', 'Installazione kit corpifili', '', 30),
    V('rei', 'Posa porte interne e blindate', 'Porta Rei con certificazione', '', 250),

    V('psez', 'Posa portoni da garage', 'Portone sezionale', '', 400),
    V('pind', 'Posa portoni da garage', 'Portone industriale', '', 600),
    V('plib', 'Posa portoni da garage', 'Portone a libro', '', 600),
    V('sman', 'Posa portoni da garage', 'Sostituzione manto', '', 120),
    V('saut', 'Posa portoni da garage', 'Sostituzione automazione', '', 120),
    V('sfot', 'Posa portoni da garage', 'Sostituzione fotocellule', '', 30),

    V('smur', 'Smontaggio, scarico, tiro al piano e tariffa oraria', 'Smuratura vecchio telaio', '', 50),
    V('smon', 'Smontaggio, scarico, tiro al piano e tariffa oraria', 'Smontaggio', '', 10),
    V('scar', 'Smontaggio, scarico, tiro al piano e tariffa oraria', 'Scarico', '', 10),
    V('tiro', 'Smontaggio, scarico, tiro al piano e tariffa oraria', 'Tiro al piano', 'Escluso alzante', 10),
    V('tras', 'Smontaggio, scarico, tiro al piano e tariffa oraria', 'Trasferta', '', null, 'corpo'),
    V('ssez', 'Smontaggio, scarico, tiro al piano e tariffa oraria', 'Smontaggio sezionale', '', 150),
    V('ora', 'Smontaggio, scarico, tiro al piano e tariffa oraria', 'Tariffa oraria', '', 30, 'ora'),

    V('dcr', 'Assistenza e manutenzione', 'Diritto di chiamata', 'Prezzo al rivenditore, compresa 1 ora', 70, 'corpo'),
    V('dcc', 'Assistenza e manutenzione', 'Diritto di chiamata', 'Prezzo al cliente finale, compresa 1 ora', 90, 'corpo'),
    V('oex', 'Assistenza e manutenzione', 'Ora lavorativa extra', 'Prezzo al cliente finale', 45, 'ora'),
    V('man', 'Assistenza e manutenzione', 'Manutenzione programmata', '', null, 'corpo'),
  ],
};

export const AZIENDA_BASE = {
  ragioneSociale: 'CASSERO INSTALLAZIONI DI CASSERO JACOPO ANDREA',
  piva: '02809200062',
  email: 'info@casseroinstallazioni.it',
  telefono: '+39 328 0180313',
  indirizzo: '',
  iban: '',
  ivaPredefinita: '22',
  validitaGiorni: 30,
  notaImprevisti: 'In caso di imprevisti, il tempo necessario alla risoluzione sarà addebitato secondo la tariffa oraria.',
  condizioni: `1. Accettazione del preventivo
Il presente preventivo deve essere letto, accettato e sottoscritto dal Cliente prima dell'inizio dei lavori. La firma vale come accettazione integrale dei prezzi e delle condizioni qui riportate.

2. Modalità di pagamento
Il pagamento deve essere effettuato all'emissione della fattura, tramite bonifico bancario. Nella causale del bonifico è obbligatorio indicare il numero della fattura di riferimento.

3. Lavori oggetto di preventivo
Per i cantieri oggetto di preventivo, ci si riserva la facoltà di addebitare eventuali lavorazioni extra non comprese nel preventivo stesso. Tali extra saranno sempre indicati nel consuntivo finale.

4. Variazioni e servizi non indicati
Il presente listino può essere soggetto a variazioni. Per i servizi non indicati nel listino, il Cliente è tenuto a richiederne il costo prima dell'esecuzione.

5. Trasferte
In caso di trasferta, le spese di vitto e alloggio sono a carico del Cliente. Qualora tali spese vengano sostenute direttamente dall'installatore, saranno conteggiate a fine lavoro con una maggiorazione del 15%.

6. Contenuti fotografici e video
Con la sottoscrizione del presente listino, il Cliente finale autorizza l'installatore a realizzare foto e video presso i cantieri in cui opera e a pubblicarli sui propri canali social (Instagram e Facebook) a scopo promozionale. Nel caso in cui il cliente finale non desideri che vengano effettuate riprese, è tenuto a comunicarlo prima dell'inizio dei lavori. In assenza di tale comunicazione, l'autorizzazione si intende valida per tutti i cantieri.

7. Annullamenti e fermi cantiere
In caso di annullamento del cantiere senza il necessario preavviso, o di impossibilità ad avviare o proseguire i lavori per cause non imputabili all'installatore (esempio: materiale errato, mancante o danneggiato, cantiere non pronto o non accessibile), potrà essere addebitato al Rivenditore un importo a titolo di indennizzo pari a € 175 per la mezza giornata oppure € 300 per la giornata intera, in base all'effettivo fermo lavorativo. A tali importi si aggiungono le eventuali spese di trasferta già sostenute. L'indennizzo sarà indicato nel conteggio finale.`,
};

export const UNITA = { pz: 'pz', ora: 'ore', corpo: 'a corpo', km: 'km' };
export const UNITA_LUNGA = { pz: 'a pezzo', ora: 'a ora', corpo: 'a corpo' };

// Regimi IVA: valore -> etichetta e nota per il documento
export const IVA = [
  ['22', 'IVA 22%', 22, ''],
  ['10', 'IVA 10%', 10, ''],
  ['4', 'IVA 4%', 4, ''],
  ['rc', 'Inversione contabile', 0, 'Operazione soggetta a inversione contabile (reverse charge) ai sensi dell’art. 17, comma 6, DPR 633/1972.'],
  ['fo', 'Senza IVA (forfettario)', 0, 'Operazione effettuata ai sensi dell’art. 1, commi 54-89, Legge 190/2014 (regime forfettario): non soggetta a IVA.'],
  ['no', 'Prezzi IVA esclusa', 0, 'Prezzi IVA esclusa.'],
];
export const ivaOf = k => IVA.find(i => i[0] === String(k)) || IVA[0];

const r2 = n => Math.round((+n || 0) * 100) / 100;
const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };

/** Prezzo unitario di una riga, maggiorazioni comprese. */
export function prezzoUnitario(riga, listino = LISTINO_BASE) {
  let p = num(riga.prezzo);
  if (riga.blindato) p += num(riga.maggBlindato ?? listino.maggBlindato);
  if (riga.luce) p += num(riga.maggLuce ?? listino.maggLuce);
  return r2(p);
}
export const totaleRiga = (riga, listino) => r2(num(riga.qta) * prezzoUnitario(riga, listino));

/** Totali di un documento (preventivo, posa o intervento). */
/** Riga di sconto con l'importo calcolato: in euro (sempre negativo) o in percentuale sulle voci di lavoro. */
export function rigaSconto(r, base) {
  if (r.unita === 'pct') { const p = Math.abs(num(r.prezzo)); return { ...r, unita: 'corpo', qta: 1, pct: p, prezzo: -r2(base * p / 100), descr: r.descr && !/^sconto$/i.test(r.descr.trim()) ? r.descr : `Sconto ${String(p).replace('.', ',')}%` }; }
  return { ...r, qta: num(r.qta) || 1, prezzo: -Math.abs(num(r.prezzo)) };
}
/** Somma delle voci di lavoro: senza trasferta e senza sconti. */
export const baseSconto = (righe, listino = LISTINO_BASE) => r2((righe || []).filter(r => r.voce !== 'km' && r.voce !== 'sconto' && r.voce !== 'arrot').reduce((s, r) => s + totaleRiga(r, listino), 0));
export function totali(doc, listino = LISTINO_BASE) {
  const grezze = (doc.righe || []).filter(r => r.descr || r.prezzo);
  const base = baseSconto(grezze, listino);
  const righe = grezze.map(r => r.voce === 'sconto' ? rigaSconto(r, base) : r);
  const imponibileRighe = r2(righe.reduce((s, r) => s + totaleRiga(r, listino), 0));
  const pct = doc.urgenza ? num(doc.urgenzaPct ?? listino.urgenzaPct) : 0;
  // la trasferta a km e gli sconti non hanno maggiorazione urgenza
  const urgenza = r2(righe.filter(r => r.voce !== 'km' && r.voce !== 'sconto' && r.voce !== 'arrot').reduce((s, r) => s + totaleRiga(r, listino), 0) * pct / 100);
  const imponibile = r2(imponibileRighe + urgenza);
  const [, ivaLabel, ivaPct, ivaNota] = ivaOf(doc.iva ?? '22');
  const iva = r2(imponibile * ivaPct / 100);
  return { righe, imponibileRighe, urgenzaPct: pct, urgenza, imponibile, ivaLabel, ivaPct, ivaNota, iva, totale: r2(imponibile + iva) };
}

/** Nuova riga a partire da una voce del listino. */
export function rigaDaVoce(v, qta = 1) {
  return {
    voce: v.id,
    descr: v.variante ? `${v.nome} – ${v.variante}` : v.nome,
    unita: v.unita || 'pz',
    qta,
    prezzo: v.prezzo ?? '',
    daConcordare: v.prezzo == null,
    magg: v.magg || '',
    blindato: false,
    luce: false,
  };
}

/** Prossimo numero di preventivo dell'anno, es. "2026/004". */
export function prossimoNumero(preventivi, anno) {
  const max = (preventivi || []).reduce((m, p) => {
    const mm = String(p.numero || '').match(/^(\d{4})\/(\d+)$/);
    return mm && +mm[1] === +anno ? Math.max(m, +mm[2]) : m;
  }, 0);
  return `${anno}/${String(max + 1).padStart(3, '0')}`;
}
