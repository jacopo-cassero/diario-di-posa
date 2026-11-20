-- Diario di Posa · CORREZIONE dei consuntivi Edilchieri del 14 novembre 2026.
-- Da eseguire una volta: Supabase › SQL Editor › New query › incolla tutto › Run. Si può rilanciare senza danni.
--
-- Cosa era successo: il consuntivo da 50 € (traversa david, 14 nov) e quello dell'intervento BORRELLO MICHELE (14 nov)
-- erano dello stesso cliente e dello stesso giorno, e l'app li aveva collegati al lavoro sbagliato.
-- Edilchieri ha accettato il consuntivo da 50 €, ma l'accettazione è finita sull'intervento Borrello.
-- Qui sotto: il consuntivo da 50 € passa in «Da fatturare» come accettato; quello di Borrello torna «Da accettare»
-- e il rivenditore trova di nuovo il tasto «Accetto» sotto il suo PDF.
-- Tocca solo questi due lavori e solo se sono ancora come li ho trovati io.

-- 1. i PDF nella cartella del rivenditore: ognuno al suo lavoro
update public.documenti_cliente set consuntivo = 'l:63cefe8e-000a-4172-a8ab-f8ba9cfb47d8'
 where id = 'cons-6zhl6z-3f91dc66-cb0e-4172-8e1b-477d26120f1f' and consuntivo = 'i:4f228fcb-2fda-4f54-b62c-e6fc960e269d';
update public.documenti_cliente set consuntivo = 'i:4f228fcb-2fda-4f54-b62c-e6fc960e269d', esito = null, esito_quando = null, esito_nota = null
 where id = 'cons-t93tei-3f91dc66-cb0e-4172-8e1b-477d26120f1f' and consuntivo is null;

-- 2. il consuntivo da 50 € (traversa david): accettato da Edilchieri › «Da fatturare»
update public.records
   set data = data || jsonb_build_object('amm', 'cons', 'esitoCons', jsonb_build_object('esito', 'accettato', 'chi', 'Edilchieri', 'nota', '', 'quando', '2026-11-20T17:44')),
       updated_at = now()
 where kind = 'lavori' and id = '63cefe8e-000a-4172-a8ab-f8ba9cfb47d8' and not deleted and data->>'amm' = 'acc';

-- 3. l'intervento BORRELLO MICHELE: non era stato accettato › torna «Da accettare»
update public.records
   set data = (data - 'esitoCons') || '{"amm": "acc"}'::jsonb, updated_at = now()
 where kind = 'interventi' and id = '4f228fcb-2fda-4f54-b62c-e6fc960e269d' and not deleted
   and data->>'amm' = 'cons' and data->'esitoCons'->>'quando' = '2026-11-20T17:44';

-- controllo: devono uscire due righe, 50 € «cons» e Borrello «acc»
select data->>'riferimento' as riferimento, coalesce(data->>'importo', data->>'costo') as euro, data->>'amm' as stato
  from public.records where id in ('63cefe8e-000a-4172-a8ab-f8ba9cfb47d8', '4f228fcb-2fda-4f54-b62c-e6fc960e269d');
