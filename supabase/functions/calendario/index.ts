// Calendario personale da aggiungere al Calendario dell'iPhone (e quindi a CarPlay).
// Indirizzo: /functions/v1/calendario?t=CODICE  — il codice si crea nell'app (menu › Cantieri).
// Contiene pose, interventi programmati e impegni (ferie, fiere, corsi) con l'indirizzo del cantiere.

const URL_DB = Deno.env.get('SUPABASE_URL')!;
const CHIAVE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const H = { apikey: CHIAVE, Authorization: `Bearer ${CHIAVE}` };

async function leggi(path: string) {
  const r = await fetch(`${URL_DB}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${r.status}`);
  return await r.json();
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoGiorno = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const giorno = (s: string) => new Date(s + 'T12:00:00Z');
const compatto = (s: string) => s.replaceAll('-', '');
const esc = (s: unknown) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function piega(riga: string) {
  // righe al massimo di 75 byte, come vuole il formato iCalendar
  const out: string[] = []; let cur = ''; let len = 0;
  for (const ch of riga) {
    const b = new TextEncoder().encode(ch).length;
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

Deno.serve(async (req: Request) => {
  const t = new URL(req.url).searchParams.get('t') || '';
  if (!/^[a-f0-9]{32}$/.test(t)) return new Response('Codice del calendario non valido', { status: 404 });
  try {
    const trovato = await leggi(`records?kind=eq.cfg&id=eq.impostazioni&deleted=eq.false&data->calendario->>token=eq.${t}&select=user_id,data`);
    if (!trovato.length) return new Response('Calendario non trovato', { status: 404 });
    const uid = trovato[0].user_id;
    const imp = trovato[0].data || {};
    const G = { inizio: '07:30', fine: '17:00', giorni: [1, 2, 3, 4, 5], ...(imp.giornata || {}) };
    const rows: { kind: string; id: string; data: any }[] = [];
    for (let from = 0; ; from += 1000) {
      const r = await fetch(`${URL_DB}/rest/v1/records?user_id=eq.${uid}&deleted=eq.false&kind=in.(lavori,interventi,eventi)&select=kind,id,data`, { headers: { ...H, Range: `${from}-${from + 999}` } });
      const page = await r.json(); rows.push(...page);
      if (page.length < 1000) break;
    }
    // solo da 60 giorni fa in avanti, per tenere il calendario leggero
    const limite = isoGiorno(new Date(Date.now() - 60 * 864e5));
    const ora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const hm = (s: string) => String(s || '07:30').replace(':', '') + '00';
    const L: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Diario di Posa//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:Diario di Posa', 'X-WR-TIMEZONE:Europe/Rome', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', ...VTIMEZONE];
    const evento = (uidEv: string, campi: string[]) => { L.push('BEGIN:VEVENT', `UID:${uidEv}@diario-di-posa`, `DTSTAMP:${ora}`, ...campi.map(piega), 'END:VEVENT'); };

    for (const { kind, id, data: x } of rows) {
      if (kind === 'lavori' && x.data) {
        const fine = x.dataFine && x.dataFine > x.data ? x.dataFine : x.data;
        if (fine < limite) continue;
        const giorni: string[] = [];
        for (let d = giorno(x.data); isoGiorno(d) <= fine && giorni.length < 120; d.setUTCDate(d.getUTCDate() + 1)) {
          const k = isoGiorno(d);
          if (x.soloFeriali !== false && !G.giorni.includes(d.getUTCDay()) && k !== x.data && k !== fine) continue;
          giorni.push(k);
        }
        giorni.forEach((k, i) => evento(`posa-${id}-${k}`, [
          `SUMMARY:${esc(`${x.urgenzaApplicata ? '⚠ ' : ''}Posa · ${x.cliente || 'Cliente'}${giorni.length > 1 ? ` (${i + 1}/${giorni.length})` : ''}`)}`,
          `DTSTART;TZID=Europe/Rome:${compatto(k)}T${hm(G.inizio)}`,
          `DTEND;TZID=Europe/Rome:${compatto(k)}T${hm(G.fine)}`,
          ...(x.indirizzo ? [`LOCATION:${esc(x.indirizzo)}`] : []),
          `DESCRIPTION:${esc([x.installato, x.note, x.telefono && 'Tel. ' + x.telefono].filter(Boolean).join('\n'))}`,
        ]));
      }
      if (kind === 'interventi' && x.dataProg && x.stato !== 'annullato' && x.dataProg >= limite) {
        const inizio = hm(G.inizio), h = +inizio.slice(0, 2) + 2;
        evento(`int-${id}`, [
          `SUMMARY:${esc(`${x.urgenza === 'critica' ? '⚠ ' : ''}Intervento · ${x.cliente || 'Cliente'}${x.stato === 'completato' ? ' (fatto)' : ''}`)}`,
          `DTSTART;TZID=Europe/Rome:${compatto(x.dataProg)}T${inizio}`,
          `DTEND;TZID=Europe/Rome:${compatto(x.dataProg)}T${pad(Math.min(h, 23))}${inizio.slice(2)}`,
          ...(x.indirizzo ? [`LOCATION:${esc(x.indirizzo)}`] : []),
          `DESCRIPTION:${esc([x.descrizione, x.telefono && 'Tel. ' + x.telefono].filter(Boolean).join('\n'))}`,
        ]);
      }
      if (kind === 'eventi' && x.data) {
        const fine = x.dataFine && x.dataFine > x.data ? x.dataFine : x.data;
        if (fine < limite) continue;
        const dopo = new Date(giorno(fine).getTime() + 864e5);
        const nomi: Record<string, string> = { ferie: 'Ferie', fiera: 'Fiera', corso: 'Corso', altro: 'Impegno' };
        evento(`ev-${id}`, [
          `SUMMARY:${esc(x.titolo || nomi[x.tipo] || 'Impegno')}`,
          `DTSTART;VALUE=DATE:${compatto(x.data)}`,
          `DTEND;VALUE=DATE:${compatto(isoGiorno(dopo))}`,
          ...(x.luogo ? [`LOCATION:${esc(x.luogo)}`] : []),
          `DESCRIPTION:${esc([nomi[x.tipo], x.orario, x.note].filter(Boolean).join('\n'))}`,
          ...(x.tipo === 'ferie' ? ['TRANSP:OPAQUE'] : []),
        ]);
      }
    }
    L.push('END:VCALENDAR');
    return new Response(L.join('\r\n') + '\r\n', {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache, max-age=0', 'Content-Disposition': 'inline; filename="diario-di-posa.ics"' },
    });
  } catch (e) {
    return new Response('Calendario non disponibile, riprova più tardi', { status: 503 });
  }
});
