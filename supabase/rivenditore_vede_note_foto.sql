-- Diario di Posa · IL RIVENDITORE VEDE LE TUE NOTE E LE FOTO DEI SUOI LAVORI.
-- Da eseguire una volta: Supabase › SQL Editor › New query › incolla tutto › Run. Si può rilanciare senza danni.
-- Non cancella dati. Nella posa o nell'intervento il rivenditore vede anche: le tue note, i materiali e le foto/file allegati.
-- Il tuo diario del cantiere NON viene mai mandato: resta solo tuo. Restano nascosti anche i prezzi e il preventivo firmato.

create or replace function public.lavori_rivenditore(da date, a date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.membri; out jsonb;
begin
  select * into m from public.membri where user_id = auth.uid() and stato = 'attivo' and ruolo = 'rivenditore';
  if m.user_id is null then raise exception 'Accesso non consentito'; end if;
  if a - da > 800 then a := da + 800; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'kind', r.kind,
      'data', case when r.kind = 'interventi' then r.data->>'dataProg' else r.data->>'data' end,
      'dataFine', case when r.kind = 'lavori' then r.data->>'dataFine' else null end,
      'oraInizio', r.data->>'oraInizio', 'oraFine', r.data->>'oraFine', 'tuttoGiorno', r.data->'tuttoGiorno',
      'indirizzo', r.data->>'indirizzo', 'riferimento', coalesce(r.data->>'riferimento', r.data->>'clienteFinale'),
      'telefono', coalesce(r.data->>'telefono', ''),
      'cosa', case when r.kind = 'lavori' then r.data->>'installato' else r.data->>'descrizione' end,
      'voci', (select coalesce(jsonb_agg(jsonb_build_object('descr', coalesce(v->>'descr', v->>'voce'), 'qta', v->'qta', 'unita', v->>'unita')), '[]'::jsonb)
                 from jsonb_array_elements(case when jsonb_typeof(r.data->'righe') = 'array' then r.data->'righe' else '[]'::jsonb end) v
                where coalesce(v->>'voce', '') not in ('km', 'sconto', 'arrot') and coalesce(v->>'descr', v->>'voce', '') <> ''),
      'stato', case when r.kind = 'interventi' then r.data->>'stato' else null end,
      'fatto', case when r.kind = 'lavori' then jsonb_array_length(coalesce(r.data->'giorniFatti', '[]'::jsonb)) > 0 else (r.data->>'stato') = 'completato' end,
      'modificato', r.data->'modRiv'->>'quando',
      'noteRiv', coalesce(r.data->>'noteRiv', ''),
      -- quello che scrivi e alleghi tu (il tuo diario no: resta solo tuo)
      'note', coalesce(r.data->>'note', ''),
      'allegati', (select coalesce(jsonb_agg(jsonb_build_object('path', f->>'path', 'nome', f->>'nome', 'tipo', f->>'tipo', 'mini', f->>'mini')), '[]'::jsonb)
                     from jsonb_array_elements(case when jsonb_typeof(r.data->'allegati') = 'array' then r.data->'allegati' else '[]'::jsonb end) f
                    where coalesce(f->>'path', '') <> ''
                      and not exists (select 1 from public.records p where p.user_id = r.user_id and p.kind = 'preventivi' and p.data->'firmato'->>'path' = f->>'path')),
      'materiali', (select coalesce(jsonb_agg(jsonb_build_object('nome', x->>'nome', 'qta', x->'qta')), '[]'::jsonb)
                     from jsonb_array_elements(case when jsonb_typeof(r.data->'materiali') = 'array' then r.data->'materiali' else '[]'::jsonb end) x
                    where coalesce(x->>'nome', '') <> ''),
      'prenotazioneId', r.data->>'prenotazioneId',
      'sospesi', (select coalesce(jsonb_agg(s->>'t'), '[]'::jsonb) from jsonb_array_elements(coalesce(r.data->'sospesi', '[]'::jsonb)) s where coalesce((s->>'fatto')::boolean, false) = false)
    )), '[]'::jsonb) into out
  from public.records r
  where r.user_id = m.titolare and not r.deleted and r.kind in ('lavori', 'interventi')
    and coalesce(r.data->>'stato', '') <> 'annullato'
    and public._lavoro_del_rivenditore(m, r.data, r.id)
    and public._data(case when r.kind = 'interventi' then r.data->>'dataProg' else r.data->>'data' end) is not null
    and public._data(case when r.kind = 'interventi' then r.data->>'dataProg' else r.data->>'data' end) <= a
    and greatest(public._data(case when r.kind = 'interventi' then r.data->>'dataProg' else r.data->>'data' end), public._data(r.data->>'dataFine')) >= da;
  return out;
end $$;
revoke all on function public.lavori_rivenditore(date, date) from public, anon;
grant execute on function public.lavori_rivenditore(date, date) to authenticated;

-- un file allegato a un tuo lavoro si può aprire solo se quel lavoro è del rivenditore collegato (e della sua sede)
drop policy if exists "file: allegati dei lavori per i rivenditori" on storage.objects;
create or replace function public._allegato_riv_ok(file_nome text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membri m
      join public.records r on r.user_id = m.titolare
     where m.user_id = auth.uid() and m.stato = 'attivo' and m.ruolo = 'rivenditore'
       and r.kind in ('lavori', 'interventi') and not r.deleted
       and split_part(file_nome, '/', 1) = m.titolare::text
       and position('..' in file_nome) = 0
       and jsonb_typeof(r.data->'allegati') = 'array'
       and (r.data->'allegati' @> jsonb_build_array(jsonb_build_object('path', file_nome))
            or r.data->'allegati' @> jsonb_build_array(jsonb_build_object('mini', file_nome)))
       and not exists (select 1 from public.records p where p.user_id = r.user_id and p.kind = 'preventivi' and p.data->'firmato'->>'path' = file_nome)
       and public._lavoro_del_rivenditore(m, r.data, r.id)
  )
$$;
revoke all on function public._allegato_riv_ok(text) from public, anon;
grant execute on function public._allegato_riv_ok(text) to authenticated;

create policy "file: allegati dei lavori per i rivenditori" on storage.objects for select to authenticated
  using (bucket_id = 'file' and public._allegato_riv_ok(name));
