-- Diario di Posa · IL RIVENDITORE ACCETTA O RIFIUTA IL PREVENTIVO che gli hai mandato.
-- Da eseguire una volta: Supabase › SQL Editor › New query › incolla tutto › Run. Si può rilanciare senza danni.
-- Serve lavori_rivenditore_modifica.sql già lanciato (per gli avvisi a te). Non cancella dati.
-- Quando il rivenditore risponde, il tuo preventivo diventa «Accettato» o «Rifiutato» da solo e ti arriva l'avviso.

alter table public.documenti_cliente add column if not exists esito text;            -- 'accettato' o 'rifiutato'
alter table public.documenti_cliente add column if not exists esito_quando timestamptz;
alter table public.documenti_cliente add column if not exists esito_nota text;

create or replace function public.rispondi_preventivo(documento text, scelta text, messaggio text) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.membri; d public.documenti_cliente; p public.records; chi text; msg text := left(btrim(coalesce(messaggio, '')), 1000); gia text;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if scelta is null or scelta not in ('accettato', 'rifiutato') then raise exception 'Risposta non valida'; end if;
  select * into d from public.documenti_cliente where id = documento and kind = 'preventivi' and titolare = m.titolare;
  if d.id is null or not (d.rivenditore = m.user_id or public._stessa_azienda(d.rivenditore)) then raise exception 'Preventivo non trovato'; end if;
  select * into p from public.records where user_id = d.titolare and kind = 'preventivi' and id = d.lavoro_id and not deleted for update;
  if p.id is null then raise exception 'Questo preventivo non c''è più: chiedi all''installatore'; end if;

  -- già deciso (da lui o da te): non cambio niente, aggiorno solo quello che vede il rivenditore
  gia := p.data->>'stato';
  if gia in ('accettato', 'rifiutato') then
    update public.documenti_cliente set esito = gia, esito_quando = coalesce(esito_quando, now())
     where titolare = d.titolare and kind = 'preventivi' and lavoro_id = p.id and esito is distinct from gia;
    return 'gia:' || gia;
  end if;

  chi := coalesce(nullif(m.azienda, ''), nullif(m.nome, ''), 'Rivenditore');
  update public.records set
    data = data || jsonb_build_object('stato', scelta, 'esitoRiv', jsonb_build_object('esito', scelta, 'chi', chi, 'nota', msg,
      'quando', to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI'))),
    updated_at = now()
  where user_id = p.user_id and kind = p.kind and id = p.id;
  update public.documenti_cliente set esito = scelta, esito_quando = now(), esito_nota = nullif(msg, '')
   where titolare = d.titolare and kind = 'preventivi' and lavoro_id = p.id;

  insert into public.avvisi_titolare (titolare, titolo, testo)
  values (d.titolare, case when scelta = 'accettato' then 'Preventivo accettato' else 'Preventivo non accettato' end,
    chi || ' · Preventivo ' || coalesce(p.data->>'numero', '') ||
    coalesce(' · ' || nullif(btrim(coalesce(p.data->>'riferimento', '')), ''), ' · ' || nullif(p.data->'cliente'->>'nome', ''), '') ||
    case when msg <> '' then E'\n' || msg else '' end);
  return scelta;
end $$;
revoke all on function public.rispondi_preventivo(text, text, text) from public, anon;
grant execute on function public.rispondi_preventivo(text, text, text) to authenticated;
