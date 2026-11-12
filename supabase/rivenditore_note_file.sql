-- Diario di Posa · IL RIVENDITORE AGGIUNGE NOTE, FOTO E DOCUMENTI AI SUOI LAVORI.
-- Da eseguire una volta: Supabase › SQL Editor › New query › incolla tutto › Run. Si può rilanciare senza danni.
-- Serve lavori_rivenditore_modifica.sql già lanciato. Non cancella dati: aggiorna tre funzioni.
-- (Foto e documenti si caricano già senza questo script; qui ci sono le note e l'avviso a te quando arrivano file nuovi.)

-- 1. I lavori del rivenditore, ora anche con le sue note e la prenotazione da cui sono nati
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


-- 2. Il rivenditore corregge cliente finale, indirizzo, telefono e note per l'installazione di un suo lavoro ancora da fare
create or replace function public.modifica_lavoro_rivenditore(tipo text, lavoro text, dati jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.membri; r public.records; inizio date; fine date; oggi date := (now() at time zone 'Europe/Rome')::date;
  v_rif text; v_ind text; v_tel text; v_note text; o_rif text; o_ind text; o_tel text; o_note text; prima jsonb; chi text;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if tipo not in ('lavori', 'interventi') or dati is null or jsonb_typeof(dati) <> 'object' or length(dati::text) > 4000 then raise exception 'Dati non validi'; end if;
  select * into r from public.records where user_id = m.titolare and kind = tipo and id = lavoro and not deleted for update;
  if r.id is null or not public._lavoro_del_rivenditore(m, r.data, r.id) then raise exception 'Lavoro non trovato'; end if;
  inizio := public._data(case when tipo = 'interventi' then r.data->>'dataProg' else r.data->>'data' end);
  fine := greatest(inizio, public._data(r.data->>'dataFine'));
  if coalesce(r.data->>'stato', '') in ('annullato', 'completato') or (tipo = 'lavori' and jsonb_array_length(coalesce(r.data->'giorniFatti', '[]'::jsonb)) > 0)
     or fine is null or fine < oggi then
    raise exception 'Questo lavoro è già stato fatto o è passato: per cambiarlo chiama l''installatore';
  end if;

  v_rif := left(btrim(coalesce(dati->>'riferimento', '')), 120);
  v_ind := left(btrim(coalesce(dati->>'indirizzo', '')), 200);
  v_tel := left(btrim(coalesce(dati->>'telefono', '')), 40);
  o_note := btrim(coalesce(r.data->>'noteRiv', ''));
  v_note := case when dati ? 'noteRiv' then left(btrim(coalesce(dati->>'noteRiv', '')), 2000) else o_note end;
  o_rif := btrim(coalesce(r.data->>'riferimento', r.data->>'clienteFinale', ''));
  o_ind := btrim(coalesce(r.data->>'indirizzo', ''));
  o_tel := btrim(coalesce(r.data->>'telefono', ''));
  if v_rif = o_rif and v_ind = o_ind and v_tel = o_tel and v_note = o_note then return 'uguale'; end if;

  chi := coalesce(nullif(m.azienda, ''), nullif(m.nome, ''), 'Rivenditore');
  -- com'era prima: resta la versione che l'installatore ha visto per ultima, anche dopo più correzioni di fila
  prima := coalesce(r.data->'modRiv'->'prima', jsonb_build_object('riferimento', o_rif, 'indirizzo', o_ind, 'telefono', o_tel));
  if not (prima ? 'noteRiv') then prima := prima || jsonb_build_object('noteRiv', o_note); end if;
  update public.records set
    data = (data - 'clienteFinale') || jsonb_build_object('riferimento', v_rif, 'indirizzo', v_ind, 'telefono', v_tel, 'noteRiv', v_note,
      'modRiv', jsonb_build_object('quando', to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI'), 'chi', chi, 'prima', prima)),
    updated_at = now()
  where user_id = r.user_id and kind = r.kind and id = r.id;

  delete from public.avvisi_titolare where creato < now() - interval '30 days';
  insert into public.avvisi_titolare (titolare, titolo, testo)
  values (m.titolare, case when tipo = 'lavori' then 'Posa modificata dal rivenditore' else 'Intervento modificato dal rivenditore' end,
    chi || ' · ' || to_char(inizio, 'DD/MM') || E'\n' || concat_ws(' · ', nullif(v_rif, ''), nullif(v_ind, ''), nullif(v_tel, ''), case when v_note <> o_note then 'note: ' || left(v_note, 80) end));
  return 'ok';
end $$;
revoke all on function public.modifica_lavoro_rivenditore(text, text, jsonb) from public, anon;
grant execute on function public.modifica_lavoro_rivenditore(text, text, jsonb) to authenticated;


-- 3. Il rivenditore segnala che ha aggiunto foto o documenti a un suo lavoro: lo vedi nella scheda e ti arriva l'avviso
create or replace function public.segnala_file_lavoro(tipo text, lavoro text, foto int, documenti int) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.membri; r public.records; chi text; riga text; f jsonb; n_f int := greatest(0, least(coalesce(foto, 0), 100)); n_d int := greatest(0, least(coalesce(documenti, 0), 100));
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if tipo not in ('lavori', 'interventi') or n_f + n_d = 0 then return; end if;
  select * into r from public.records where user_id = m.titolare and kind = tipo and id = lavoro and not deleted for update;
  if r.id is null or not public._lavoro_del_rivenditore(m, r.data, r.id) then raise exception 'Lavoro non trovato'; end if;
  chi := coalesce(nullif(m.azienda, ''), nullif(m.nome, ''), 'Rivenditore');
  f := coalesce(r.data->'fileRiv', '{}'::jsonb);
  update public.records set
    data = data || jsonb_build_object('fileRiv', jsonb_build_object('quando', to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI'), 'chi', chi,
      'foto', coalesce((f->>'foto')::int, 0) + n_f, 'documenti', coalesce((f->>'documenti')::int, 0) + n_d)),
    updated_at = now()
  where user_id = r.user_id and kind = r.kind and id = r.id;
  -- un solo avviso ogni 10 minuti per lo stesso lavoro, anche se carica i file un po' alla volta
  riga := chi || ' · ' || coalesce(nullif(btrim(coalesce(r.data->>'riferimento', '')), ''), nullif(btrim(coalesce(r.data->>'indirizzo', '')), ''), 'lavoro')
          || coalesce(' · ' || to_char(public._data(case when tipo = 'interventi' then r.data->>'dataProg' else r.data->>'data' end), 'DD/MM'), '');
  if not exists (select 1 from public.avvisi_titolare where titolare = m.titolare and titolo = 'Foto e documenti dal rivenditore' and creato > now() - interval '10 minutes' and starts_with(testo, riga)) then
    insert into public.avvisi_titolare (titolare, titolo, testo)
    values (m.titolare, 'Foto e documenti dal rivenditore',
      riga || E'\n' || concat_ws(' e ', case when n_f > 0 then n_f || ' foto' end, case when n_d > 0 then n_d || case when n_d = 1 then ' documento' else ' documenti' end end));
  end if;
end $$;
revoke all on function public.segnala_file_lavoro(text, text, int, int) from public, anon;
grant execute on function public.segnala_file_lavoro(text, text, int, int) to authenticated;
