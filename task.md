# 🎯 Roadmap Verso la 100% Coverage - Neofuel

Questo documento traccia i progressi necessari per raggiungere la copertura totale (100%) in ogni modulo del progetto.

## 🛠️ Fase 1: Core \u0026 Infrastructure (Alta Priorità)
- [ ] **Autenticazione (`js/core/auth.ts`)**: Mocking di Supabase Auth e gestione sessioni.
- [ ] **Offline Engine**:
  - [ ] `js/core/offline-db.ts`: Test di persistenza locale (IndexedDB mock).
  - [ ] `js/core/offline-queue.ts`: Test di retry e gestione conflitti.
  - [ ] `js/core/sync.ts`: Test di sincronizzazione bidirezionale.
- [ ] **Config \u0026 Client**: `js/core/config.ts`, `supabase-client.ts`, `zod-client.ts`.

## 🧮 Fase 2: Business Logic \u0026 Utils
- [ ] **Motore di Calcolo**:
  - [ ] `js/utils/calculation-engine.ts`: Test su ricavo teorico, eccedenze e calcoli fiscali.
  - [ ] `js/utils/calculation-presets.ts`: Validazione configurazioni per diverse stazioni.
- [ ] **Shared State (`js/shared/state.js`)**: Test su store Redux-like e update selettivi.

## 🏛️ Fase 3: Amministrazione (Admin Panel)
- [ ] **Dashboard \u0026 Analytics**:
  - [ ] `js/admin/dashboard.ts` \u0026 `dashboard-charts.ts`: Rendering grafici e KPI dinamici.
  - [ ] `js/admin/dashboard-helpers.ts`: Logica di filtraggio dati dashboard.
- [ ] **Gestione Operativa**:
  - [ ] `js/admin/invoices.ts`: Logica di fatturazione.
  - [ ] `js/admin/prices.ts`: Aggiornamento listini prezzi.
  - [ ] `js/admin/router.ts`: Navigazione e RLS check lato client.

## ⛽ Fase 4: Operatore (Operator Panel)
- [ ] **Apertura \u0026 Chiusura**:
  - [ ] `js/operator/opening.ts`: Validazione contatori iniziali.
  - [ ] `js/operator/closure.ts`: Logica di fine turno.
- [ ] **Movimenti Cassa**:
  - [ ] `js/operator/credits.ts`: Gestione sospesi e buoni.
  - [ ] `js/operator/extra-income.ts` \u0026 `outflows.ts`: Gestione entrate/uscite varie.
- [ ] **Layout \u0026 Router**: `js/operator/layout.ts`, `router.ts`.

## 🧩 Fase 5: Web Components (Interazioni Avanzate)
- [ ] **Wizard Complessi**:
  - [ ] `ClosureWizard.ts`: Test approfonditi su ogni step del wizard.
  - [ ] `ShiftOpener.ts`: Test validazione form e interazione hardware.
- [ ] **Gestione Vouchers**:
  - [ ] `VoucherManager.ts`: Test su interazione scanner e generazione batch.

## ✅ Verifica Finale
- [ ] Rimozione di ogni modulo a 0% coverage.
- [ ] Rispetto della soglia globale del 100% in CI/CD.
- [ ] Validazione di tutti i test passanti in modalità parallela.
