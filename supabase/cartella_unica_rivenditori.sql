-- Diario di Posa · UNA SOLA CARTELLA PER RIVENDITORE, anche se ha più accessi.
-- Gli accessi della stessa azienda (stesso cliente della rubrica, o stesso nome dell'azienda) vedono gli stessi documenti.
-- Da eseguire una volta: Supabase › SQL Editor › New query › incolla tutto › Run. Si può rilanciare senza danni.
-- Serve area_rivenditore.sql già lanciato. Non cambia né cancella dati.

-- a quale azienda appartiene un accesso (stessa regola dell'app)
create or replace function public._gruppo_riv(m public.membri) returns text
language sql stable set search_path = '' as $$
  select case when coalesce(m.cliente_id, '') <> '' then 'c:' || m.cliente_id
              when public._nome_base(coalesce(nullif(m.cliente_nome, ''), nullif(m.azienda, ''), m.nome)) <> '' then 'n:' || public._nome_base(coalesce(nullif(m.cliente_nome, ''), nullif(m.azienda, ''), m.nome))
              else 'u:' || m.user_id::text end
$$;

-- vero se l'accesso collegato ora e quello indicato sono della stessa azienda
create or replace function public._stessa_azienda(altro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select altro = auth.uid() or exists (
    select 1 from public.membri io join public.membri lui on lui.titolare = io.titolare
     where io.user_id = auth.uid() and io.stato = 'attivo' and io.ruolo = 'rivenditore'
       and lui.user_id = altro and lui.ruolo = 'rivenditore'
       and public._gruppo_riv(io) = public._gruppo_riv(lui))
$$;
revoke all on function public._stessa_azienda(uuid) from public, anon;
grant execute on function public._stessa_azienda(uuid) to authenticated;

-- l'elenco dei documenti
drop policy if exists "documenti cliente: vede" on public.documenti_cliente;
create policy "documenti cliente: vede" on public.documenti_cliente for select to authenticated
  using (public._stessa_azienda(rivenditore) or public._gestore(titolare));

-- i file: la cartella di qualsiasi accesso della stessa azienda
create or replace function public._doc_cliente_ok(file_nome text) returns boolean
language sql stable security definer set search_path = '' as $$
  select position('..' in file_nome) = 0 and exists (
    select 1 from public.membri io join public.membri lui on lui.titolare = io.titolare
     where io.user_id = auth.uid() and io.stato = 'attivo' and io.ruolo = 'rivenditore' and lui.ruolo = 'rivenditore'
       and public._gruppo_riv(io) = public._gruppo_riv(lui)
       and starts_with(file_nome, io.titolare::text || '/rivenditori/' || lui.user_id::text || '/'))
$$;
revoke all on function public._doc_cliente_ok(text) from public, anon;
grant execute on function public._doc_cliente_ok(text) to authenticated;
