# Migrazioni, Deploy & Recovery - Portale Distributori Neofuel

> Ultimo aggiornamento: 2026-07-18  
> ⚠️ **Nota**: le migrazioni in `sql/` sono lo storico del repository. Lo stato live di Supabase può differire: verificare sempre prima di applicare modifiche.

## Convenzioni per le migrazioni

- **Percorso**: `sql/YYYYMMDD_\u003cdescrizione\u003e_\u003cissue\u003e.sql` oppure `sql/migrations/YYYYMMDD_\u003cdescrizione\u003e_\u003cissue\u003e.sql`.
- **Data**: usare la data reale di creazione, mai date future.
- **Idempotenza**: usare `IF NOT EXISTS` / `IF EXISTS` dove possibile; per costrutti non supportati, wrappare in blocchi `DO $$ ... EXCEPTION WHEN ... $$`.
- **Pre-check**: verificare l'assenza di dati problematici prima di `ALTER ... SET NOT NULL` o `ADD CONSTRAINT ... CHECK`.
- **Sicurezza**: le funzioni `SECURITY DEFINER` devono includere `SET search_path = public, pg_temp`.

## Ciclo di una migrazione

1. Scrivere la migrazione con commento iniziale che indichi:
   - issue risolta
   - cosa fa
   - se richiede downtime
   - se richiede backfill
2. Eseguire localmente in un ambiente di test/clone Supabase.
3. Verificare che `npm run type-check` e i test passino (gli unit test usano stub, quindi i test E2E/live sono il vero controllo).
4. Aprire PR; richiedere approvazione del owner prima di applicare su Supabase live.

## Deploy del codice

```bash
# 1. Quality gate locale
npm run lint
npm run type-check
npm test
npm run build

# 2. E2E contro deploy preview (se disponibile)
npm run test:e2e
```

- Il deploy produzione è gestito da GitHub Actions + Vercel/Supabase.
- Ogni PR verso `main` deve avere tutti i check verdi.

## Recovery / Rollback

### Rollback codice

```bash
git revert \u003ccommit-sha\u003e
# oppure
git checkout main
```

### Rollback database

- Supabase mantiene backup automatici (PITR se abilitato).
- Se PITR non è abilitato, ripristinare da dump o dallo snapshot più recente.
- **Non eseguire DROP senza avere un backup verificato**.

### Scenari comuni

| Problema | Azione immediata |
|---|---|
| Migrazione fallita a metà | Non forzare. Aprire issue, rivedere transazione, rollback manuale con backup. |
| RLS rotta → utenti bloccati | Non disabilitare RLS globalmente. Identificare la policy errata e correggerla miratamente. |
| RPC restituisce errore live | Verificare che la firma in `supabase/database.types.ts` corrisponda alla funzione remota. |
| Funzione Edge Function down | Verificare log Supabase; fare deploy della versione precedente. |

## Verifiche pre-deploy

- [ ] `npm run lint` passa con zero warnings.
- [ ] `npm run type-check` passa.
- [ ] `npm test` passa.
- [ ] `npm run build` produce bundle senza errori.
- [ ] Nessun segreto nel codice.
- [ ] Nessuna funzione `SECURITY DEFINER` senza `SET search_path`.
- [ ] Nessuna policy `FOR ALL`/`FOR UPDATE` senza `WITH CHECK`.
- [ ] Migrazioni con date reali.

## Chi approva

- Modifiche a Supabase live (RLS, RPC, Edge Functions): **owner @B00RR**.
- Modifiche pure client: review incrociata agente (Claude ⇄ Hermes) su #367.
