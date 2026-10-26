// Impostazioni di collegamento. Questi valori sono pubblici per natura:
// i dati restano protetti perché ogni utente vede solo i propri (regole del database).
// Se lasci vuoti i campi, l'app parte in "modalità prova" e salva solo sul dispositivo.
window.DIARIO_CONFIG = {
  supabaseUrl: '',      // es. https://abcdefgh.supabase.co
  supabaseAnonKey: '',  // chiave "anon public" del progetto Supabase
  vapidPublicKey: 'BHJzyNR7zFLNyGh0fXcjjqZYreRrUFSB1sZHk-MhsK6vAhZyq0M0bzPDb7evWa1GaD4eg90AQIhvSevS5htmNXc', // chiave pubblica per le notifiche
};
