# Pilot Runbook - Portale Distributori Neofuel

> Ultimo aggiornamento: 2026-07-18  
> ⚠️ Pilot vietato finché Gate 0 e Gate 1 dell'audit non sono chiusi.

## Scopo

Questo runbook guida l'esecuzione di un progetto pilota con una o più stazioni reali, minimizzando il rischio operativo e finanziario.

## Prerequisiti per l'avvio del pilot

1. **Audit closure**: Gate 0 (Security & Auth) e Gate 1 (Pilot Financial Integrity / Correctness) chiusi.
2. **Stazione configurata**: distributore, isole, pistole e cisterne inseriti nel sistema.
3. **Operatori formati**: account creati, ruoli assegnati, stazioni associate.
4. **Prezzi iniziali**: almeno un record prezzi valido per la stazione.
5. **Conti di prova**: eventuali clienti a credito/voucher configurati e testati.
6. **Backup**: Supabase backup/PITR attivo.
7. **Canale di escalation**: contatto owner e procedura di rollback nota.

## Fasi del pilot

### Fase 0 — Preparazione (D-7)

- Verificare che la build deployata in produzione coincida con il commit approvato.
- Eseguire smoke test E2E sulle pagine critiche (login, apertura turno, chiusura turno, voucher).
- Allineare operatori sui nuovi flussi.

### Fase 1 — Soft opening (D-3)

- Abilitare il sistema su una singola isola/stazione a basso traffico.
- Operatore apre turno con contatori e livelli cisterna reali.
- Amministratore verifica i dati in tempo reale nel pannello admin.

### Fase 2 — Go-live parziale (D-1)

- Estendere a tutte le isole della stazione pilot.
- Raccogliere feedback operativo ogni 4 ore.
- Monitorare errori e discrepanze.

### Fase 3 — Full pilot (D)

- Operatività normale per 3-5 giorni lavorativi.
- Confronto tra dati calcolati e contabilità manuale.
- Verifica di tutti i casi d'uso: contanti, POS, voucher, crediti, chiusura.

### Fase 4 — Valutazione e decisione go/no-go

- Se discrepanze > soglia concordata: stop, analisi radice, fix, nuovo pilot.
- Se allineato: approvazione owner per rollout graduale sulle altre stazioni.

## Checklist operativa giornaliera

- [ ] Backup automatico confermato.
- [ ] Nessun turno attivo dalla giornata precedente rimasto aperto.
- [ ] Prezzi della stazione aggiornati se necessario.
- [ ] Ogni apertura turno ha livelli cisterna validi (non vuoti).
- [ ] Ogni chiusura turno ha contatori finali >= contatori iniziali.
- [ ] Totale incasso verificato contro letture POS/cassa.

## Segnali di stop immediato

- Discrepanze finanziarie non spiegabili.
- Errori 500/RPC ripetuti.
- Perdita di dati turno/cassa.
- Comportamento anomalo RLS (operatore vede dati di altre stazioni).

## Contatti e escalation

- Tecnico/owner: @B00RR
- Canale coordinamento: issue #367 (agenti Claude ⇄ Hermes)
- Emergenze live: issue dedicata con label `pilot`, `critical`.

## Dopo il pilot

- Aggiornare `docs/PILOT_RUNBOOK.md` con lezioni apprese.
- Decidere se generalizzare rollout, estendere test, o fermarsi.
