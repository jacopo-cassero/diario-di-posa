// Calendario «Diario di Posa» in formato iCalendar: pose, interventi programmati e impegni.
// Lo usa l'app per tenere aggiornato il calendario a cui l'iPhone è iscritto (visibile anche su CarPlay).

import { orarioDi } from './logica.js';

const pad = n => String(n).padStart(2, '0');
const isoGiorno = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const giorno = s => new Date(s + 'T12:00:00Z');
const compatto = s => s.replaceAll('-', '');
const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function piega(riga) {
  // righe al massimo di 75 byte, come vuole il formato iCalendar
  const out = []; let cur = '', len = 0; const enc = new TextEncoder();
  for (const ch of riga) {
    const b = enc.encode(ch).length;
    if (len + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
    cur += ch; len += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Rome',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];
const NOMI = { ferie: 'Ferie', fiera: 'Fiera', corso: 'Corso', altro: 'Impegno' };

/** @param S dati dell'app (lavori, interventi, eventi) @param giornata orari di lavoro @param stamp DTSTAMP (es. 20261028T190000Z) */
export function creaCalendario(S, giornata = {}, stamp = '') {
  const G = { inizio: '07:30', fine: '17:00', giorni: [1, 2, 3, 4, 5], ...giornata };
  const limite = isoGiorno(new Date(Date.now() - 60 * 864e5)); // da 60 giorni fa in avanti
  const ora = stamp || new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const hm = s => String(s || '07:30').replace(':', '') + '00';
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Diario di Posa//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Diario di Posa', 'X-WR-TIMEZONE:Europe/Rome', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', ...VTIMEZONE];
  const evento = (uid, campi) => { L.push('BEGIN:VEVENT', `UID:${uid}@diario-di-posa`, `DTSTAMP:${ora}`, ...campi.map(piega), 'END:VEVENT'); };

  for (const x of S.lavori || []) {
    if (!x.data) continue;
    const fine = x.dataFine && x.dataFine > x.data ? x.dataFine : x.data;
    if (fine < limite) continue;
    const giorni = [];
    for (let d = giorno(x.data); isoGiorno(d) <= fine && giorni.length < 120; d.setUTCDate(d.getUTCDate() + 1)) {
      const k = isoGiorno(d);
      if (x.soloFeriali !== false && !G.giorni.includes(d.getUTCDay()) && k !== x.data && k !== fine) continue;
      giorni.push(k);
    }
    const o = orarioDi(x);
    const ini = o ? o[0] : G.inizio, fin = o && o[1] ? o[1] : o ? `${pad(Math.min(+o[0].slice(0, 2) + 2, 23))}${o[0].slice(2)}` : G.fine;
    giorni.forEach((k, i) => evento(`posa-${x.id}-${k}`, [
      `SUMMARY:${esc(`${x.urgenzaApplicata ? '⚠ ' : ''}Posa · ${x.cliente || 'Cliente'}${giorni.length > 1 ? ` (${i + 1}/${giorni.length})` : ''}`)}`,
      `DTSTART;TZID=Europe/Rome:${compatto(k)}T${hm(ini)}`,
      `DTEND;TZID=Europe/Rome:${compatto(k)}T${hm(fin)}`,
      ...(x.indirizzo ? [`LOCATION:${esc(x.indirizzo)}`] : []),
      `DESCRIPTION:${esc([x.installato, x.note, x.telefono && 'Tel. ' + x.telefono].filter(Boolean).join('\n'))}`,
    ]));
  }
  for (const x of S.interventi || []) {
    if (!x.dataProg || x.stato === 'annullato' || x.dataProg < limite) continue;
    const o = orarioDi(x);
    const inizio = hm(o ? o[0] : G.inizio), h = +inizio.slice(0, 2) + 2;
    const fine = o && o[1] ? hm(o[1]) : `${pad(Math.min(h, 23))}${inizio.slice(2)}`;
    evento(`int-${x.id}`, [
      `SUMMARY:${esc(`${x.urgenza === 'critica' ? '⚠ ' : ''}Intervento · ${x.cliente || 'Cliente'}${x.stato === 'completato' ? ' (fatto)' : ''}`)}`,
      `DTSTART;TZID=Europe/Rome:${compatto(x.dataProg)}T${inizio}`,
      `DTEND;TZID=Europe/Rome:${compatto(x.dataProg)}T${fine}`,
      ...(x.indirizzo ? [`LOCATION:${esc(x.indirizzo)}`] : []),
      `DESCRIPTION:${esc([x.descrizione, x.telefono && 'Tel. ' + x.telefono].filter(Boolean).join('\n'))}`,
    ]);
  }
  for (const x of S.eventi || []) {
    if (!x.data) continue;
    const fine = x.dataFine && x.dataFine > x.data ? x.dataFine : x.data;
    if (fine < limite) continue;
    const dopo = new Date(giorno(fine).getTime() + 864e5);
    evento(`ev-${x.id}`, [
      `SUMMARY:${esc(x.titolo || NOMI[x.tipo] || 'Impegno')}`,
      `DTSTART;VALUE=DATE:${compatto(x.data)}`,
      `DTEND;VALUE=DATE:${compatto(isoGiorno(dopo))}`,
      ...(x.luogo ? [`LOCATION:${esc(x.luogo)}`] : []),
      `DESCRIPTION:${esc([NOMI[x.tipo], x.orario, x.note].filter(Boolean).join('\n'))}`,
      ...(x.tipo === 'ferie' ? ['TRANSP:OPAQUE'] : []),
    ]);
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}
