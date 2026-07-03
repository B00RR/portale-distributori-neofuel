# Implementation Plans

Set corrente generato dallo skill `improve` (audit `deep`) il **2026-07-03**,
contro il commit `36c3578`. Copre l'intero repo + il DB Supabase live
(`ahlmgafaurossyghimxc`).

Ogni executor: leggi il piano per intero prima di iniziare, rispetta le sue STOP
conditions, aggiorna la tua riga qui sotto a lavoro finito.

> Lo storico set UI 022–028 (audit 2026-06-29) è concluso (tutti DONE, PR #118).
> Vedi "Storico" in fondo.

## Ordine di esecuzione & stato — set 032–049 (audit deep + follow-up 2026-07-03)

> I piani 029–031 (guard coda offline, leak Chart.js, Invalid Date) sono stati
> **eseguiti** → [PR #158](https://github.com/B00RR/portale-distributori-neofuel/pull/158)
> (issue #141/#142/#157). I loro file di piano sono stati rimossi da questa
> cartella una volta implementati.

| Plan | Titolo | Priorità | Effort | Dipende da | Categoria | Stato | Issue |
|------|--------|----------|--------|------------|-----------|-------|-------|
| 032 | Idempotenza mutazioni offline via request-id | P2 | L | 029 (fatto) | bug | TODO | [#143](https://github.com/B00RR/portale-distributori-neofuel/issues/143) |
| 033 | Test reali per export_utils (fine del test-teatro) | P1 | M | — | tests | DONE — [PR #159](https://github.com/B00RR/portale-distributori-neofuel/pull/159) | [#144](https://github.com/B00RR/portale-distributori-neofuel/issues/144) |
| 034 | Test reali per calculation-engine | P1 | M | — | tests | DONE — [PR #162](https://github.com/B00RR/portale-distributori-neofuel/pull/162) | [#145](https://github.com/B00RR/portale-distributori-neofuel/issues/145) |
| 035 | Rimuovere scaffold Storybook morto | P3 | S | — | tech-debt | DONE — PR #163 | [#146](https://github.com/B00RR/portale-distributori-neofuel/issues/146) |
| 036 | Pulizia infra test (mock morti + marker) | P3 | S | — | tech-debt | DONE — PR #163 | [#147](https://github.com/B00RR/portale-distributori-neofuel/issues/147) |
| 037 | Igiene dipendenze (dotenv/@types-qrcode/Percy) | P3 | S | — | tech-debt | TODO | [#148](https://github.com/B00RR/portale-distributori-neofuel/issues/148) |
| 038 | Allineare doc copertura al gate reale | P3 | S | — | docs | TODO | [#149](https://github.com/B00RR/portale-distributori-neofuel/issues/149) |
| 039 | Estrarre createEl/createIcon in helper condiviso | P3 | M | — | tech-debt | TODO | [#150](https://github.com/B00RR/portale-distributori-neofuel/issues/150) |
| 040 | Standardizzare error-handling su handleError | P3 | M | — | tech-debt | TODO | [#151](https://github.com/B00RR/portale-distributori-neofuel/issues/151) |
| 041 | Hardening DB: revoca anon su fn interne + leaked-password | P2 | S | — | security | TODO | [#152](https://github.com/B00RR/portale-distributori-neofuel/issues/152) |
| 042 | Consolidare policy RLS permissive + indici (advisor) | P3 | M | — | perf | TODO | [#153](https://github.com/B00RR/portale-distributori-neofuel/issues/153) |
| 043 | [DIR] Coda offline completa (crediti/uscite/extra/fatture) | P2 | L | 029, 032 | direction | TODO | [#154](https://github.com/B00RR/portale-distributori-neofuel/issues/154) |
| 044 | [DIR] UI admin per il motore business-rules | P3 | M | — | direction | TODO | [#155](https://github.com/B00RR/portale-distributori-neofuel/issues/155) |
| 045 | [DIR] Selettore stazione per operatori multi-stazione | P3 | M | — | direction | TODO | [#156](https://github.com/B00RR/portale-distributori-neofuel/issues/156) |
| 046 | Fix timeout/flakiness di export_utils.test.ts | P1 | S | 033 (stesso file) | tests | DONE — [PR #159](https://github.com/B00RR/portale-distributori-neofuel/pull/159) | [#139](https://github.com/B00RR/portale-distributori-neofuel/issues/139) |
| 047 | Silenziare il warning rollup eval di xlsx-populate | P3 | S | — | tech-debt | DONE — [PR #159](https://github.com/B00RR/portale-distributori-neofuel/pull/159) | [#140](https://github.com/B00RR/portale-distributori-neofuel/issues/140) |
| 048 | Rimuovere xlsx-populate/eval dall'export Excel | P1 | M | 047 | security | DONE — [PR #160](https://github.com/B00RR/portale-distributori-neofuel/pull/160) | [#122](https://github.com/B00RR/portale-distributori-neofuel/issues/122) |
| 049 | Seed opt-in per E2E contro Supabase live | P1 | M | — | tests | DONE — [PR #161](https://github.com/B00RR/portale-distributori-neofuel/pull/161) | [#131](https://github.com/B00RR/portale-distributori-neofuel/issues/131) |

> **Piani 046–049**: creati/aggiornati il 2026-07-03 per issue test/export/E2E.
> 033/046/047 sono stati eseguiti in PR #159. Il workaround 047 è stato poi
> superato dal fix strutturale 048 in PR #160: `xlsx-populate` è stato rimosso,
> quindi non serve più filtrare warning `eval`. Il blocco E2E live #131 è stato
> chiuso dal seed opt-in 049 in PR #161.

Valori di stato: TODO | IN PROGRESS | DONE | BLOCKED (motivo) | REJECTED (motivo).

> **Nota**: le issue GitHub per ogni piano vengono aggiunte alla colonna "Issue"
> alla creazione (ogni piano riporta l'URL nel proprio campo `Issue`).

## Ordine consigliato & razionale

1. ~~Quick win 029/030/031~~ — **fatti** (PR #158).
2. **Rete di sicurezza test**: ~~033 (export_utils)~~ — **fatto** (PR #159);
   ~~049 (E2E live seed)~~ — **fatto** (PR #161); ~~034 (calculation-engine)~~
   — **fatto** (PR #162).
3. **Igiene**: 035–038 sono S mechanici (Storybook, mock/marker, deps, doc).
   ~~048 (xlsx-populate)~~ — **fatto** (PR #160), perché era security/rumore build
   direttamente collegato a #122/#140.
4. **Tech-debt strutturale**: 039 (helper DOM), 040 (error-handling) — M.
5. **DB** (finestra di manutenzione, con conferma umana): 041 (hardening
   sicurezza) e 042 (consolidamento RLS/indici).
6. **Direzione** (feature): 043 (coda offline completa), 044 (UI business-rules),
   045 (multi-stazione).

## Note sulle dipendenze

- **032 dipende da 029**: il guard di re-entrancy riduce la finestra di
  concorrenza; l'idempotenza request-id chiude il caso "RPC eseguita ma risposta
  persa". 032 è a rischio ALTO (tocca RPC del DB live) e richiede conferma umana.
- **043 dipende da 029 e idealmente 032**: accodare mutazioni finanziarie amplifica
  il rischio di doppia applicazione.
- **041 e 042** possono condividere la stessa finestra di manutenzione DB.

## Findings considerati e SCARTATI (per non ri-analizzarli)

- **Doppio schema turni** (canonical vs legacy `opening_shift`/`closing_shift`/…):
  **RISOLTO**. Le tabelle legacy non esistono più nel DB live (solo `shifts` +
  `shift_pistols`) e nessun file `js/` le referenzia. Non è più un finding.
- **`js/core/analytics.ts` "codice morto"**: FALSO — è importato da `js/app.ts`
  (`initAnalytics`, `trackLogin`).
- **Sicurezza client** (rate-limiter in-memory come "bypassabile", assenza CSRF
  token, `innerHTML` su template statici, IndexedDB offline in chiaro): by-design
  per l'architettura Supabase (JWT in header, RLS server-side) / PWA. Non findings.
- **Lag major TS 6 / Vite 8**: numeri di versione non affidabili dall'audit
  (oltre il knowledge cutoff), non verificabili. Non pianificato.
- **`fast-uri`/`minimatch` overrides**: giustificati (fix CVE), da non rimuovere.
- **`xlsx-populate`/warning eval**: RISOLTO. #122 ha rimosso la dipendenza in PR #160;
  #140/047 resta nello storico solo come workaround già superato.
- **Retry off-by-one coda offline**: non è un bug (`incrementRetry` è awaited); il
  problema reale è la re-entrancy → piano 029.
- **Popolare Storybook** (suggerito da un audit): contraddice la convenzione
  CLAUDE.md ("no libreria di componenti"). Scelta opposta: rimuoverlo (piano 035).

## Cosa NON è stato auditato (deep run, 2026-07-03)

Nessuna review dell'app in esecuzione o visiva; nessun tool a11y automatico
(axe). La copertura E2E reale contro Supabase live **non è più bloccata sul
seeding**: #131 è chiusa con PR #161 e live mode è opt-in via
`E2E_SUPABASE_MODE=live` + `SUPABASE_SERVICE_ROLE_KEY`. Il consolidamento RLS
(042) è stato dimensionato dagli advisor, non da un profiling su carico reale.

## Storico

- **2026-07-03**: piani 048/049 DONE → [PR #160](https://github.com/B00RR/portale-distributori-neofuel/pull/160) e [PR #161](https://github.com/B00RR/portale-distributori-neofuel/pull/161), chiuse issue #122/#131.
- **2026-07-03**: piani 033/046/047 DONE → [PR #159](https://github.com/B00RR/portale-distributori-neofuel/pull/159), chiuse issue #139/#140/#144.
- **2026-07-03**: audit `deep` (intero repo + DB live) → questo set 029–045.
- **2026-06-29**: audit `improve ui deep` → piani 022–028 (tutti DONE, PR #118).
  I precedenti 001–021 erano stati eliminati come obsoleti in quella sessione.
