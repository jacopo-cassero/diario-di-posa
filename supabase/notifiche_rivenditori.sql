-- Notifiche ai rivenditori: prenotazione confermata, spostata, rifiutata o annullata; preventivo pronto o richiesta chiusa.

-- ultima situazione già comunicata al rivenditore (così ogni cambiamento si avvisa una volta sola)
alter table public.prenotazioni add column if not exists avviso_riv text;
alter table public.richieste_preventivo add column if not exists avviso_riv text;

-- quello che è già successo finora non viene notificato
update public.prenotazioni set avviso_riv = stato || '|' || to_char(data, 'YYYY-MM-DD') || '|' || to_char(data_fine, 'YYYY-MM-DD') where avviso_riv is null;
update public.richieste_preventivo set avviso_riv = stato where avviso_riv is null;

-- avviso immediato (se hai già lanciato avvisi_istantanei.sql; altrimenti arriva col controllo ogni 5 minuti)
do $do$
begin
  if to_regprocedure('public._avvisa_subito()') is null then return; end if;
  execute $s$drop trigger if exists avvisa_rivenditore on public.prenotazioni$s$;
  execute $s$create trigger avvisa_rivenditore after update of stato, data, data_fine on public.prenotazioni for each row when (new.stato in ('confermata', 'rifiutata') and (old.stato, old.data, old.data_fine) is distinct from (new.stato, new.data, new.data_fine)) execute function public._avvisa_subito()$s$;
  execute $s$drop trigger if exists avvisa_rivenditore on public.richieste_preventivo$s$;
  execute $s$create trigger avvisa_rivenditore after update of stato on public.richieste_preventivo for each row when (new.stato in ('inviato', 'chiusa') and old.stato is distinct from new.stato) execute function public._avvisa_subito()$s$;
end $do$;
