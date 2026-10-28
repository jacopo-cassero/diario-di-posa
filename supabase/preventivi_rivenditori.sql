-- Diario di Posa · LISTINO E RICHIESTE DI PREVENTIVO dei rivenditori.
-- Da eseguire una volta sola, dopo accessi.sql: Supabase › SQL Editor › New query › incolla tutto › Run.
-- Aggiunge cose nuove; i dati che ci sono già non vengono toccati.

create table if not exists public.richieste_preventivo (
  id uuid primary key default gen_random_uuid(),
  titolare uuid not null references auth.users on delete cascade,
  rivenditore uuid not null references public.membri (user_id) on delete cascade,
  cliente text, indirizzo text, telefono text,
  piano text, ascensore text, tiro boolean not null default false,
  righe jsonb not null default '[]'::jsonb,      -- [{voce, descr, qta, vecchio: 'smontaggio'|'smuratura'|''}]
  note text,
  stima numeric,
  stato text not null default 'nuova' check (stato in ('nuova', 'in_lavorazione', 'inviato', 'chiusa')),
  risposta text,
  preventivo_id text,
  notificato boolean not null default false,
  creato timestamptz not null default now(),
  aggiornato timestamptz not null default now()
);
create index if not exists rich_prev_titolare on public.richieste_preventivo (titolare, stato);
create index if not exists rich_prev_rivenditore on public.richieste_preventivo (rivenditore);
alter table public.richieste_preventivo enable row level security;

drop policy if exists "richieste preventivo: vede" on public.richieste_preventivo;
drop policy if exists "richieste preventivo: gestisce" on public.richieste_preventivo;
create policy "richieste preventivo: vede" on public.richieste_preventivo for select to authenticated
  using (rivenditore = (select auth.uid()) or public._gestore(titolare));
create policy "richieste preventivo: gestisce" on public.richieste_preventivo for update to authenticated
  using (public._gestore(titolare)) with check (public._gestore(titolare));
grant select, update on public.richieste_preventivo to authenticated;

-- listino del titolare per il rivenditore (solo se il titolare lo rende visibile)
create or replace function public.listino_rivenditore() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.membri; imp jsonb; az jsonb; li jsonb;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  imp := public._impostazioni(m.titolare);
  if coalesce((imp->'accessi'->>'listino')::boolean, true) = false then return jsonb_build_object('visibile', false); end if;
  select data into li from public.records where user_id = m.titolare and kind = 'cfg' and id = 'listino' and not deleted;
  select data into az from public.records where user_id = m.titolare and kind = 'cfg' and id = 'azienda' and not deleted;
  return jsonb_build_object('visibile', true, 'listino', li,
    'azienda', case when az is null then null else jsonb_build_object(
      'ragioneSociale', az->'ragioneSociale', 'piva', az->'piva', 'email', az->'email', 'telefono', az->'telefono',
      'indirizzo', az->'indirizzo', 'condizioni', az->'condizioni') end);
end $$;

-- il rivenditore manda i dati per un preventivo
create or replace function public.chiedi_preventivo(dati jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare m public.membri; nuovo uuid;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if jsonb_typeof(dati) <> 'object' or length(dati::text) > 30000 then raise exception 'Dati non validi'; end if;
  if (select count(*) from public.richieste_preventivo where rivenditore = m.user_id and creato > now() - interval '1 hour') >= 20 then
    raise exception 'Troppe richieste in poco tempo, riprova più tardi';
  end if;
  insert into public.richieste_preventivo (titolare, rivenditore, cliente, indirizzo, telefono, piano, ascensore, tiro, righe, note, stima)
  values (m.titolare, m.user_id, left(trim(dati->>'cliente'), 120), left(trim(dati->>'indirizzo'), 200), left(trim(dati->>'telefono'), 40),
          left(dati->>'piano', 40), left(dati->>'ascensore', 10), coalesce((dati->>'tiro')::boolean, false),
          case when jsonb_typeof(dati->'righe') = 'array' then dati->'righe' else '[]'::jsonb end, left(trim(dati->>'note'), 2000), nullif(dati->>'stima', '')::numeric)
  returning id into nuovo;
  return nuovo;
end $$;

revoke all on function public.listino_rivenditore() from public, anon;
revoke all on function public.chiedi_preventivo(jsonb) from public, anon;
grant execute on function public.listino_rivenditore(), public.chiedi_preventivo(jsonb) to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.richieste_preventivo; exception when others then null; end;
end $$;
