# ADR-003: Vitest Over Jest for Testing

## Status
✅ **Accepted** | Date: 2024-12

## Context
Necessario framework di testing per unit e integration tests.

### Requirements
- ES Modules support nativo
- Performance elevate
- TypeScript/JSDoc support
- Code coverage integrato
- Developer experience moderna

### Alternative Considerate
1. **Jest**
   - ➕ Molto popolare, ecosystem ampio
   - ➖ ESM support problematico
   - ➖ Configurazione complessa per Vite
   - ➖ Slower

2. **Vitest** ⭐ (Scelta finale)
   - ➕ Vite-native (stessa config)
   - ➕ ESM first-class
   - ➕ 10x più veloce di Jest
   - ➕ API compatibile Jest
   - ➕ Watch mode intelligente

3. **AVA**
   - ➕ Lightweight
   - ➖ Ecosystem limitato
   - ➖ Less mainstream

## Decision
Utilizziamo **Vitest** per unit/integration testing.

## Rationale
- **Performance**: 10x più veloce grazie a Vite
- **Config**: Riusa `vite.config.js`, zero duplicazione
- **ESM**: Funziona nativamente con ES modules
- **DX**: Watch mode instant, HMR per test
- **Compatibility**: API Jest-like, migration facile

## Configuration

```javascript
// vitest.config.js
export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90
    },
    globals: true
  }
});
```

## Consequences

### Positive
✅ Setup rapido (integrazione Vite)  
✅ Test execution velocissima  
✅ Watch mode performante  
✅ Coverage target facile da enforciare  

### Negative
⚠️ Ecosystem più piccolo vs Jest (non impatta per our use case)  
⚠️ Alcune librerie reference Jest (workaround disponibili)  

## Migration Path from Jest
Non applicabile (greenfield implementation)

## References
- [Vitest Documentation](https://vitest.dev)
- `/vitest.config.js` - Configuration
- `/tests/` - Test suites
