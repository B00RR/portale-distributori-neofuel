# 🎯 Roadmap Verso la 100% Coverage (Priorizzata) - Neofuel

Questo documento elenca i passi necessari per la copertura totale, ordinati per importanza critica.

## 🔥 Fase 1: Mission-Critical Core
*Fondamentale per la sicurezza e l'integrità dei dati.*
- [ ] **Autenticazione (`js/core/auth.ts`)**: Gestione sessioni e sicurezza.
- [ ] **Business Logic Manager (`js/core/business-logic-manager.ts`)**: Orchestrazione delle regole.
- [ ] **Shared State (`js/shared/state.js`)**: Integrità dello stato globale dell'app.

## ⛽ Fase 2: Operatività Quotidiana (Operator Panel)
*Essenziale per il funzionamento del piazzale e delle chiusure.*
- [ ] **Turni \u0026 Chiusure**:
  - [ ] `js/operator/opening.ts`: Validazione contatori iniziali.
  - [ ] `js/operator/closure.ts`: Logica di fine turno.
- [ ] **Movimenti Cassa**:
  - [ ] `js/operator/credits.ts`: Gestione sospesi e buoni.
  - [ ] `js/operator/extra-income.ts` \u0026 `outflows.ts`: Entrate/uscite cassa.
- [ ] **Routing Operatore**: `js/operator/router.ts` \u0026 `layout.ts`.

## 📦 Fase 3: Affidabilità \u0026 Dati (Offline Engine)
*Garantisce il funzionamento in assenza di rete.*
- [ ] **Database Locale (`js/core/offline-db.ts`)**: Persistenza IndexedDB.
- [ ] **Sincronizzazione**:
  - [ ] `js/core/offline-queue.ts`: Gestione coda di invio.
  - [ ] `js/core/sync.ts`: Allineamento dati locale/remoto.

## 🏛️ Fase 4: Gestione \u0026 Controllo (Admin Panel)
*Strumenti di monitoraggio per la direzione.*
- [ ] **Dashboard \u0026 Analytics**:
  - [ ] `js/admin/dashboard.ts` \u0026 `dashboard-charts.ts`: KPI dinamici.
- [ ] **Logica Fiscale \u0026 Prezzi**:
  - [ ] `js/admin/invoices.ts`: Fatturazione.
  - [ ] `js/admin/prices.ts`: Listini prezzi.
- [ ] **Configurazioni**: `js/admin/dashboard-config.ts` \u0026 `stations.ts`.

## 🧩 Fase 5: UI Complessiva (Web Components)
*Esperienza utente avanzata e wizard interattivi.*
- [ ] **Wizard Interattivi**:
  - [ ] `ClosureWizard.ts`: Step-by-step della chiusura.
  - [ ] `ShiftOpener.ts`: Validazione hardware e form.
- [ ] **Advanced Managers**:
  - [ ] `VoucherManager.ts`: Generazione e scansione batch.

## ✅ Verifica Finale
- [ ] Rimozione di ogni modulo a 0% coverage.
- [ ] Rispetto della soglia globale del 100% in CI/CD.
- [ ] Validazione di tutti i test passanti in modalità parallela.
