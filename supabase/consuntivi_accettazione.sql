-- Diario di Posa · IL RIVENDITORE ACCETTA IL CONSUNTIVO o CHIEDE UNA VARIAZIONE DI PREZZO.
-- Da eseguire una volta: Supabase › SQL Editor › New query › incolla tutto › Run. Si può rilanciare senza danni.
-- Serve sedi_rivenditori.sql già lanciato. Non cancella dati.
--
-- 1. Sotto il consuntivo che metti nella sua cartella il rivenditore trova «Accetto» o «Chiedo una variazione di prezzo» (con la nota).
--    Accettato: il lavoro passa da solo in «Da fatturare». Variazione: resta in «Da accettare» con la sua nota e ti arriva l'avviso.
-- 2. Solo la prima volta che lo lanci: i consuntivi che oggi sono in «Da fatturare» senza firma del cliente
--    passano nella sezione nuova «Da accettare» (se qualcuno era già d'accordo, toccalo e segnalo accettato).

alter table public.documenti_cliente add column if not exists esito text;
alter table public.documenti_cliente add column if not exists esito_quando timestamptz;
alter table public.documenti_cliente add column if not exists esito_nota text;
-- a quali lavori si riferisce il consuntivo: «l:<id posa>|i:<id intervento>|…»
alter table public.documenti_cliente add column if not exists consuntivo text;

-- solo la prima volta (quando la funzione qui sotto non c'è ancora)
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rispondi_consuntivo') then
    update public.records set data = data || '{"amm": "acc"}'::jsonb, updated_at = now()
     where kind in ('lavori', 'interventi') and not deleted
       and data->>'amm' = 'cons' and coalesce(data->>'consFirma', '') = '';
  end if;
end $$;

create or replace function public.rispondi_consuntivo(documento text, scelta text, messaggio text) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.membri; d public.documenti_cliente; chi text; msg text := left(btrim(coalesce(messaggio, '')), 1000);
        t text; k text; rid text; trovati int := 0; fatturati int := 0; primo public.records; r public.records; quando text;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if scelta is null or scelta not in ('accettato', 'variazione') then raise exception 'Risposta non valida'; end if;
  if scelta = 'variazione' and msg = '' then raise exception 'Scrivi la variazione di prezzo che chiedi'; end if;
  select * into d from public.documenti_cliente where id = documento and titolare = m.titolare and coalesce(consuntivo, '') <> '';
  if d.id is null or not (d.rivenditore = m.user_id or public._stessa_azienda(d.rivenditore)) then raise exception 'Consuntivo non trovato'; end if;

  -- i lavori del consuntivo
  foreach t in array string_to_array(d.consuntivo, '|') loop
    k := case left(t, 2) when 'l:' then 'lavori' when 'i:' then 'interventi' end; rid := substr(t, 3);
    if k is null or rid = '' then continue; end if;
    select * into r from public.records where user_id = d.titolare and kind = k and id = rid and not deleted for update;
    if r.id is null then continue; end if;
    trovati := trovati + 1; if primo.id is null then primo := r; end if;
    if r.data->>'amm' in ('fatt', 'pag') then fatturati := fatturati + 1; end if;
  end loop;
  if trovati = 0 then raise exception 'Questo consuntivo non c''è più: chiedi all''installatore'; end if;

  -- già fatturato: non cambio niente
  if fatturati > 0 then
    update public.documenti_cliente set esito = 'accettato', esito_quando = coalesce(esito_quando, now())
     where titolare = d.titolare and consuntivo = d.consuntivo and esito is distinct from 'accettato';
    return 'gia:fatturato';
  end if;

  chi := public._nome_riv(m);
  quando := to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI');
  foreach t in array string_to_array(d.consuntivo, '|') loop
    k := case left(t, 2) when 'l:' then 'lavori' when 'i:' then 'interventi' end; rid := substr(t, 3);
    if k is null or rid = '' then continue; end if;
    update public.records set
      data = data || jsonb_build_object(
        'amm', case when scelta = 'accettato' then
                      case when coalesce(data->>'amm', 'da_cons') in ('da_cons', 'inv', 'acc') then 'cons' else data->>'amm' end
                    else case when coalesce(data->>'amm', 'da_cons') in ('da_cons', 'inv', 'cons') then 'acc' else data->>'amm' end end,
        'esitoCons', jsonb_build_object('esito', scelta, 'chi', chi, 'nota', msg, 'quando', quando)),
      updated_at = now()
    where user_id = d.titolare and kind = k and id = rid and not deleted;
  end loop;
  update public.documenti_cliente set esito = scelta, esito_quando = now(), esito_nota = nullif(msg, '')
   where titolare = d.titolare and consuntivo = d.consuntivo;

  insert into public.avvisi_titolare (titolare, titolo, testo)
  values (d.titolare, case when scelta = 'accettato' then 'Consuntivo accettato' else 'Variazione di prezzo sul consuntivo' end,
    chi || ' · ' || coalesce(nullif(btrim(coalesce(primo.data->>'riferimento', '')), ''), nullif(btrim(coalesce(primo.data->>'cliente', '')), ''), 'consuntivo') ||
    case when trovati > 1 then ' (' || trovati || ' lavori)' else '' end ||
    case when msg <> '' then E'\n' || msg else '' end);
  return scelta;
end $$;
revoke all on function public.rispondi_consuntivo(text, text, text) from public, anon;
grant execute on function public.rispondi_consuntivo(text, text, text) to authenticated;
