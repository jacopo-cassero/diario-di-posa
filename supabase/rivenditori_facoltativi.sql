-- Diario di Posa · RIVENDITORI: dati della prenotazione e della richiesta di preventivo facoltativi.
-- Da eseguire una volta sola: Supabase › SQL Editor › New query › incolla tutto › Run.
-- Sostituisce solo due funzioni; i dati non vengono toccati.

create or replace function public.prenota(da date, a date, tipo text, cliente text, indirizzo text, telefono text, scheda jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  m public.membri; imp jsonb; lav jsonb; pre int; mesi int; libero int; nuovo uuid;
  oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  imp := public._impostazioni(m.titolare);
  lav := coalesce(imp->'giornata'->'giorni', '[1,2,3,4,5]'::jsonb);
  pre := coalesce((imp->'accessi'->>'preavviso')::int, 2);
  mesi := coalesce((imp->'accessi'->>'mesi')::int, 4);
  if da is null or a is null or a < da then raise exception 'Date non valide'; end if;
  if a - da > 14 then raise exception 'Al massimo 15 giorni per prenotazione'; end if;
  if da < oggi + pre then raise exception 'Serve un preavviso di almeno % giorni', pre; end if;
  if a > (oggi + make_interval(months => mesi))::date then raise exception 'Si può prenotare al massimo % mesi avanti', mesi; end if;
  perform pg_advisory_xact_lock(hashtext('prenota:' || m.titolare::text));
  if exists (select 1 from public._occupati(m.titolare, da, a) o where lav @> to_jsonb(extract(dow from o.giorno)::int)) then
    raise exception 'Una o più giornate sono appena state occupate: aggiorna il calendario';
  end if;
  select count(*) into libero from generate_series(da, a, interval '1 day') g where lav @> to_jsonb(extract(dow from g)::int);
  if libero = 0 then raise exception 'Nelle date scelte non ci sono giornate lavorative'; end if;
  insert into public.prenotazioni (titolare, rivenditore, data, data_fine, tipo, cliente, indirizzo, telefono, scheda)
  values (m.titolare, m.user_id, da, a, case when tipo in ('intervento', 'sopralluogo') then tipo else 'posa' end,
          left(trim(cliente), 120), left(trim(indirizzo), 200), left(trim(telefono), 40),
          case when jsonb_typeof(scheda) = 'object' and length(scheda::text) < 20000 then scheda else '{}'::jsonb end)
  returning id into nuovo;
  return nuovo;
end $$;

create or replace function public.chiedi_preventivo(dati jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare m public.membri; nuovo uuid;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if jsonb_typeof(dati) <> 'object' or length(dati::text) > 30000 then raise exception 'Dati non validi'; end if;
  if (select count(*) from public.richieste_preventivo where rivenditore = m.user_id and creato > now() - interval '1 hour') >= 20 then
    raise exception 'Troppe richieste in poco tempo, riprova più tardi';
  end if;
  insert into public.richieste_preventivo (titolare, rivenditore, cliente, indirizzo, telefono, piano, ascensore, tiro, righe, note, stima)
  values (m.titolare, m.user_id, left(trim(dati->>'cliente'), 120), left(trim(dati->>'indirizzo'), 200), left(trim(dati->>'telefono'), 40),
          left(dati->>'piano', 40), left(dati->>'ascensore', 10), coalesce((dati->>'tiro')::boolean, false),
          case when jsonb_typeof(dati->'righe') = 'array' then dati->'righe' else '[]'::jsonb end, left(trim(dati->>'note'), 2000), nullif(dati->>'stima', '')::numeric)
  returning id into nuovo;
  return nuovo;
end $$;
