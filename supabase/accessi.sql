-- Diario di Posa · ACCESSI: titolari, rivenditori e dipendenti.
-- Da eseguire una volta sola: Supabase › SQL Editor › New query › incolla tutto › Run.
-- Aggiunge tabelle e regole nuove; i dati che ci sono già non vengono toccati.

-- ============ 1. Persone che hanno accesso ============
create table if not exists public.membri (
  user_id uuid primary key references auth.users on delete cascade,
  titolare uuid not null references auth.users on delete cascade,   -- il proprietario dei dati (Jacopo)
  ruolo text not null check (ruolo in ('titolare', 'rivenditore', 'dipendente')),
  nome text, azienda text, telefono text, email text,
  stato text not null default 'attivo' check (stato in ('attivo', 'sospeso')),
  cambio_password boolean not null default false,
  creato timestamptz not null default now()
);
create index if not exists membri_titolare on public.membri (titolare);

-- ============ 2. Richieste di accesso (dal link, senza account) ============
create table if not exists public.richieste_accesso (
  id uuid primary key default gen_random_uuid(),
  titolare uuid not null references auth.users on delete cascade,
  nome text not null, azienda text, email text not null, telefono text,
  ruolo text not null default 'altro' check (ruolo in ('rivenditore', 'dipendente', 'altro')),
  messaggio text,
  stato text not null default 'nuova' check (stato in ('nuova', 'accettata', 'rifiutata')),
  notificato boolean not null default false,
  creato timestamptz not null default now()
);
create index if not exists richieste_titolare on public.richieste_accesso (titolare, stato);

-- ============ 3. Prenotazioni dei rivenditori ============
create table if not exists public.prenotazioni (
  id uuid primary key default gen_random_uuid(),
  titolare uuid not null references auth.users on delete cascade,
  rivenditore uuid not null references public.membri (user_id) on delete cascade,
  data date not null,
  data_fine date not null,
  tipo text not null default 'posa' check (tipo in ('posa', 'intervento', 'sopralluogo')),
  cliente text, indirizzo text, telefono text,
  scheda jsonb not null default '{}'::jsonb,   -- contatti, materiale, piano, tiro al piano, ascensore, parcheggio, note...
  stato text not null default 'richiesta' check (stato in ('richiesta', 'confermata', 'rifiutata', 'annullata')),
  risposta text,
  lavoro_id text,
  notificato boolean not null default false,
  creato timestamptz not null default now(),
  aggiornato timestamptz not null default now(),
  check (data_fine >= data)
);
create index if not exists prenotazioni_titolare on public.prenotazioni (titolare, data);
create index if not exists prenotazioni_rivenditore on public.prenotazioni (rivenditore);

-- ============ 4. Funzioni di appoggio ============
create or replace function public._data(t text) returns date
language sql immutable set search_path = '' as $$
  select case when t ~ '^\d{4}-\d{2}-\d{2}$' then t::date end
$$;

-- il proprietario dei dati per chi è collegato: se stesso, oppure il titolare per cui lavora
create or replace function public._titolare() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce((select m.titolare from public.membri m where m.user_id = auth.uid() and m.stato = 'attivo'), auth.uid())
$$;

