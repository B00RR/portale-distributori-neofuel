# AGENT SECURITY GUIDELINES (NEOFUEL)

Queste linee guida devono essere seguite in ogni futuro intervento di coding su questo progetto.

## 1. Architettura & Database
-   **Nessuna Connessione Diretta in Scrittura**: Il frontend NON deve mai eseguire `insert`, `update` o `delete` direttamente sulle tabelle sensibili (`vouchers`, `prices`, `shifts`).
-   **Uso di RPC/Edge Functions**: Tutte le operazioni di scrittura devono passare attraverso `supabase.rpc()` o `supabase.functions.invoke()`.
-   **RLS Stretta**: Le policy RLS (Row Level Security) devono essere impostate su `READ ONLY` per gli utenti autenticati di base. Solo gli admin possono avere permessi `ALL`.

## 2. Gestione Voucher (CRITICO)
-   **Logica Server-side**: Il riscatto, la validazione e l'annullamento dei voucher devono avvenire ESCLUSIVAMENTE lato server (tramite RPC `redeem_voucher_validated`).
-   **Atomic Transaction**: Il cambio stato del voucher e la registrazione dell'incasso devono avvenire nella stessa transazione DB.

## 3. Sicurezza Frontend
-   **Sanitizzazione**: Usare sempre `escapeHtml()` (da `utils/utils.js`) quando si inietta HTML dinamico (`innerHTML`).
-   **Nessun Segreto**: Non committare mai Service Role Keys o password nel codice client.
-   **Validazione Input**: Validare sempre gli input utente (formati numerici, lunghezze stringhe) prima di inviarli al server, ma NON affidarsi solo a questo per la sicurezza.

## 4. Gestione Errori
-   **No Leak**: Non mostrare stack trace o dettagli tecnici grezzi del database nei messaggi di errore utente (`Toast` o `Alert`). Usare messaggi generici ("Errore durante l'operazione").
-   **Logging**: Evitare `console.log` di dati sensibili (token, email, importi transazioni) in produzione.

## 5. Changelog Sicurezza
-   **16/01/2026**: Refactoring `operator/vouchers.js` per usare RPC sicura. Tentativo di lockdown RLS su tabella `vouchers`.
