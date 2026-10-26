// Impostazioni di collegamento. Questi valori sono pubblici per natura:
// i dati restano protetti perché ogni utente vede solo i propri (regole del database).
// Se lasci vuoti i campi, l'app parte in "modalità prova" e salva solo sul dispositivo.
window.DIARIO_CONFIG = {
  supabaseUrl: 'https://uolcdcvszeeaeoviovjb.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvbGNkY3ZzemVlYWVvdmlvdmpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMzcyNjMsImV4cCI6MjEwODYxMzI2M30.QC8WZJdp6GGdxvRcUvTVVSF3YC7lET73DU4gSX6xjvI',
  vapidPublicKey: 'BHJzyNR7zFLNyGh0fXcjjqZYreRrUFSB1sZHk-MhsK6vAhZyq0M0bzPDb7evWa1GaD4eg90AQIhvSevS5htmNXc', // chiave pubblica per le notifiche
};
