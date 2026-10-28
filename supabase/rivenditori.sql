-- Area rivenditori: i rivenditori approvati vedono solo i giorni liberi/occupati e prenotano i giorni liberi.

create table if not exists public.rivenditori (
  user_id uuid primary key references auth.users on delete cascade,
  titolare uuid not null references auth.users on delete cascade,
  ragione_sociale text not null,
  piva text, referente text, telefono text, email text,
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'approvato', 'bloccato')),
  notificato boolean not null default false,
  creato timestamptz not null default now()
);
create index if not exists rivenditori_titolare on public.rivenditori (titolare);

create table if not exists public.prenotazioni (
  id uuid primary key default gen_random_uuid(),
  titolare uuid not null references auth.users on delete cascade,
  rivenditore uuid not null references public.rivenditori (user_id) on delete cascade,
  data date not null,
  data_fine date not null,
  tipo text not null default 'posa' check (tipo in ('posa', 'intervento')),
  cliente text, indirizzo text, telefono text, descrizione text, note text,
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

alter table public.rivenditori enable row level security;
alter table public.prenotazioni enable row level security;

drop policy if exists "rivenditori: vede" on public.rivenditori;
drop policy if exists "rivenditori: titolare modifica" on public.rivenditori;
drop policy if exists "rivenditori: titolare elimina" on public.rivenditori;
create policy "rivenditori: vede" on public.rivenditori for select to authenticated
  using (user_id = (select auth.uid()) or titolare = (select auth.uid()));
create policy "rivenditori: titolare modifica" on public.rivenditori for update to authenticated
  using (titolare = (select auth.uid())) with check (titolare = (select auth.uid()));
create policy "rivenditori: titolare elimina" on public.rivenditori for delete to authenticated
  using (titolare = (select auth.uid()));

drop policy if exists "prenotazioni: vede" on public.prenotazioni;
drop policy if exists "prenotazioni: titolare modifica" on public.prenotazioni;
create policy "prenotazioni: vede" on public.prenotazioni for select to authenticated
  using (rivenditore = (select auth.uid()) or titolare = (select auth.uid()));
create policy "prenotazioni: titolare modifica" on public.prenotazioni for update to authenticated
  using (titolare = (select auth.uid())) with check (titolare = (select auth.uid()));

-- data 'AAAA-MM-GG' dentro i record dell'app
create or replace function public._data(t text) returns date
language sql immutable set search_path = '' as $$
  select case when t ~ '^\d{4}-\d{2}-\d{2}$' then t::date end
$$;

-- impostazioni del titolare (giorni lavorativi, area rivenditori)
create or replace function public._impostazioni(tit uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select data from public.records where user_id = tit and kind = 'cfg' and id = 'impostazioni' and not deleted), '{}'::jsonb)
$$;

-- giorni occupati del titolare: pose, interventi programmati, ferie/fiere/corsi, prenotazioni in corso
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

