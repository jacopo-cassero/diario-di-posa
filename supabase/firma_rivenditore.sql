-- Diario di Posa · IL RIVENDITORE ACCETTA E FIRMA preventivi e consuntivi dalla sua area.
-- Da eseguire una volta: Supabase › SQL Editor › New query › incolla tutto › Run. Si può rilanciare senza danni.
-- Servono già lanciati: preventivo_risposta_rivenditore.sql, sedi_rivenditori.sql, consuntivi_accettazione.sql. Non cancella dati.
--
-- Il rivenditore apre il PDF, firma (con il dito, con il mouse o con l'immagine della sua firma) e conferma con la sua password.
-- L'app crea il PDF firmato nella sua cartella; qui lo si collega al preventivo o al consuntivo e lo si segna accettato.
-- Il PDF firmato lo vedi tu (nella scheda) e lui (nella sua cartella).

alter table public.documenti_cliente add column if not exists firma_path text;
alter table public.documenti_cliente add column if not exists firma_quando timestamptz;
alter table public.documenti_cliente add column if not exists firma_nome text;
alter table public.documenti_cliente add column if not exists firma_hash text;

create or replace function public.firma_documento(documento text, firma jsonb, messaggio text) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.membri; d public.documenti_cliente; esito text; fpath text; fnome text; fhash text; chi text; quando text; t text; k text; rid text; obj jsonb;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if firma is null or jsonb_typeof(firma) <> 'object' then raise exception 'Firma non valida'; end if;
  fpath := btrim(coalesce(firma->>'path', ''));
  fnome := left(btrim(coalesce(firma->>'nome', '')), 120);
  fhash := left(regexp_replace(coalesce(firma->>'hash', ''), '[^0-9a-f]', '', 'g'), 64);
  -- il PDF firmato deve stare nella SUA cartella ed esserci davvero
  if split_part(fpath, '/', 1) <> auth.uid()::text or split_part(fpath, '/', 2) <> 'firme' or position('..' in fpath) > 0 or fpath !~ '\.pdf$' then
    raise exception 'PDF firmato non valido';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'file' and o.name = fpath) then raise exception 'Il PDF firmato non è stato caricato: riprova'; end if;
  if fnome = '' then raise exception 'Scrivi il nome di chi firma'; end if;

  select * into d from public.documenti_cliente where id = documento and titolare = m.titolare;
  if d.id is null or not (d.rivenditore = m.user_id or public._stessa_azienda(d.rivenditore)) then raise exception 'Documento non trovato'; end if;

  -- accetta come facevano i tasti di prima (stessi controlli, stesso avviso a te)
  if d.kind = 'preventivi' then
    esito := public.rispondi_preventivo(documento, 'accettato', messaggio);
    if esito = 'gia:rifiutato' then raise exception 'Questo preventivo risulta non accettato: chiama l''installatore'; end if;
  elsif coalesce(d.consuntivo, '') <> '' then
    esito := public.rispondi_consuntivo(documento, 'accettato', messaggio);
  else
    raise exception 'Questo documento non si firma da qui';
  end if;

  chi := public._nome_riv(m);
  quando := to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI');
  obj := jsonb_build_object('path', fpath, 'nome', left(coalesce(nullif(btrim(d.titolo), ''), 'Documento') || ' - firmato.pdf', 160), 'tipo', 'application/pdf');

  if d.kind = 'preventivi' then
    update public.records set
      data = data || jsonb_build_object('firmaRiv', jsonb_build_object('path', fpath, 'firmatario', fnome, 'chi', chi, 'quando', quando, 'hash', fhash))
                  || case when coalesce(data->'firmato'->>'path', '') = '' then jsonb_build_object('firmato', obj) else '{}'::jsonb end,
      updated_at = now()
    where user_id = d.titolare and kind = 'preventivi' and id = d.lavoro_id and not deleted;
    update public.documenti_cliente set firma_path = fpath, firma_quando = now(), firma_nome = fnome, firma_hash = fhash
     where titolare = d.titolare and kind = 'preventivi' and lavoro_id = d.lavoro_id;
  else
    foreach t in array string_to_array(d.consuntivo, '|') loop
      k := case left(t, 2) when 'l:' then 'lavori' when 'i:' then 'interventi' end; rid := substr(t, 3);
      if k is null or rid = '' then continue; end if;
      update public.records set
        data = data || jsonb_build_object('consFirmaRiv', jsonb_build_object('path', fpath, 'nome', obj->>'nome', 'firmatario', fnome, 'chi', chi, 'quando', quando, 'hash', fhash)),
        updated_at = now()
      where user_id = d.titolare and kind = k and id = rid and not deleted;
    end loop;
    update public.documenti_cliente set firma_path = fpath, firma_quando = now(), firma_nome = fnome, firma_hash = fhash
     where titolare = d.titolare and consuntivo = d.consuntivo;
  end if;

  -- l'avviso che ti è appena arrivato: dice anche che è firmato
  update public.avvisi_titolare set titolo = titolo || ' e firmato', testo = testo || E'\nFirmato da ' || fnome
   where id = (select id from public.avvisi_titolare where titolare = d.titolare and titolo in ('Preventivo accettato', 'Consuntivo accettato') and creato > now() - interval '1 minute' order by creato desc limit 1);
  return 'firmato';
end $$;
revoke all on function public.firma_documento(text, jsonb, text) from public, anon;
grant execute on function public.firma_documento(text, jsonb, text) to authenticated;
