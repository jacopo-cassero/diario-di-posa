-- Diario di Posa · DATE IN FORSE che segni tu, anche senza rivenditore.
-- Da eseguire una volta: Supabase › SQL Editor › New query › incolla tutto › Run. Si può rilanciare senza danni.
-- Serve rivenditore_vede_note_foto.sql già lanciato. Non cancella dati.
--
-- 1. Il rivenditore vede le tue date «forse» nel suo calendario (nessuna notifica) e le può CONFERMARE o ANNULLARE da solo.
--    Annullare vale solo per le date forse segnate da te come segnaposto: la scheda va nel cestino (non si perde, si può recuperare).
-- 2. Gli altri rivenditori vedono quel giorno come «forse occupato».

create or replace function public.lavori_rivenditore(da date, a date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.membri; out jsonb;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if a - da > 800 then a := da + 800; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'kind', r.kind,
      'data', case when r.kind = 'interventi' then r.data->>'dataProg' else r.data->>'data' end,
      'dataFine', case when r.kind = 'lavori' then r.data->>'dataFine' else null end,
      'oraInizio', r.data->>'oraInizio', 'oraFine', r.data->>'oraFine', 'tuttoGiorno', r.data->'tuttoGiorno',
      'indirizzo', r.data->>'indirizzo', 'riferimento', coalesce(r.data->>'riferimento', r.data->>'clienteFinale'),
      'telefono', coalesce(r.data->>'telefono', ''),
      'cosa', case when r.kind = 'lavori' then r.data->>'installato' else r.data->>'descrizione' end,
      'voci', (select coalesce(jsonb_agg(jsonb_build_object('descr', coalesce(v->>'descr', v->>'voce'), 'qta', v->'qta', 'unita', v->>'unita')), '[]'::jsonb)
                 from jsonb_array_elements(case when jsonb_typeof(r.data->'righe') = 'array' then r.data->'righe' else '[]'::jsonb end) v
                where coalesce(v->>'voce', '') not in ('km', 'sconto', 'arrot') and coalesce(v->>'descr', v->>'voce', '') <> ''),
      'stato', case when r.kind = 'interventi' then r.data->>'stato' else null end,
      'fatto', case when r.kind = 'lavori' then jsonb_array_length(coalesce(r.data->'giorniFatti', '[]'::jsonb)) > 0 else (r.data->>'stato') = 'completato' end,
      'modificato', r.data->'modRiv'->>'quando',
      'noteRiv', coalesce(r.data->>'noteRiv', ''),
      -- data in forse: segnata dall'installatore, il rivenditore la può confermare (o annullare se è solo un segnaposto)
      'forse', coalesce((r.data->>'forse')::boolean, false),
      'dataForse', coalesce((r.data->>'dataForse')::boolean, false),
      -- quello che scrivi e alleghi tu (il tuo diario no: resta solo tuo)
      'note', coalesce(r.data->>'note', ''),
      'allegati', (select coalesce(jsonb_agg(jsonb_build_object('path', f->>'path', 'nome', f->>'nome', 'tipo', f->>'tipo', 'mini', f->>'mini')), '[]'::jsonb)
                     from jsonb_array_elements(case when jsonb_typeof(r.data->'allegati') = 'array' then r.data->'allegati' else '[]'::jsonb end) f
                    where coalesce(f->>'path', '') <> ''
                      and not exists (select 1 from public.records p where p.user_id = r.user_id and p.kind = 'preventivi' and p.data->'firmato'->>'path' = f->>'path')),
      'materiali', (select coalesce(jsonb_agg(jsonb_build_object('nome', x->>'nome', 'qta', x->'qta')), '[]'::jsonb)
                     from jsonb_array_elements(case when jsonb_typeof(r.data->'materiali') = 'array' then r.data->'materiali' else '[]'::jsonb end) x
                    where coalesce(x->>'nome', '') <> ''),
      'prenotazioneId', r.data->>'prenotazioneId',
      'sospesi', (select coalesce(jsonb_agg(s->>'t'), '[]'::jsonb) from jsonb_array_elements(coalesce(r.data->'sospesi', '[]'::jsonb)) s where coalesce((s->>'fatto')::boolean, false) = false)
    )), '[]'::jsonb) into out
  from public.records r
  where r.user_id = m.titolare and not r.deleted and r.kind in ('lavori', 'interventi')
    and coalesce(r.data->>'stato', '') <> 'annullato'
    and public._lavoro_del_rivenditore(m, r.data, r.id)
    and public._data(case when r.kind = 'interventi' then r.data->>'dataProg' else r.data->>'data' end) is not null
    and public._data(case when r.kind = 'interventi' then r.data->>'dataProg' else r.data->>'data' end) <= a
    and greatest(public._data(case when r.kind = 'interventi' then r.data->>'dataProg' else r.data->>'data' end), public._data(r.data->>'dataFine')) >= da;
  return out;
