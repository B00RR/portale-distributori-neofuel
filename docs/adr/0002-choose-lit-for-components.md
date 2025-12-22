# ADR-002: Choose Lit for UI Components

## Status
✅ **Accepted** | Date: 2024-12

## Context
L'applicazione richiedeva componenti UI riusabili per sostituire HTML hardcodato e migliorare manutenibilità.

### Requirements
- Lightweight (<10KB)
- Web Standards based
- JSDoc/TypeScript friendly
- No Virtual DOM overhead
- Reactive updates

### Alternative Considerate
1. **Vanilla Web Components**
   - ➕ Zero dependencies
   - ➕ Standards nativi
   - ➖ Verboso, boilerplate eccessivo
   
2. **Alpine.js**
   - ➕ Sintassi dichiarativa
   - ➕ Lightweight (15KB)
   - ➖ Non component-based
   - ➖ Approccio diverso da standard

3. **Lit** ⭐ (Scelta finale)
   - ➕ Google-backed
   - ➕ Web Components standard
   - ➕ ~5KB gzipped
   - ➕ Reactive properties
   - ➕ Shadow DOM isolamento

4. **React/Vue**
   - ➖ Troppo pesanti (40KB+)
   - ➖ Overhead per questa use case

## Decision
Utilizziamo **Lit 3.x** per i componenti UI.

## Rationale
- **Size**: Solo 5KB, impatto minimo su bundle
- **Standards**: Web Components → portabilità futura
- **DX**: Template literals, reactive properties
- **TypeScript**: Ottimo supporto JSDoc
- **Performance**: Shadow DOM, no Virtual DOM

## Implementation Examples

```javascript
// BaseComponent.js
export class DataTable extends LitElement {
  static properties = {
    data: { type: Array },
    columns: { type: Array }
  };

  render() {
    return html`
      <table>
        ${this.data.map(row => html`<tr>...</tr>`)}
      </table>
    `;
  }
}
```

## Consequences

### Positive
✅ Riduzione codice -46% (vs hardcoded HTML)  
✅ Event handling automatico  
✅ Componenti testabili isolatamente  
✅ Reactive updates performanti  

### Negative
⚠️ Learning curve per team (mitigato: docs)  
⚠️ Shadow DOM CSS isolation (requires adaptation)  

### Migration Strategy
1. Create base components (FormField, DataTable, etc.)
2. Migrate 1 module as proof of concept
3. Progressive migration (non-blocking)
4. Document patterns in COMPONENT_MIGRATION.md

## References
- [Lit Documentation](https://lit.dev)
- `/js/ui/components/` - Component library
- `/docs/COMPONENT_MIGRATION.md` - Migration guide
