-- Mostra ai dipendenti il riferimento (es. Sig. Rossi) dei lavori assegnati.
create or replace function public.miei_lavori(da date, a date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.membri; me text := auth.uid()::text;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'dipendente';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'kind', r.kind, 'id', r.id,
      'data', coalesce(r.data->>'dataProg', r.data->>'data'), 'dataFine', r.data->>'dataFine', 'soloFeriali', r.data->'soloFeriali',
      'cliente', r.data->>'cliente', 'riferimento', coalesce(r.data->>'riferimento', r.data->>'clienteFinale'), 'telefono', r.data->>'telefono', 'indirizzo', r.data->>'indirizzo',
      'installato', r.data->>'installato', 'descrizione', r.data->>'descrizione', 'note', r.data->>'note',
      'urgente', coalesce((r.data->>'urgenzaApplicata')::boolean, false) or coalesce(r.data->>'urgenza', '') in ('alta', 'critica'),
      'stato', r.data->>'stato',
      'voci', (select jsonb_agg(jsonb_build_object('descr', v->>'descr', 'qta', v->'qta', 'unita', v->>'unita'))
                 from jsonb_array_elements(case when jsonb_typeof(r.data->'righe') = 'array' then r.data->'righe' else '[]'::jsonb end) v
                where coalesce(v->>'voce', '') <> 'km'),
      'materiali', r.data->'materiali',
      'squadra', (select jsonb_agg(jsonb_build_object('nome', coalesce(x.nome, x.email)))
                    from public.membri x where x.titolare = m.titolare and x.user_id::text in (select jsonb_array_elements_text(r.data->'assegnati'))),
      'mio', r.data->'lavoroSquadra'->me
    ) order by coalesce(r.data->>'dataProg', r.data->>'data'))
    from public.records r
    where r.user_id = m.titolare and not r.deleted and r.kind in ('lavori', 'interventi')
      and jsonb_typeof(r.data->'assegnati') = 'array' and r.data->'assegnati' ? me
      and coalesce(public._data(r.data->>'dataFine'), public._data(coalesce(r.data->>'dataProg', r.data->>'data'))) >= da
      and public._data(coalesce(r.data->>'dataProg', r.data->>'data')) <= a
  ), '[]'::jsonb);
end $$;
