# Diario di Posa

App per il posatore di serramenti: calendario delle pose, interventi, spese con foto dello scontrino, magazzino, furgone con scadenze, analisi di entrate e uscite, cartelle di lavoro e notifiche ogni mattina.

Funziona su iPhone, iPad e Mac come un'app (dalla schermata Home o dal Dock), anche senza rete, e sincronizza i dati tra i dispositivi. Tutto con servizi gratuiti:

- **GitHub Pages** mette online l'app.
- **Supabase** conserva i dati, le foto e gli accessi.
- **GitHub Actions** ogni mattina controlla cosa c'è da fare e manda la notifica.

---

## Installazione (una volta sola, circa 20 minuti)

### 1. Database su Supabase

1. Su [supabase.com](https://supabase.com) crea un nuovo progetto. Nome: `diario-di-posa`. Regione: **Central EU (Frankfurt)**. Scegli una password del database e conservala.
2. Apri **SQL Editor › New query**, incolla tutto il contenuto del file `supabase/schema.sql` e premi **Run**. Deve comparire "Success".
3. Apri **Project Settings › API** (o **API Keys**) e copia:
   - **Project URL**, per esempio `https://abcdefgh.supabase.co`
   - la chiave **anon / publishable**, che va nell'app
   - la chiave **service_role / secret**, che va **solo** nei segreti di GitHub (punto 3) e mai nell'app

### 2. App su GitHub Pages

1. Su [github.com](https://github.com) crea un repository **pubblico** chiamato `diario-di-posa`.
2. Nel file `config.js` inserisci Project URL e chiave anon, poi carica tutti i file del progetto nel repository (pulsante **Add file › Upload files**).
   Sul Mac la cartella `.github` è nascosta: nel Finder premi **Cmd + Maiusc + .** per vederla e trascinarla insieme agli altri file.
3. Nel repository vai in **Settings › Pages**. Come sorgente scegli **Deploy from a branch**, ramo `main`, cartella `/ (root)`, e salva.
   Dopo un paio di minuti l'app è online all'indirizzo `https://TUO-NOME.github.io/diario-di-posa/`.
4. Torna su Supabase, **Authentication › URL Configuration**: in **Site URL** metti l'indirizzo dell'app e aggiungilo anche in **Redirect URLs**.

### 3. Notifiche del mattino

Nel repository vai in **Settings › Secrets and variables › Actions › New repository secret** e crea questi cinque segreti:

| Nome | Valore |
|---|---|
| `SUPABASE_URL` | il Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | la chiave service_role / secret |
| `VAPID_PUBLIC_KEY` | la chiave pubblica delle notifiche (è anche in `config.js`) |
| `VAPID_PRIVATE_KEY` | la chiave privata delle notifiche (te l'ho data a parte: non metterla in nessun file) |
| `VAPID_SUBJECT` | `mailto:` seguito dalla tua email |

### 4. Primo accesso e chiusura delle iscrizioni

1. Apri l'app, scegli **Crea l'account** e conferma dal link che arriva per email.
2. Su Supabase, **Authentication › Sign In / Providers**: disattiva **Allow new users to sign up**. Così nessun altro può crearsi un account sulla tua app.

### 5. Sui dispositivi

- **iPhone e iPad**: apri l'indirizzo in **Safari** › **Condividi** › **Aggiungi alla schermata Home**. Apri l'app dall'icona, accedi, poi in **Cartelle e impostazioni** tocca **Attiva notifiche**.
- **Mac**: apri l'indirizzo in Safari › menu **File › Aggiungi al Dock**.
- **Prova delle notifiche**: su GitHub, **Actions › Promemoria del mattino › Run workflow**. Arriva una notifica di prova.

---

## Come funziona

- **Preventivi**: scegli le voci dal listino (al pezzo, a ore o a corpo), con maggiorazioni per prodotti blindati, posa in luce e urgenza. Il totale si calcola da solo e il PDF, con logo, termini e condizioni e firma per accettazione, è pronto da mandare. Un preventivo accettato si mette in calendario con un tocco.
- **Prezzi automatici**: anche nelle pose e negli interventi si aggiungono le voci del listino e l'importo si calcola da solo. Dal consuntivo si crea il PDF.
- **Listino**: si modifica da *Cartelle e impostazioni › Listino prezzi*. Le modifiche valgono per i nuovi documenti; quelli già salvati non cambiano.

- **Senza rete** l'app continua a funzionare: le modifiche si salvano sul dispositivo e partono appena torna il segnale.
- **Scontrini**: la foto viene letta direttamente dal telefono (riconoscimento del testo gratuito). Data, totale e fornitore sono letti abbastanza bene; le righe di materiale vanno sempre controllate.
- **Cartelle**: in *Cartelle e impostazioni* salvi i link alle tue cartelle di iCloud Drive (o Google Drive, Dropbox). Ogni posa può avere la sua cartella e i suoi allegati.
- **Notifiche**: ogni mattina, solo se c'è qualcosa da fare: scadenze del furgone entro 30 giorni, lavori da consuntivare, fatture da emettere o incassare, materiale sotto scorta, interventi molto urgenti, lavori del giorno dopo.

## Limiti dei piani gratuiti

- Supabase gratuito: 500 MB di dati (decine di migliaia di lavori) e 1 GB di file (circa 3.000 foto di scontrini).
- Supabase sospende i progetti gratuiti dopo 7 giorni senza attività. Il controllo del mattino lo tiene attivo ogni giorno. Se un giorno l'app non si collega, entra su supabase.com e premi **Restore**: i dati non si perdono.
- GitHub sospende i controlli programmati dopo 60 giorni senza modifiche al progetto. Il controllo aggiorna da solo un file una volta al mese per evitarlo.
- Il codice dell'app è pubblico (serve per GitHub Pages gratuito). I **dati** no: ogni utente vede solo i propri.

## File del progetto

| File | A cosa serve |
|---|---|
| `index.html`, `styles.css`, `app.js` | l'app |
| `store.js` | salvataggio sul dispositivo e sincronizzazione |
| `logica.js` | promemoria e lettura scontrini (usata anche dalle notifiche) |
| `listino.js` | listino prezzi 2027, termini e condizioni, calcolo dei prezzi |
| `pdf.js`, `pdf-metrics.js`, `documento.js` | creazione dei PDF di preventivi e consuntivi |
| `sw.js`, `manifest.webmanifest`, `icone/` | installazione come app, funzionamento offline, notifiche |
| `config.js` | collegamento a Supabase |
| `supabase/schema.sql` | struttura del database |
| `scripts/promemoria.mjs`, `.github/workflows/promemoria.yml` | notifiche del mattino |
