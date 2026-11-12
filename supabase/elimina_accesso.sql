-- Diario di Posa · ELIMINARE DAVVERO UN ACCESSO e DARE UNA PASSWORD PROVVISORIA NUOVA.
-- Da eseguire una volta: Supabase › SQL Editor › New query › incolla tutto › Run. Si può rilanciare senza danni.
-- Non cambia né cancella dati: aggiunge solo due funzioni che l'app usa quando le tocchi tu.
--
-- 1. elimina_membro: quando elimini una persona dagli Accessi si cancella anche il suo account (email e password),
--    così se la ricrei riparte da zero con una password provvisoria nuova.
-- 2. nuova_password_membro: dà a una persona una password provvisoria nuova (per esempio se hai perso il messaggio).
-- Valgono solo per gli account che esistono per la tua app: mai per il tuo account o per chi ha dati suoi.

-- vero se l'account è solo un accesso alla tua azienda (non è un titolare, non ha dati suoi)
create or replace function public._solo_accesso(utente uuid, tit uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select utente is not null and utente <> tit and utente <> auth.uid()
     and exists (select 1 from public.membri where user_id = utente and titolare = tit)
     and not exists (select 1 from public.membri where titolare = utente)
     and not exists (select 1 from public.records where user_id = utente)
$$;
revoke all on function public._solo_accesso(uuid, uuid) from public, anon, authenticated;

-- elimina la persona: accesso, richiesta di accesso, richieste di preventivo, prenotazioni, documenti della sua cartella
-- (gli ultimi tre si cancellano già da soli insieme all'accesso) e, se è solo un accesso alla tua app, anche l'account.
-- Restituisce true se è stato cancellato anche l'account.
create or replace function public.elimina_membro(utente uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare tit uuid := public._titolare(); m public.membri; solo boolean;
begin
  if not public._gestore(tit) then raise exception 'Solo il titolare può eliminare un accesso'; end if;
  select * into m from public.membri where user_id = utente and titolare = tit;
  if m.user_id is null then raise exception 'Accesso non trovato'; end if;
  if utente = auth.uid() or utente = tit then raise exception 'Non puoi eliminare il tuo account'; end if;
  solo := public._solo_accesso(utente, tit);
  delete from public.richieste_accesso where titolare = tit and lower(email) = lower(coalesce(m.email, ''));
  delete from public.membri where user_id = utente and titolare = tit;
  if solo then delete from auth.users where id = utente; end if;
  return solo;
end $$;
revoke all on function public.elimina_membro(uuid) from public, anon;
grant execute on function public.elimina_membro(uuid) to authenticated;

-- password provvisoria nuova: al prossimo accesso gli chiede di sceglierne una sua; i dispositivi già collegati vengono scollegati
create or replace function public.nuova_password_membro(utente uuid, pw text) returns void
language plpgsql security definer set search_path = '' as $$
declare tit uuid := public._titolare();
begin
  if not public._gestore(tit) then raise exception 'Solo il titolare può cambiare la password'; end if;
  if coalesce(length(pw), 0) < 8 or length(pw) > 72 then raise exception 'La password deve avere almeno 8 caratteri'; end if;
  if not public._solo_accesso(utente, tit) then raise exception 'Per questo account non posso cambiare la password'; end if;
  update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')), updated_at = now() where id = utente;
  update public.membri set cambio_password = true where user_id = utente and titolare = tit;
  begin
    delete from auth.sessions where user_id = utente;
  exception when others then null;   -- se non si può, i dispositivi restano collegati: la password nuova vale comunque
  end;
end $$;
revoke all on function public.nuova_password_membro(uuid, text) from public, anon;
grant execute on function public.nuova_password_membro(uuid, text) to authenticated;
