-- Diario di Posa · AREA DEL RIVENDITORE: i suoi lavori in calendario e i suoi documenti (rapporti di cantiere)
-- Da eseguire una volta sola: Supabase › SQL Editor › New query › incolla tutto › Run.

-- 1. A quale cliente della rubrica corrisponde ogni rivenditore (se vuoto, si riconosce dal nome dell'azienda)
alter table public.membri add column if not exists cliente_id text;
alter table public.membri add column if not exists cliente_nome text;

-- nome senza forma societaria e punteggiatura: «EDILCHIERI S.R.L.» = «Edilchieri»
create or replace function public._nome_base(s text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(s, '')), '[.,''"&()\-]', ' ', 'g'),
    '\m(s ?r ?l ?s?|s ?p ?a|s ?n ?c|s ?a ?s|srls|di|ditta|impresa)\M', ' ', 'g'), '\s+', ' ', 'g'))
$$;

-- vero se il lavoro (record) è di questo rivenditore
create or replace function public._lavoro_del_rivenditore(m public.membri, d jsonb, rid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (m.cliente_id is not null and m.cliente_id <> '' and d->>'clienteId' = m.cliente_id)
      or (length(public._nome_base(coalesce(nullif(m.cliente_nome, ''), nullif(m.azienda, ''), m.nome))) >= 3
          and public._nome_base(d->>'cliente') = public._nome_base(coalesce(nullif(m.cliente_nome, ''), nullif(m.azienda, ''), m.nome)))
      or exists (select 1 from public.prenotazioni p where p.rivenditore = m.user_id and p.lavoro_id = rid)
$$;
revoke all on function public._lavoro_del_rivenditore(public.membri, jsonb, text) from public, anon, authenticated;

-- 2. I lavori del rivenditore (pose e interventi), senza prezzi né dati interni
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
      'cosa', case when r.kind = 'lavori' then r.data->>'installato' else r.data->>'descrizione' end,
      'stato', case when r.kind = 'interventi' then r.data->>'stato' else null end,
      'fatto', case when r.kind = 'lavori' then jsonb_array_length(coalesce(r.data->'giorniFatti', '[]'::jsonb)) > 0 else (r.data->>'stato') = 'completato' end,
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

-- 3. Documenti per un singolo rivenditore (rapporti di cantiere)
create table if not exists public.documenti_cliente (
  id text primary key,
  titolare uuid not null references auth.users on delete cascade,
  rivenditore uuid not null references public.membri (user_id) on delete cascade,
  titolo text not null,
  path text not null,
  lavoro_id text, kind text, data date,
  creato timestamptz not null default now()
);
create index if not exists documenti_cliente_riv on public.documenti_cliente (rivenditore);
alter table public.documenti_cliente enable row level security;
drop policy if exists "documenti cliente: vede" on public.documenti_cliente;
create policy "documenti cliente: vede" on public.documenti_cliente for select to authenticated
  using (rivenditore = auth.uid() or public._gestore(titolare));
drop policy if exists "documenti cliente: gestisce" on public.documenti_cliente;
create policy "documenti cliente: gestisce" on public.documenti_cliente for all to authenticated
  using (public._gestore(titolare)) with check (public._gestore(titolare));

-- il rivenditore legge solo i file della sua cartella
create or replace function public._doc_cliente_ok(file_nome text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membri m
     where m.user_id = auth.uid() and m.stato = 'attivo' and m.ruolo = 'rivenditore'
       and starts_with(file_nome, m.titolare::text || '/rivenditori/' || m.user_id::text || '/')
       and position('..' in file_nome) = 0
  )
$$;
revoke all on function public._doc_cliente_ok(text) from public, anon;
grant execute on function public._doc_cliente_ok(text) to authenticated;
drop policy if exists "file: documenti del singolo rivenditore" on storage.objects;
create policy "file: documenti del singolo rivenditore" on storage.objects for select to authenticated
  using (bucket_id = 'file' and public._doc_cliente_ok(name));
