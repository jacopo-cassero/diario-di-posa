-- Diario di Posa · DOCUMENTI PER I RIVENDITORI (certificati, DURC, assicurazioni, schede…)
-- Da eseguire una volta sola: Supabase › SQL Editor › New query › incolla tutto › Run.
-- I rivenditori approvati possono vedere e scaricare solo i file che metti in «Documenti rivenditori».

-- vero se il file è nella cartella dei documenti per i rivenditori del titolare di questo rivenditore
create or replace function public._documento_riv_ok(file_nome text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membri m
     where m.user_id = auth.uid() and m.stato = 'attivo' and m.ruolo = 'rivenditore'
       and starts_with(file_nome, m.titolare::text || '/documenti-rivenditori/')
       and position('..' in file_nome) = 0
  )
$$;
revoke all on function public._documento_riv_ok(text) from public, anon;
grant execute on function public._documento_riv_ok(text) to authenticated;

drop policy if exists "file: documenti per i rivenditori" on storage.objects;
create policy "file: documenti per i rivenditori" on storage.objects for select to authenticated
  using (bucket_id = 'file' and public._documento_riv_ok(name));

-- l'elenco dei documenti (titolo, scadenza, file) per il rivenditore collegato
create or replace function public.documenti_rivenditore() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.membri; d jsonb;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  select data into d from public.records where user_id = m.titolare and kind = 'cfg' and id = 'documentiRiv' and not deleted;
  return coalesce(d->'lista', '[]'::jsonb);
end $$;
revoke all on function public.documenti_rivenditore() from public, anon;
grant execute on function public.documenti_rivenditore() to authenticated;
