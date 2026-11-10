-- Diario di Posa · I RIVENDITORI POSSONO MODIFICARE LE RICHIESTE DI PREVENTIVO già inviate.
-- Da eseguire una volta: Supabase › SQL Editor › New query › incolla tutto › Run. Si può rilanciare senza danni.
-- Aggiunge cose nuove; i dati che ci sono già non vengono toccati.

alter table public.richieste_preventivo add column if not exists modificata timestamptz;                           -- ultima modifica fatta dal rivenditore
alter table public.richieste_preventivo add column if not exists precedente jsonb;                                  -- com'era prima delle modifiche che l'installatore non ha ancora visto
alter table public.richieste_preventivo add column if not exists modifica_notificata boolean not null default true; -- false = c'è una modifica ancora da notificare

-- Notifiche ai rivenditori (preventivo pronto, prenotazione confermata…): la colonna che ricorda l'ultimo avviso mandato.
-- Sono le stesse righe di notifiche_rivenditori.sql: se l'avevi già lanciato qui non succede niente.
do $do$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'prenotazioni' and column_name = 'avviso_riv') then
    alter table public.prenotazioni add column avviso_riv text;
    -- quello che è già successo finora non viene notificato
    update public.prenotazioni set avviso_riv = stato || '|' || to_char(data, 'YYYY-MM-DD') || '|' || to_char(data_fine, 'YYYY-MM-DD');
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'richieste_preventivo' and column_name = 'avviso_riv') then
    alter table public.richieste_preventivo add column avviso_riv text;
    update public.richieste_preventivo set avviso_riv = stato;
  end if;
end $do$;

-- il rivenditore corregge una sua richiesta: aggiunge, toglie o cambia i dati (oppure segnala che ha aggiunto foto)
create or replace function public.modifica_richiesta_preventivo(richiesta uuid, dati jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare m public.membri; r public.richieste_preventivo; prima jsonb; riapre boolean; solo_foto boolean; con_foto boolean;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if dati is null or jsonb_typeof(dati) <> 'object' or length(dati::text) > 30000 then raise exception 'Dati non validi'; end if;
  select * into r from public.richieste_preventivo where id = richiesta and rivenditore = m.user_id for update;
  if r.id is null then raise exception 'Richiesta non trovata'; end if;
  if r.stato = 'chiusa' then raise exception 'Questa richiesta è chiusa e non si può più modificare: mandane una nuova'; end if;

  solo_foto := coalesce((dati->>'soloFoto')::boolean, false);
  con_foto := solo_foto or coalesce((dati->>'conFoto')::boolean, false);
  riapre := r.stato = 'inviato';   -- il preventivo era già pronto: la richiesta torna tra quelle da guardare
  -- com'era prima: si tiene la versione che l'installatore ha visto per ultima, anche dopo più modifiche di fila
  prima := coalesce(r.precedente, jsonb_build_object('cliente', r.cliente, 'indirizzo', r.indirizzo, 'telefono', r.telefono,
    'piano', r.piano, 'ascensore', r.ascensore, 'tiro', r.tiro, 'righe', r.righe, 'note', r.note));
  if con_foto then prima := prima || jsonb_build_object('foto', true); end if;

  if not solo_foto then
    update public.richieste_preventivo set
      cliente = left(trim(dati->>'cliente'), 120), indirizzo = left(trim(dati->>'indirizzo'), 200), telefono = left(trim(dati->>'telefono'), 40),
      piano = left(dati->>'piano', 40), ascensore = left(dati->>'ascensore', 10), tiro = coalesce((dati->>'tiro')::boolean, false),
      righe = case when jsonb_typeof(dati->'righe') = 'array' then dati->'righe' else '[]'::jsonb end,
      note = left(trim(dati->>'note'), 2000), stima = nullif(dati->>'stima', '')::numeric, aggiornato = now()
    where id = r.id;
  end if;

  -- l'installatore non ha ancora ricevuto nemmeno l'avviso della richiesta nuova: la vedrà direttamente aggiornata
  if r.stato = 'nuova' and not r.notificato then return r.stato; end if;

  update public.richieste_preventivo set
    modificata = now(), modifica_notificata = false, precedente = prima,
    stato = case when riapre then 'in_lavorazione' else stato end,
    avviso_riv = case when riapre then 'riaperta' else avviso_riv end   -- così, quando il preventivo aggiornato è pronto, il rivenditore viene riavvisato
  where id = r.id;
  return case when riapre then 'in_lavorazione' else r.stato end;
end $$;

revoke all on function public.modifica_richiesta_preventivo(uuid, jsonb) from public, anon;
grant execute on function public.modifica_richiesta_preventivo(uuid, jsonb) to authenticated;

-- avvisi immediati (solo se hai già attivato avvisi_istantanei.sql; altrimenti arrivano con il controllo ogni 5 minuti)
do $do$
begin
  if to_regprocedure('public._avvisa_subito()') is null then return; end if;
  -- a te, quando un rivenditore modifica una richiesta (una volta sola, anche se la ritocca più volte di seguito)
  execute $s$drop trigger if exists avvisa_modifica on public.richieste_preventivo$s$;
  execute $s$create trigger avvisa_modifica after update of modifica_notificata on public.richieste_preventivo for each row
    when (new.modifica_notificata = false and old.modifica_notificata) execute function public._avvisa_subito()$s$;
  -- al rivenditore, quando confermi, sposti, rifiuti o annulli una data e quando il preventivo è pronto
  execute $s$drop trigger if exists avvisa_rivenditore on public.prenotazioni$s$;
  execute $s$create trigger avvisa_rivenditore after update of stato, data, data_fine on public.prenotazioni for each row
    when (new.stato in ('confermata', 'rifiutata') and (old.stato, old.data, old.data_fine) is distinct from (new.stato, new.data, new.data_fine)) execute function public._avvisa_subito()$s$;
  execute $s$drop trigger if exists avvisa_rivenditore on public.richieste_preventivo$s$;
  execute $s$create trigger avvisa_rivenditore after update of stato on public.richieste_preventivo for each row
    when (new.stato in ('inviato', 'chiusa') and old.stato is distinct from new.stato) execute function public._avvisa_subito()$s$;
end $do$;
