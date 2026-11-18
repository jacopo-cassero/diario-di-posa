-- Diario di Posa · RIVENDITORI CON PIÙ SEDI.
-- Da eseguire una volta: Supabase › SQL Editor › New query › incolla tutto › Run. Si può rilanciare senza danni.
-- Non cancella dati. Ogni accesso di un rivenditore può avere una «sede» (Torino, Cuneo…):
--  · le sedi della stessa azienda non si vedono tra loro: ognuna ha la sua cartella di documenti;
--  · una sede vede solo i lavori segnati con la sua sede (e quelli nati dalle sue prenotazioni);
--  · un accesso senza sede funziona come prima.

alter table public.membri add column if not exists sede text;

-- l'azienda (e la sede) di un accesso: chi ha la stessa chiave condivide la cartella dei documenti
create or replace function public._gruppo_riv(m public.membri) returns text
language sql stable set search_path = '' as $$
  select case when coalesce(m.cliente_id, '') <> '' then 'c:' || m.cliente_id
              when public._nome_base(coalesce(nullif(m.cliente_nome, ''), nullif(m.azienda, ''), m.nome)) <> '' then 'n:' || public._nome_base(coalesce(nullif(m.cliente_nome, ''), nullif(m.azienda, ''), m.nome))
              else 'u:' || m.user_id::text end
         || coalesce('|s:' || nullif(lower(btrim(coalesce(m.sede, ''))), ''), '')
$$;

-- un lavoro è del rivenditore se è del suo cliente e, quando l'accesso ha una sede, della stessa sede
create or replace function public._lavoro_del_rivenditore(m public.membri, d jsonb, rid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (
      (m.cliente_id is not null and m.cliente_id <> '' and d->>'clienteId' = m.cliente_id)
      or (length(public._nome_base(coalesce(nullif(m.cliente_nome, ''), nullif(m.azienda, ''), m.nome))) >= 3
          and public._nome_base(d->>'cliente') = public._nome_base(coalesce(nullif(m.cliente_nome, ''), nullif(m.azienda, ''), m.nome)))
    ) and (coalesce(btrim(m.sede), '') = '' or lower(btrim(coalesce(d->>'sede', ''))) = lower(btrim(m.sede)))
    or exists (select 1 from public.prenotazioni p where p.rivenditore = m.user_id and p.lavoro_id = rid)
$$;
revoke all on function public._lavoro_del_rivenditore(public.membri, jsonb, text) from public, anon, authenticated;

-- il nome con cui ti arrivano gli avvisi: «EDILCHIERI SRL · Torino»
create or replace function public._nome_riv(m public.membri) returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(m.azienda, ''), nullif(m.nome, ''), 'Rivenditore') || coalesce(' · ' || nullif(btrim(coalesce(m.sede, '')), ''), '')
$$;
revoke all on function public._nome_riv(public.membri) from public, anon;

-- le stesse funzioni di prima, con il nome della sede negli avvisi
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

  chi := public._nome_riv(m);
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

create or replace function public.segnala_file_lavoro(tipo text, lavoro text, foto int, documenti int) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.membri; r public.records; chi text; riga text; f jsonb; n_f int := greatest(0, least(coalesce(foto, 0), 100)); n_d int := greatest(0, least(coalesce(documenti, 0), 100));
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if tipo not in ('lavori', 'interventi') or n_f + n_d = 0 then return; end if;
  select * into r from public.records where user_id = m.titolare and kind = tipo and id = lavoro and not deleted for update;
  if r.id is null or not public._lavoro_del_rivenditore(m, r.data, r.id) then raise exception 'Lavoro non trovato'; end if;
  chi := public._nome_riv(m);
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

  chi := public._nome_riv(m);
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

-- chi è collegato: ora anche con la sua sede (la vede scritta nella sua schermata)
create or replace function public.mio_accesso() returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare
  me uuid := auth.uid();
  m public.membri;
  tit uuid; imp jsonb; az jsonb;
begin
  if me is null then return jsonb_build_object('ruolo', 'nessuno'); end if;
  select * into m from public.membri where user_id = me;
  if m.user_id is null then
    if exists (select 1 from public.records where user_id = me and kind = 'cfg') then
      return jsonb_build_object('ruolo', 'proprietario', 'titolare', me);
    end if;
    return jsonb_build_object('ruolo', 'nessuno');
  end if;
  if m.stato <> 'attivo' then return jsonb_build_object('ruolo', 'sospeso'); end if;
  tit := m.titolare;
  imp := public._impostazioni(tit);
  select data into az from public.records where user_id = tit and kind = 'cfg' and id = 'azienda' and not deleted;
  return jsonb_build_object(
    'ruolo', m.ruolo, 'titolare', tit, 'nome', m.nome, 'azienda', m.azienda, 'sede', nullif(btrim(coalesce(m.sede, '')), ''),
    'cambio_password', m.cambio_password,
    'installatore', coalesce(az->>'ragioneSociale', 'CASSERO INSTALLAZIONI'),
    'telefonoInstallatore', coalesce(az->>'telefono', ''),
    'giorni', coalesce(imp->'giornata'->'giorni', '[1,2,3,4,5]'::jsonb),
    'giornata', coalesce(imp->'giornata', '{}'::jsonb),
    'preavviso', coalesce((imp->'accessi'->>'preavviso')::int, 2),
    'mesi', coalesce((imp->'accessi'->>'mesi')::int, 4)
  );
end $function$;