end $$;
revoke all on function public.lavori_rivenditore(date, date) from public, anon;
grant execute on function public.lavori_rivenditore(date, date) to authenticated;

-- il rivenditore conferma o annulla una data in forse
create or replace function public.rispondi_data_forse(tipo text, lavoro text, scelta text) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.membri; r public.records; chi text; giorno date;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if tipo not in ('lavori', 'interventi') or scelta is null or scelta not in ('conferma', 'annulla') then raise exception 'Risposta non valida'; end if;
  select * into r from public.records where user_id = m.titolare and kind = tipo and id = lavoro and not deleted for update;
  if r.id is null or not public._lavoro_del_rivenditore(m, r.data, r.id) then raise exception 'Lavoro non trovato'; end if;
  if not coalesce((r.data->>'forse')::boolean, false) then return 'gia'; end if;
  if scelta = 'annulla' and not coalesce((r.data->>'dataForse')::boolean, false) then
    raise exception 'Questa data non si può annullare da qui: chiama l''installatore';
  end if;
  chi := public._nome_riv(m);
  giorno := public._data(case when tipo = 'interventi' then r.data->>'dataProg' else r.data->>'data' end);
  if scelta = 'conferma' then
    update public.records set
      data = (data - 'forse' - 'dataForse') || jsonb_build_object('forseRisposta', jsonb_build_object('esito', 'confermata', 'chi', chi, 'quando', to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI'))),
      updated_at = now()
    where user_id = r.user_id and kind = r.kind and id = r.id;
  else
    update public.records set
      data = data || jsonb_build_object('forseRisposta', jsonb_build_object('esito', 'annullata', 'chi', chi, 'quando', to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI'))),
      deleted = true, updated_at = now()
    where user_id = r.user_id and kind = r.kind and id = r.id;
  end if;
  insert into public.avvisi_titolare (titolare, titolo, testo)
  values (m.titolare, case when scelta = 'conferma' then 'Data confermata dal rivenditore' else 'Data in forse annullata dal rivenditore' end,
    chi || coalesce(' · ' || to_char(giorno, 'DD/MM'), '') || coalesce(' · ' || nullif(btrim(coalesce(r.data->>'riferimento', '')), ''), '')
    || case when scelta = 'annulla' then E'\nIl giorno torna libero. La scheda è nel cestino, se ti serve la recuperi.' else '' end);
  return scelta;
end $$;
revoke all on function public.rispondi_data_forse(text, text, text) from public, anon;
grant execute on function public.rispondi_data_forse(text, text, text) to authenticated;

-- i giorni occupati solo da date in forse (per gli altri rivenditori: «forse occupato»)
create or replace function public.giorni_forse(da date, a date) returns setof date
language plpgsql stable security definer set search_path = '' as $$
declare m public.membri; tit uuid;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo';
  if m.ruolo is distinct from 'rivenditore' and not public._gestore(public._titolare()) then raise exception 'Accesso non consentito'; end if;
  tit := coalesce(m.titolare, public._titolare());
  if a - da > 400 then a := da + 400; end if;
  return query
    with r as (
      select kind, data, coalesce((data->>'forse')::boolean, false) as fo from public.records
       where user_id = tit and not deleted and kind in ('lavori', 'interventi', 'eventi')
    ), iv as (
      select fo, public._data(data->>'data') as i, greatest(public._data(data->>'data'), public._data(data->>'dataFine')) as f from r where kind in ('lavori', 'eventi')
      union all
      select fo, public._data(data->>'dataProg'), public._data(data->>'dataProg') from r where kind = 'interventi' and coalesce(data->>'stato', '') <> 'annullato'
    ), giorni as (
      select iv.fo, g::date as giorno from iv, generate_series(greatest(iv.i, da), least(iv.f, a, iv.i + 366), interval '1 day') g
       where iv.i is not null and iv.f is not null and iv.f >= da and iv.i <= a
    )
    select distinct giorno from giorni where fo
    except
    select giorno from giorni where not fo
    except
    select g::date from public.prenotazioni p, generate_series(greatest(p.data, da), least(p.data_fine, a), interval '1 day') g
     where p.titolare = tit and p.stato in ('richiesta', 'confermata') and p.data_fine >= da and p.data <= a
       and (p.lavoro_id is null or not exists (select 1 from public.records x where x.user_id = tit and x.id = p.lavoro_id and coalesce((x.data->>'forse')::boolean, false)))
    order by 1;
end $$;
revoke all on function public.giorni_forse(date, date) from public, anon;
grant execute on function public.giorni_forse(date, date) to authenticated;
