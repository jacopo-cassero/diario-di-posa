-- Diario di Posa: struttura del database.
-- Da eseguire una volta sola nel progetto Supabase (SQL Editor › New query › incolla › Run).

-- 1. Dati dell'app: ogni riga è un elemento (posa, intervento, spesa, materiale, cartella, furgone).
create table if not exists public.records (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('lavori','interventi','movimenti','magazzino','cartelle','cfg','preventivi')),
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);
alter table public.records enable row level security;
drop policy if exists "solo i propri dati" on public.records;
create policy "solo i propri dati" on public.records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Aggiornamenti in tempo reale tra i dispositivi.
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null; end $$;

-- 2. Dispositivi che ricevono le notifiche.
create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subscription jsonb not null,
  device       text,
  created_at   timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "solo i propri dispositivi" on public.push_subscriptions;
create policy "solo i propri dispositivi" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3. Archivio file privato (foto scontrini e allegati), una cartella per utente.
insert into storage.buckets (id, name, public, file_size_limit)
values ('file', 'file', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "file: lettura propria" on storage.objects;
drop policy if exists "file: caricamento proprio" on storage.objects;
drop policy if exists "file: modifica propria" on storage.objects;
drop policy if exists "file: eliminazione propria" on storage.objects;
create policy "file: lettura propria" on storage.objects for select to authenticated
  using (bucket_id = 'file' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "file: caricamento proprio" on storage.objects for insert to authenticated
  with check (bucket_id = 'file' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "file: modifica propria" on storage.objects for update to authenticated
  using (bucket_id = 'file' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "file: eliminazione propria" on storage.objects for delete to authenticated
  using (bucket_id = 'file' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Aggiornamento per database già creati (preventivi):
alter table public.records drop constraint if exists records_kind_check;
alter table public.records add constraint records_kind_check
  check (kind in ('lavori','interventi','movimenti','magazzino','cartelle','cfg','preventivi','clienti','eventi'));
