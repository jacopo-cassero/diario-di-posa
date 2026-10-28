-- Diario di Posa · IL TUO PDF DEL LISTINO per i rivenditori.
-- Da eseguire una volta sola: Supabase › SQL Editor › New query › incolla tutto › Run.
-- Permette ai rivenditori approvati di scaricare solo il file del listino che carichi dall'app (menu › Accessi).

-- vero se il file è il listino PDF del titolare di questo rivenditore, e il listino è visibile
create or replace function public._listino_pdf_ok(file_nome text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membri m
     where m.user_id = auth.uid() and m.stato = 'attivo' and m.ruolo = 'rivenditore'
       and file_nome = m.titolare::text || '/listino-rivenditori.pdf'
       and coalesce((public._impostazioni(m.titolare)->'accessi'->>'listino')::boolean, true)
  )
$$;
revoke all on function public._listino_pdf_ok(text) from public, anon;
grant execute on function public._listino_pdf_ok(text) to authenticated;

drop policy if exists "file: listino per i rivenditori" on storage.objects;
create policy "file: listino per i rivenditori" on storage.objects for select to authenticated
  using (bucket_id = 'file' and public._listino_pdf_ok(name));

-- il listino per il rivenditore dice anche se c'è il tuo PDF
create or replace function public.listino_rivenditore() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.membri; imp jsonb; az jsonb; li jsonb; pdf text;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  imp := public._impostazioni(m.titolare);
  if coalesce((imp->'accessi'->>'listino')::boolean, true) = false then return jsonb_build_object('visibile', false); end if;
  select data into li from public.records where user_id = m.titolare and kind = 'cfg' and id = 'listino' and not deleted;
  select data into az from public.records where user_id = m.titolare and kind = 'cfg' and id = 'azienda' and not deleted;
  pdf := m.titolare::text || '/listino-rivenditori.pdf';
  return jsonb_build_object('visibile', true, 'listino', li,
    'pdf', case when exists (select 1 from storage.objects o where o.bucket_id = 'file' and o.name = pdf) then pdf end,
    'azienda', case when az is null then null else jsonb_build_object(
      'ragioneSociale', az->'ragioneSociale', 'piva', az->'piva', 'email', az->'email', 'telefono', az->'telefono',
      'indirizzo', az->'indirizzo', 'condizioni', az->'condizioni') end);
end $$;
