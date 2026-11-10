-- Diario di Posa · IL RIVENDITORE VEDE LA PROGRAMMAZIONE DEI SUOI LAVORI E PUÒ CORREGGERE CLIENTE, INDIRIZZO E TELEFONO.
-- Da eseguire una volta: Supabase › SQL Editor › New query › incolla tutto › Run. Si può rilanciare senza danni.
-- Serve area_rivenditore.sql già lanciato. Aggiunge cose nuove; i dati che ci sono già non vengono toccati.

-- 1. I lavori del rivenditore, con telefono e voci da posare (sempre senza prezzi né dati interni)
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

-- 2. Avvisi da mandare al titolare sul telefono (li scrive solo il database, li legge solo il servizio delle notifiche)
create table if not exists public.avvisi_titolare (
  id uuid primary key default gen_random_uuid(),
  titolare uuid not null references auth.users on delete cascade,
  titolo text not null, testo text,
  notificato boolean not null default false,
  creato timestamptz not null default now()
);
alter table public.avvisi_titolare enable row level security;
revoke all on public.avvisi_titolare from anon, authenticated;

-- 3. Il rivenditore corregge cliente finale, indirizzo e telefono di un suo lavoro ancora da fare
create or replace function public.modifica_lavoro_rivenditore(tipo text, lavoro text, dati jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.membri; r public.records; inizio date; fine date; oggi date := (now() at time zone 'Europe/Rome')::date;
  v_rif text; v_ind text; v_tel text; o_rif text; o_ind text; o_tel text; prima jsonb; chi text;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if tipo not in ('lavori', 'interventi') or dati is null or jsonb_typeof(dati) <> 'object' or length(dati::text) > 2000 then raise exception 'Dati non validi'; end if;
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
  o_rif := btrim(coalesce(r.data->>'riferimento', r.data->>'clienteFinale', ''));
  o_ind := btrim(coalesce(r.data->>'indirizzo', ''));
  o_tel := btrim(coalesce(r.data->>'telefono', ''));
  if v_rif = o_rif and v_ind = o_ind and v_tel = o_tel then return 'uguale'; end if;

  chi := coalesce(nullif(m.azienda, ''), nullif(m.nome, ''), 'Rivenditore');
  -- com'era prima: resta la versione che l'installatore ha visto per ultima, anche dopo più correzioni di fila
  prima := coalesce(r.data->'modRiv'->'prima', jsonb_build_object('riferimento', o_rif, 'indirizzo', o_ind, 'telefono', o_tel));
  update public.records set
    data = (data - 'clienteFinale') || jsonb_build_object('riferimento', v_rif, 'indirizzo', v_ind, 'telefono', v_tel,
      'modRiv', jsonb_build_object('quando', to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI'), 'chi', chi, 'prima', prima)),
    updated_at = now()
  where user_id = r.user_id and kind = r.kind and id = r.id;

  delete from public.avvisi_titolare where creato < now() - interval '30 days';
  insert into public.avvisi_titolare (titolare, titolo, testo)
  values (m.titolare, case when tipo = 'lavori' then 'Posa modificata dal rivenditore' else 'Intervento modificato dal rivenditore' end,
    chi || ' · ' || to_char(inizio, 'DD/MM') || E'\n' || concat_ws(' · ', nullif(v_rif, ''), nullif(v_ind, ''), nullif(v_tel, '')));
  return 'ok';
end $$;
revoke all on function public.modifica_lavoro_rivenditore(text, text, jsonb) from public, anon;
grant execute on function public.modifica_lavoro_rivenditore(text, text, jsonb) to authenticated;

-- avviso immediato (solo se hai già attivato avvisi_istantanei.sql; altrimenti arriva con il controllo ogni 5 minuti)
do $do$
begin
  if to_regprocedure('public._avvisa_subito()') is null then return; end if;
  execute $s$drop trigger if exists avvisa_subito on public.avvisi_titolare$s$;
  execute $s$create trigger avvisa_subito after insert on public.avvisi_titolare for each row execute function public._avvisa_subito()$s$;
end $do$;
