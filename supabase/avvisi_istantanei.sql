-- Avvisi istantanei: quando arriva una prenotazione, una richiesta di preventivo o di accesso,
-- il database avvia subito l'invio delle notifiche (invece di aspettare il controllo ogni 5 minuti).
--
-- PRIMA DI PREMERE RUN: sostituisci INCOLLA_QUI_IL_TOKEN (riga sotto) con il token GitHub creato apposta.

create extension if not exists pg_net with schema extensions;

-- token salvato cifrato nel Vault di Supabase (se lo rilanci, aggiorna quello vecchio)
do $$
declare t text := 'INCOLLA_QUI_IL_TOKEN';
begin
  if t = 'INCOLLA_QUI_IL_TOKEN' or length(t) < 20 then raise exception 'Incolla il token GitHub al posto di INCOLLA_QUI_IL_TOKEN'; end if;
  if exists (select 1 from vault.secrets where name = 'github_avvisi') then
    perform vault.update_secret((select id from vault.secrets where name = 'github_avvisi'), t);
  else
    perform vault.create_secret(t, 'github_avvisi', 'Avvia le notifiche del Diario di Posa');
  end if;
end $$;

create or replace function public._avvisa_subito() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'github_avvisi' limit 1;
  if tok is not null then
    perform net.http_post(
      url := 'https://api.github.com/repos/jacopo-cassero/diario-di-posa/actions/workflows/promemoria.yml/dispatches',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || tok,
        'Accept', 'application/vnd.github+json',
        'X-GitHub-Api-Version', '2022-11-28',
        'User-Agent', 'diario-di-posa',
        'Content-Type', 'application/json'),
      body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('prova', 'false'))
    );
  end if;
  return null;
exception when others then
  return null; -- un problema con l'avviso non deve mai bloccare la prenotazione
end $$;
revoke all on function public._avvisa_subito() from public, anon, authenticated;

drop trigger if exists avvisa_subito on public.prenotazioni;
create trigger avvisa_subito after insert on public.prenotazioni for each row execute function public._avvisa_subito();
drop trigger if exists avvisa_subito on public.richieste_preventivo;
create trigger avvisa_subito after insert on public.richieste_preventivo for each row execute function public._avvisa_subito();
drop trigger if exists avvisa_subito on public.richieste_accesso;
create trigger avvisa_subito after insert on public.richieste_accesso for each row execute function public._avvisa_subito();

-- avvisi al rivenditore quando confermi, sposti, rifiuti o annulli, e quando il preventivo è pronto
drop trigger if exists avvisa_rivenditore on public.prenotazioni;
create trigger avvisa_rivenditore after update of stato, data, data_fine on public.prenotazioni for each row
  when (new.stato in ('confermata', 'rifiutata') and (old.stato, old.data, old.data_fine) is distinct from (new.stato, new.data, new.data_fine))
  execute function public._avvisa_subito();
drop trigger if exists avvisa_rivenditore on public.richieste_preventivo;
create trigger avvisa_rivenditore after update of stato on public.richieste_preventivo for each row
  when (new.stato in ('inviato', 'chiusa') and old.stato is distinct from new.stato)
  execute function public._avvisa_subito();