-- vero se chi è collegato gestisce i dati di "owner" (è lui, o è un titolare attivo)
create or replace function public._gestore(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select owner = auth.uid()
      or exists (select 1 from public.membri m where m.user_id = auth.uid() and m.titolare = owner and m.ruolo = 'titolare' and m.stato = 'attivo')
$$;

-- stessa cosa partendo dal nome di una cartella dei file
create or replace function public._gestore_cartella(cartella text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when cartella ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    public._gestore(cartella::uuid)
    -- foto caricate dai propri dipendenti
    or exists (select 1 from public.membri m where m.user_id = cartella::uuid and public._gestore(m.titolare))
  else false end
$$;

create or replace function public._impostazioni(tit uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select data from public.records where user_id = tit and kind = 'cfg' and id = 'impostazioni' and not deleted), '{}'::jsonb)
$$;

-- ============ 5. Regole di accesso ============
-- dati dell'app: il proprietario e i titolari vedono e modificano tutto
drop policy if exists "solo i propri dati" on public.records;
drop policy if exists "dati: proprietario e titolari" on public.records;
create policy "dati: proprietario e titolari" on public.records for all to authenticated
  using (public._gestore(user_id)) with check (public._gestore(user_id));

-- file (foto scontrini, allegati, moduli)
drop policy if exists "file: lettura propria" on storage.objects;
drop policy if exists "file: caricamento proprio" on storage.objects;
drop policy if exists "file: modifica propria" on storage.objects;
drop policy if exists "file: eliminazione propria" on storage.objects;
create policy "file: lettura propria" on storage.objects for select to authenticated
  using (bucket_id = 'file' and ((storage.foldername(name))[1] = (select auth.uid())::text or public._gestore_cartella((storage.foldername(name))[1])));
create policy "file: caricamento proprio" on storage.objects for insert to authenticated
  with check (bucket_id = 'file' and ((storage.foldername(name))[1] = (select auth.uid())::text or public._gestore_cartella((storage.foldername(name))[1])));
create policy "file: modifica propria" on storage.objects for update to authenticated
  using (bucket_id = 'file' and ((storage.foldername(name))[1] = (select auth.uid())::text or public._gestore_cartella((storage.foldername(name))[1])));
create policy "file: eliminazione propria" on storage.objects for delete to authenticated
  using (bucket_id = 'file' and ((storage.foldername(name))[1] = (select auth.uid())::text or public._gestore_cartella((storage.foldername(name))[1])));

alter table public.membri enable row level security;
alter table public.richieste_accesso enable row level security;
alter table public.prenotazioni enable row level security;

drop policy if exists "membri: vede" on public.membri;
drop policy if exists "membri: gestisce" on public.membri;
create policy "membri: vede" on public.membri for select to authenticated
  using (user_id = (select auth.uid()) or public._gestore(titolare));
drop policy if exists "membri: elimina" on public.membri;
-- si aggiungono solo con aggiungi_membro(); qui si possono cambiare ruolo/stato o togliere
create policy "membri: gestisce" on public.membri for update to authenticated
  using (public._gestore(titolare) and user_id <> (select auth.uid()))
  with check (public._gestore(titolare) and user_id <> (select auth.uid()) and user_id <> titolare);
create policy "membri: elimina" on public.membri for delete to authenticated
  using (public._gestore(titolare) and user_id <> (select auth.uid()));

drop policy if exists "richieste: gestisce" on public.richieste_accesso;
create policy "richieste: gestisce" on public.richieste_accesso for all to authenticated
  using (public._gestore(titolare)) with check (public._gestore(titolare));

drop policy if exists "prenotazioni: vede" on public.prenotazioni;
drop policy if exists "prenotazioni: gestisce" on public.prenotazioni;
create policy "prenotazioni: vede" on public.prenotazioni for select to authenticated
  using (rivenditore = (select auth.uid()) or public._gestore(titolare));
create policy "prenotazioni: gestisce" on public.prenotazioni for update to authenticated
  using (public._gestore(titolare)) with check (public._gestore(titolare));

revoke insert on public.membri from authenticated;
grant select, update, delete on public.membri to authenticated;
grant select, update, delete on public.richieste_accesso to authenticated;
grant select, update on public.prenotazioni to authenticated;

-- ============ 6. Chi sono e cosa posso fare ============
create or replace function public.mio_accesso() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
    'ruolo', m.ruolo, 'titolare', tit, 'nome', m.nome, 'azienda', m.azienda,
    'cambio_password', m.cambio_password,
    'installatore', coalesce(az->>'ragioneSociale', 'CASSERO INSTALLAZIONI'),
    'telefonoInstallatore', coalesce(az->>'telefono', ''),
    'giorni', coalesce(imp->'giornata'->'giorni', '[1,2,3,4,5]'::jsonb),
    'giornata', coalesce(imp->'giornata', '{}'::jsonb),
    'preavviso', coalesce((imp->'accessi'->>'preavviso')::int, 2),
    'mesi', coalesce((imp->'accessi'->>'mesi')::int, 4)
  );
end $$;

create or replace function public.password_cambiata() returns void
language sql security definer set search_path = '' as $$
  update public.membri set cambio_password = false where user_id = auth.uid()
$$;