-- il rivenditore si iscrive con il codice del link ricevuto dal titolare
create or replace function public.iscrivi_rivenditore(codice text, ragione_sociale text, piva text, referente text, telefono text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  tit uuid;
  r public.rivenditori;
begin
  if me is null then raise exception 'Accedi prima di iscriverti'; end if;
  if coalesce(trim(ragione_sociale), '') = '' then raise exception 'Scrivi la ragione sociale'; end if;
  select user_id into tit from public.records
   where kind = 'cfg' and id = 'impostazioni' and not deleted
     and length(coalesce(codice, '')) >= 16 and data->'portale'->>'codice' = codice
   limit 1;
  if tit is null then raise exception 'Link di iscrizione non valido o scaduto: chiedi un link nuovo'; end if;
  if tit = me then raise exception 'Questo è il tuo account da titolare: per provare usa un altro indirizzo email'; end if;
  select * into r from public.rivenditori where user_id = me;
  if r.stato = 'bloccato' then raise exception 'Il tuo accesso non è attivo'; end if;
  insert into public.rivenditori (user_id, titolare, ragione_sociale, piva, referente, telefono, email)
  values (me, tit, left(trim(ragione_sociale), 120), left(trim(piva), 30), left(trim(referente), 80), left(trim(telefono), 40),
          (select email from auth.users where id = me))
  on conflict (user_id) do update set ragione_sociale = excluded.ragione_sociale, piva = excluded.piva,
    referente = excluded.referente, telefono = excluded.telefono, email = excluded.email;
  return coalesce(r.stato, 'in_attesa');
end $$;

-- stato del rivenditore collegato e regole del calendario
create or replace function public.portale_stato()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.rivenditori;
  imp jsonb;
  az jsonb;
begin
  select * into r from public.rivenditori where user_id = auth.uid();
  if r.user_id is null then return jsonb_build_object('stato', 'nuovo'); end if;
  imp := public._impostazioni(r.titolare);
  select data into az from public.records where user_id = r.titolare and kind = 'cfg' and id = 'azienda' and not deleted;
  return jsonb_build_object(
    'stato', case when imp->'portale'->>'codice' is null and r.stato = 'approvato' then 'chiuso' else r.stato end,
    'ragione_sociale', r.ragione_sociale,
    'installatore', coalesce(az->>'ragioneSociale', 'CASSERO INSTALLAZIONI'),
    'telefono', coalesce(az->>'telefono', ''),
    'giorni', coalesce(imp->'giornata'->'giorni', '[1,2,3,4,5]'::jsonb),
    'preavviso', coalesce((imp->'portale'->>'preavviso')::int, 2),
    'mesi', coalesce((imp->'portale'->>'mesi')::int, 4)
  );
end $$;

-- giorni occupati visti dal rivenditore approvato (solo date, nessun dettaglio)
create or replace function public.disponibilita(da date, a date)
returns setof date
language plpgsql stable security definer set search_path = '' as $$
declare r public.rivenditori;
begin
  select * into r from public.rivenditori where user_id = auth.uid();
  if r.stato is distinct from 'approvato' then raise exception 'Accesso non ancora approvato'; end if;
  if a - da > 400 then a := da + 400; end if;
  return query select giorno from public._occupati(r.titolare, da, a) order by 1;
end $$;

-- prenotazione di giorni liberi (diventa una richiesta da confermare)
create or replace function public.prenota(da date, a date, tipo text, cliente text, indirizzo text, telefono text, descrizione text, note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.rivenditori;
  imp jsonb;
  lav jsonb;
  pre int; mesi int;
  libero int;
  nuovo uuid;
begin
  select * into r from public.rivenditori where user_id = auth.uid();
  if r.stato is distinct from 'approvato' then raise exception 'Accesso non ancora approvato'; end if;
  imp := public._impostazioni(r.titolare);
  if imp->'portale'->>'codice' is null then raise exception 'Le prenotazioni sono chiuse in questo momento'; end if;
  lav := coalesce(imp->'giornata'->'giorni', '[1,2,3,4,5]'::jsonb);
  pre := coalesce((imp->'portale'->>'preavviso')::int, 2);
  mesi := coalesce((imp->'portale'->>'mesi')::int, 4);
  if da is null or a is null or a < da then raise exception 'Date non valide'; end if;
  if a - da > 14 then raise exception 'Al massimo 15 giorni per prenotazione'; end if;
  if da < (now() at time zone 'Europe/Rome')::date + pre then raise exception 'Serve un preavviso di almeno % giorni', pre; end if;
  if a > ((now() at time zone 'Europe/Rome')::date + make_interval(months => mesi))::date then raise exception 'Si può prenotare al massimo % mesi avanti', mesi; end if;
  if coalesce(trim(indirizzo), '') = '' then raise exception 'Scrivi l''indirizzo del cantiere'; end if;
  -- un solo prenotante alla volta per titolare
  perform pg_advisory_xact_lock(hashtext('prenota:' || r.titolare::text));
  if exists (
    select 1 from public._occupati(r.titolare, da, a) o
     where lav @> to_jsonb(extract(dow from o.giorno)::int)
  ) then raise exception 'Una o più giornate sono appena state occupate: aggiorna il calendario'; end if;
  select count(*) into libero from generate_series(da, a, interval '1 day') g where lav @> to_jsonb(extract(dow from g)::int);
  if libero = 0 then raise exception 'Nelle date scelte non ci sono giornate lavorative'; end if;
  insert into public.prenotazioni (titolare, rivenditore, data, data_fine, tipo, cliente, indirizzo, telefono, descrizione, note)
  values (r.titolare, r.user_id, da, a, case when tipo = 'intervento' then 'intervento' else 'posa' end,
          left(trim(cliente), 120), left(trim(indirizzo), 200), left(trim(telefono), 40), left(trim(descrizione), 2000), left(trim(note), 2000))
  returning id into nuovo;
  return nuovo;
end $$;

-- il rivenditore ritira una richiesta non ancora confermata
create or replace function public.annulla_prenotazione(pid uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.prenotazioni set stato = 'annullata', aggiornato = now()
   where id = pid and rivenditore = auth.uid() and stato = 'richiesta';
  if not found then raise exception 'Questa prenotazione non si può più annullare: chiama l''installatore'; end if;
end $$;

revoke all on function public._data(text) from public, anon;
revoke all on function public._impostazioni(uuid) from public, anon, authenticated;
revoke all on function public._occupati(uuid, date, date) from public, anon, authenticated;
revoke all on function public.iscrivi_rivenditore(text, text, text, text, text) from public, anon;
revoke all on function public.portale_stato() from public, anon;
revoke all on function public.disponibilita(date, date) from public, anon;
revoke all on function public.prenota(date, date, text, text, text, text, text, text) from public, anon;
revoke all on function public.annulla_prenotazione(uuid) from public, anon;
grant execute on function public.iscrivi_rivenditore(text, text, text, text, text) to authenticated;
grant execute on function public.portale_stato() to authenticated;
grant execute on function public.disponibilita(date, date) to authenticated;
grant execute on function public.prenota(date, date, text, text, text, text, text, text) to authenticated;
grant execute on function public.annulla_prenotazione(uuid) to authenticated;

grant select, update, delete on public.rivenditori to authenticated;
grant select, update on public.prenotazioni to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.prenotazioni; exception when others then null; end;
  begin alter publication supabase_realtime add table public.rivenditori; exception when others then null; end;
end $$;
