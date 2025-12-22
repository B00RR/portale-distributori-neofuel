# Architecture Decision Records (ADR)

Questo repository documenta tutte le decisioni architetturali significative prese durante lo sviluppo del progetto.

## Indice

### Backend & Infrastructure
- [ADR-001: Use Supabase for Backend](./0001-use-supabase-for-backend.md)

### Frontend & UI
- [ADR-002: Choose Lit for UI Components](./0002-choose-lit-for-components.md)

### Testing & Quality
- [ADR-003: Vitest Over Jest for Testing](./0003-vitest-over-jest.md)
- [ADR-004: Playwright for E2E Testing](./0004-playwright-for-e2e.md)

### DevOps
- [ADR-005: GitHub Actions for CI/CD](./0005-github-actions-cicd.md)

## Status Legend

- ✅ **Accepted** - Decisione implementata e in uso
- 🔄 **Proposed** - In discussione
- ⛔ **Deprecated** - Sostituita da altra decisione
- ❌ **Rejected** - Opzione scartata

## Template ADR

```markdown
# ADR-XXX: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
[Description of the problem and context]

## Decision
[The decision made]

## Consequences
[Impact of the decision]

## References
[Links to related docs, code, etc.]
```

## Quando Creare un ADR

Crea un ADR quando:
- ✅ Scelta di tecnologia/framework principale
- ✅ Decisione architetturale con impatto a lungo termine
- ✅ Trade-off significativi tra alternative
- ✅ Decisione che modifica direzione precedente

NON serve ADR per:
- ❌ Scelte implementative minori
- ❌ Bug fix
- ❌ Refactoring senza cambio architettura