-- ============ 7. Richiesta di accesso dal link (anche senza account) ============
create or replace function public.richiedi_accesso(codice text, nome text, azienda text, email text, telefono text, ruolo text, messaggio text)
returns void
language plpgsql security definer set search_path = '' as $$
declare tit uuid;
begin
  if coalesce(trim(nome), '') = '' or coalesce(trim(email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Scrivi nome ed email validi';
  end if;
  if coalesce(codice, '') <> '' then
    select user_id into tit from public.records
     where kind = 'cfg' and id = 'impostazioni' and not deleted and data->'accessi'->>'codice' = codice limit 1;
  end if;
  if tit is null then
    -- link generico dell'app: va al primo titolare che ha aperto le richieste
    select user_id into tit from public.records
     where kind = 'cfg' and id = 'impostazioni' and not deleted and coalesce(data->'accessi'->>'codice', '') <> ''
     order by updated_at limit 1;
  end if;
  if tit is null then raise exception 'Le richieste di accesso sono chiuse in questo momento'; end if;
  if (select count(*) from public.richieste_accesso where titolare = tit and creato > now() - interval '1 hour') >= 20 then
    raise exception 'Troppe richieste in questo momento, riprova più tardi';
  end if;
  if exists (select 1 from public.richieste_accesso r where r.titolare = tit and lower(r.email) = lower(trim(richiedi_accesso.email)) and r.stato = 'nuova') then
    return; -- già in attesa
  end if;
  insert into public.richieste_accesso (titolare, nome, azienda, email, telefono, ruolo, messaggio)
  values (tit, left(trim(nome), 100), left(trim(azienda), 120), lower(left(trim(email), 160)), left(trim(telefono), 40),
          case when ruolo in ('rivenditore', 'dipendente') then ruolo else 'altro' end, left(trim(messaggio), 1000));
end $$;

-- il titolare dà l'accesso a un account (appena creato con la password provvisoria, o già esistente)
create or replace function public.aggiungi_membro(email text, ruolo text, nome text, azienda text, telefono text, provvisoria boolean, richiesta uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare tit uuid := public._titolare(); uid uuid;
begin
  if not public._gestore(tit) or not exists (select 1 from public.records where user_id = tit and kind = 'cfg') then
    raise exception 'Solo il titolare può dare accessi';
  end if;
  if ruolo not in ('titolare', 'rivenditore', 'dipendente') then raise exception 'Ruolo non valido'; end if;
  select id into uid from auth.users where lower(auth.users.email) = lower(trim(aggiungi_membro.email)) limit 1;
  if uid is null then raise exception 'Account non trovato per %', email; end if;
  if uid = tit or uid = auth.uid() then raise exception 'Questo è già il tuo account'; end if;
  if exists (select 1 from public.membri where user_id = uid and titolare <> tit) then raise exception 'Questa email ha già un accesso con un''altra azienda'; end if;
  insert into public.membri (user_id, titolare, ruolo, nome, azienda, telefono, email, cambio_password)
  values (uid, tit, ruolo, left(trim(nome), 100), left(trim(azienda), 120), left(trim(telefono), 40), lower(trim(email)), coalesce(provvisoria, false))
  on conflict (user_id) do update set ruolo = excluded.ruolo, nome = excluded.nome, azienda = excluded.azienda,
    telefono = excluded.telefono, stato = 'attivo', cambio_password = public.membri.cambio_password or excluded.cambio_password;
  if richiesta is not null then update public.richieste_accesso set stato = 'accettata' where id = richiesta and titolare = tit; end if;
  return uid;
end $$;

-- ============ 8. Calendario dei rivenditori ============
create or replace function public._occupati(tit uuid, da date, a date)
returns table (giorno date)
language sql stable security definer set search_path = '' as $$
  with r as (
    select kind, id, data from public.records
    where user_id = tit and not deleted and kind in ('lavori', 'interventi', 'eventi')
  ), iv as (
    select public._data(data->>'data') as i,
           greatest(public._data(data->>'data'), public._data(data->>'dataFine')) as f
      from r where kind in ('lavori', 'eventi')
    union all
    select public._data(data->>'dataProg'), public._data(data->>'dataProg')
      from r where kind = 'interventi' and coalesce(data->>'stato', '') <> 'annullato'
    union all
    select p.data, p.data_fine from public.prenotazioni p
     where p.titolare = tit
       and (p.stato = 'richiesta'
            or (p.stato = 'confermata' and (p.lavoro_id is null or exists (
                 select 1 from public.records x where x.user_id = tit and x.id = p.lavoro_id
                   and x.kind in ('lavori', 'interventi') and not x.deleted))))
  )
  select distinct g::date
    from iv, generate_series(greatest(iv.i, da), least(iv.f, a, iv.i + 366), interval '1 day') g
   where iv.i is not null and iv.f is not null and iv.f >= da and iv.i <= a
$$;

-- solo le date occupate, senza nessun dettaglio
create or replace function public.disponibilita(da date, a date)
returns setof date
language plpgsql stable security definer set search_path = '' as $$
declare m public.membri;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo';
  if m.ruolo is distinct from 'rivenditore' and not public._gestore(public._titolare()) then raise exception 'Accesso non consentito'; end if;
  if a - da > 400 then a := da + 400; end if;
  return query select giorno from public._occupati(coalesce(m.titolare, public._titolare()), da, a) order by 1;
end $$;

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

create or replace function public.annulla_prenotazione(pid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.prenotazioni set stato = 'annullata', aggiornato = now()
   where id = pid and rivenditore = auth.uid() and stato = 'richiesta';
  if not found then raise exception 'Questa prenotazione non si può più annullare: chiama l''installatore'; end if;
end $$;

-- ============ 9. Calendario dei dipendenti ============
-- solo i lavori assegnati a chi è collegato, senza prezzi
create or replace function public.miei_lavori(da date, a date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.membri; me text := auth.uid()::text;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'dipendente';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'kind', r.kind, 'id', r.id,
      'data', coalesce(r.data->>'dataProg', r.data->>'data'), 'dataFine', r.data->>'dataFine', 'soloFeriali', r.data->'soloFeriali',
      'cliente', r.data->>'cliente', 'telefono', r.data->>'telefono', 'indirizzo', r.data->>'indirizzo',
      'installato', r.data->>'installato', 'descrizione', r.data->>'descrizione', 'note', r.data->>'note',
      'urgente', coalesce((r.data->>'urgenzaApplicata')::boolean, false) or coalesce(r.data->>'urgenza', '') in ('alta', 'critica'),
      'stato', r.data->>'stato',
      'voci', (select jsonb_agg(jsonb_build_object('descr', v->>'descr', 'qta', v->'qta', 'unita', v->>'unita'))
                 from jsonb_array_elements(case when jsonb_typeof(r.data->'righe') = 'array' then r.data->'righe' else '[]'::jsonb end) v
                where coalesce(v->>'voce', '') <> 'km'),
      'materiali', r.data->'materiali',
      'squadra', (select jsonb_agg(jsonb_build_object('nome', coalesce(x.nome, x.email)))
                    from public.membri x where x.titolare = m.titolare and x.user_id::text in (select jsonb_array_elements_text(r.data->'assegnati'))),
      'mio', r.data->'lavoroSquadra'->me
    ) order by coalesce(r.data->>'dataProg', r.data->>'data'))
    from public.records r
    where r.user_id = m.titolare and not r.deleted and r.kind in ('lavori', 'interventi')
      and jsonb_typeof(r.data->'assegnati') = 'array' and r.data->'assegnati' ? me
      and coalesce(public._data(r.data->>'dataFine'), public._data(coalesce(r.data->>'dataProg', r.data->>'data'))) >= da
      and public._data(coalesce(r.data->>'dataProg', r.data->>'data')) <= a
  ), '[]'::jsonb);
end $$;

-- il dipendente segna ore, "fatto", note e foto sul lavoro assegnato
create or replace function public.segna_lavoro(k text, rid text, dati jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.membri; me text := auth.uid()::text; pulito jsonb;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'dipendente';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  pulito := jsonb_build_object(
    'ore', dati->'ore', 'fatto', coalesce((dati->>'fatto')::boolean, false),
    'note', left(coalesce(dati->>'note', ''), 2000),
    'foto', case when jsonb_typeof(dati->'foto') = 'array' then dati->'foto' else '[]'::jsonb end,
    'nome', coalesce(m.nome, m.email), 'aggiornato', now());
  update public.records r
     set data = jsonb_set(r.data, '{lavoroSquadra}', coalesce(r.data->'lavoroSquadra', '{}'::jsonb) || jsonb_build_object(me, pulito)),
         updated_at = now()
   where r.user_id = m.titolare and r.kind = k and r.id = rid and not r.deleted
     and k in ('lavori', 'interventi') and r.data->'assegnati' ? me;
  if not found then raise exception 'Lavoro non trovato o non assegnato a te'; end if;
end $$;

-- moduli compilati dal dipendente (finiscono tra i moduli del titolare)
create or replace function public.salva_modulo_dipendente(mid text, dati jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.membri; esiste public.records;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'dipendente';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if coalesce(mid, '') = '' or length(mid) > 80 or length(dati::text) > 400000 then raise exception 'Modulo non valido'; end if;
  select * into esiste from public.records where user_id = m.titolare and kind = 'moduli' and id = mid;
  if esiste.id is not null and esiste.data->>'autore' is distinct from auth.uid()::text then raise exception 'Modulo non tuo'; end if;
  insert into public.records (user_id, kind, id, data, deleted, updated_at)
  values (m.titolare, 'moduli', mid, dati || jsonb_build_object('autore', auth.uid()::text, 'autoreNome', coalesce(m.nome, m.email)), false, now())
  on conflict (user_id, kind, id) do update set data = excluded.data, deleted = false, updated_at = now();
end $$;

create or replace function public.miei_moduli() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(r.data || jsonb_build_object('id', r.id) order by r.updated_at desc), '[]'::jsonb)
    from public.records r join public.membri m on m.user_id = auth.uid() and m.stato = 'attivo' and m.ruolo = 'dipendente'
   where r.user_id = m.titolare and r.kind = 'moduli' and not r.deleted and r.data->>'autore' = auth.uid()::text
$$;

-- ============ 10. Permessi delle funzioni ============
revoke all on function public._data(text) from public, anon;
revoke all on function public._titolare() from public, anon;
revoke all on function public._gestore(uuid) from public, anon;
revoke all on function public._gestore_cartella(text) from public, anon;
revoke all on function public._impostazioni(uuid) from public, anon, authenticated;
revoke all on function public._occupati(uuid, date, date) from public, anon, authenticated;
revoke all on function public.mio_accesso() from public, anon;
revoke all on function public.password_cambiata() from public, anon;
revoke all on function public.richiedi_accesso(text, text, text, text, text, text, text) from public;
revoke all on function public.aggiungi_membro(text, text, text, text, text, boolean, uuid) from public, anon;
revoke all on function public.disponibilita(date, date) from public, anon;
revoke all on function public.prenota(date, date, text, text, text, text, jsonb) from public, anon;
revoke all on function public.annulla_prenotazione(uuid) from public, anon;
revoke all on function public.miei_lavori(date, date) from public, anon;
revoke all on function public.segna_lavoro(text, text, jsonb) from public, anon;
revoke all on function public.salva_modulo_dipendente(text, jsonb) from public, anon;
revoke all on function public.miei_moduli() from public, anon;
grant execute on function public._titolare(), public._gestore(uuid), public._gestore_cartella(text), public._data(text) to authenticated;
grant execute on function public.mio_accesso(), public.password_cambiata(),
  public.aggiungi_membro(text, text, text, text, text, boolean, uuid),
  public.disponibilita(date, date), public.prenota(date, date, text, text, text, text, jsonb), public.annulla_prenotazione(uuid),
  public.miei_lavori(date, date), public.segna_lavoro(text, text, jsonb), public.salva_modulo_dipendente(text, jsonb), public.miei_moduli()
  to authenticated;
grant execute on function public.richiedi_accesso(text, text, text, text, text, text, text) to anon, authenticated;

-- aggiornamenti in tempo reale
do $$ begin
  begin alter publication supabase_realtime add table public.prenotazioni; exception when others then null; end;
  begin alter publication supabase_realtime add table public.richieste_accesso; exception when others then null; end;
  begin alter publication supabase_realtime add table public.membri; exception when others then null; end;
end $$;
