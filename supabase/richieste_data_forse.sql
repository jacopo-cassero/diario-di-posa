-- Diario di Posa · LE RICHIESTE DI DATA DEI RIVENDITORI SONO «IN FORSE» FINCHÉ NON LE ACCETTI.
-- Da eseguire una volta: Supabase › SQL Editor › New query › incolla tutto › Run. Si può rilanciare senza danni.
-- Serve date_forse.sql già lanciato. Non cancella dati.
-- Quando un rivenditore chiede una data, per gli altri quel giorno diventa «? occupato»: nessuno può chiedere lo stesso giorno.
-- Quando la confermi diventa occupato sicuro; se la rifiuti torna libero.

-- i giorni occupati solo da date in forse (per gli altri rivenditori: «forse occupato»)
create or replace function public.giorni_forse(da date, a date) returns setof date
language plpgsql stable security definer set search_path = '' as $$
declare m public.membri; tit uuid;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo';
  if m.ruolo is distinct from 'rivenditore' and not public._gestore(public._titolare()) then raise exception 'Accesso non consentito'; end if;
  tit := coalesce(m.titolare, public._titolare());
  if a - da > 400 then a := da + 400; end if;
  return query
    with r as (
      select kind, data, coalesce((data->>'forse')::boolean, false) as fo from public.records
       where user_id = tit and not deleted and kind in ('lavori', 'interventi', 'eventi')
    ), iv as (
      select fo, public._data(data->>'data') as i, greatest(public._data(data->>'data'), public._data(data->>'dataFine')) as f from r where kind in ('lavori', 'eventi')
      union all
      select fo, public._data(data->>'dataProg'), public._data(data->>'dataProg') from r where kind = 'interventi' and coalesce(data->>'stato', '') <> 'annullato'
    ), giorni as (
      select iv.fo, g::date as giorno from iv, generate_series(greatest(iv.i, da), least(iv.f, a, iv.i + 366), interval '1 day') g
       where iv.i is not null and iv.f is not null and iv.f >= da and iv.i <= a
    )
    -- richieste di prenotazione non ancora confermate: anche loro sono «in forse»
    select distinct giorno from (
      select giorno from giorni where fo
      union
      select g::date from public.prenotazioni p, generate_series(greatest(p.data, da), least(p.data_fine, a), interval '1 day') g
       where p.titolare = tit and p.stato = 'richiesta' and p.data_fine >= da and p.data <= a
    ) f
    except
    select giorno from giorni where not fo
    except
    select g::date from public.prenotazioni p, generate_series(greatest(p.data, da), least(p.data_fine, a), interval '1 day') g
     where p.titolare = tit and p.stato = 'confermata' and p.data_fine >= da and p.data <= a
       and (p.lavoro_id is null or not exists (select 1 from public.records x where x.user_id = tit and x.id = p.lavoro_id and coalesce((x.data->>'forse')::boolean, false)))
    order by 1;
end $$;
revoke all on function public.giorni_forse(date, date) from public, anon;
grant execute on function public.giorni_forse(date, date) to authenticated;
