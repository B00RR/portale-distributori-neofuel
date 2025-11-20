# Portale Distributori Neofuel

Sistema di gestione completo per distributori di carburante con pannello amministratore e operatore.

## 🚀 Caratteristiche

### Pannello Amministratore
- ✅ Gestione stazioni di servizio
- ✅ Configurazione isole e pistole
- ✅ Gestione prezzi carburante
- ✅ Gestione operatori
- ✅ Visualizzazione report e statistiche

### Pannello Operatore
- ✅ Apertura turno con contatori iniziali
- ✅ Chiusura turno (parziale e finale)
- ✅ Calcolo automatico litri venduti
- ✅ Gestione crediti clienti (UTA/DKV)
- ✅ Gestione voucher
- ✅ Riepilogo incassi (contanti, POS, crediti)

## 🛠️ Tecnologie

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **UI**: Design moderno e responsive
- **Icons**: Font Awesome

## 📋 Prerequisiti

- Browser moderno (Chrome, Firefox, Edge, Safari)
- Account Supabase (per il database)
- Server HTTP locale per sviluppo (es. Live Server, http-server)

## 🔧 Installazione

1. **Clona il repository**
   ```bash
   git clone https://github.com/USERNAME/portale-distributori-neofuel.git
   cd portale-distributori-neofuel
   ```

2. **Configura Supabase**
   - Crea un progetto su [Supabase](https://supabase.com)
   - Ottieni l'URL e la chiave pubblica (anon key)
   - Aggiorna le credenziali in `js/app.js`:
     ```javascript
     const SUPABASE_URL = 'your-project-url';
     const SUPABASE_ANON_KEY = 'your-anon-key';
     ```

3. **Avvia il server locale**
   ```bash
   # Opzione 1: Con Live Server (VS Code extension)
   # Click destro su index.html → "Open with Live Server"
   
   # Opzione 2: Con http-server (Node.js)
   npx http-server -p 8080
   
   # Opzione 3: Con Python
   python -m http.server 8080
   ```

4. **Apri nel browser**
   ```
   http://localhost:8080
   ```

## 📊 Schema Database

Il progetto utilizza le seguenti tabelle principali:

- `stations` - Stazioni di servizio
- `islands` - Isole/Colonnine
- `pistole` - Pistole erogatrici
- `opening_shift` - Aperture turno
- `closing_shift` - Chiusure turno
- `apertura_turno_pistole` - Contatori apertura
- `chiusura_turno_pistole` - Contatori chiusura
- `prezzi_distributore` - Prezzi carburante
- `crediti_clienti` - Clienti con credito
- `vouchers` - Buoni carburante

## 🔐 Sicurezza

- ✅ Autenticazione tramite Supabase Auth
- ✅ Row Level Security (RLS) abilitato
- ✅ Validazione input lato client e server
- ✅ Credenziali non hardcoded (usa variabili d'ambiente)

## 📱 Utilizzo

### Login
- **Admin**: Accesso completo a tutte le funzionalità
- **Operatore**: Accesso limitato al pannello operatore

### Flusso Operatore
1. **Apertura Turno**: Inserire contatori iniziali
2. **Durante il Turno**: Gestire crediti e voucher
3. **Chiusura Turno**: Inserire contatori finali e incassi
4. **Chiusura Finale**: Marca come finale per aggiornare i contatori master

## 🐛 Troubleshooting

### Errore "Failed to fetch"
- Verifica che le credenziali Supabase siano corrette
- Controlla la connessione internet
- Verifica che il progetto Supabase sia attivo

### Pagina bianca
- Apri la console del browser (F12)
- Verifica errori JavaScript
- Assicurati che il server HTTP sia avviato

### Contatori non caricati
- Verifica che ci sia almeno una chiusura finale precedente
- Controlla i permessi RLS su Supabase

## 🤝 Contribuire

1. Fork del progetto
2. Crea un branch per la feature (`git checkout -b feature/AmazingFeature`)
3. Commit delle modifiche (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Apri una Pull Request

## 📝 License

Questo progetto è proprietario. Tutti i diritti riservati.

## 👥 Autori

- **Neofuel Team** - *Sviluppo iniziale*

## 📞 Supporto

Per supporto, contattare: support@neofuel.com
