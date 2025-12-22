# ADR-001: Use Supabase for Backend

## Status
✅ **Accepted** | Date: 2024-12

## Context
Il progetto richiedeva un backend scalabile con:
- Database relazionale (transazioni ACID)
- Autenticazione utenti multi-ruolo
- Row Level Security (RLS)
- Real-time capabilities (opzionale)
- API REST auto-generata
- Hosting managed

### Alternative Considerate
1. **Custom Node.js + PostgreSQL**
   - ➕ Controllo completo
   - ➖ Manutenzione infrastruttura
   - ➖ Implementare auth da zero
   
2. **Firebase**
   - ➕ Real-time nativo
   - ➖ NoSQL limits per queries complesse
   - ➖ Costo elevato per grandi volumi

3. **Supabase** ⭐ (Scelta finale)
   - ➕ PostgreSQL completo
   - ➕ RLS built-in
   - ➕ Auth multi-provider
   - ➕ Open source
   - ➖ Vendor lock-in moderato

## Decision
Utilizziamo **Supabase** per il backend.

## Rationale
- **PostgreSQL**: Necessario per transazioni complesse (chiusure turno, crediti)
- **RLS**: Security requirement critico per multi-tenancy
- **Auto-API**: Accelera sviluppo, riduce boilerplate
- **Costo**: Free tier generoso, pricing trasparente

## Consequences

### Positive
✅ Sviluppo accelerato (no backend code)  
✅ Security by default (RLS)  
✅ Scalabilità garantita  
✅ Edge Functions per logica custom  

### Negative
⚠️ Vendor lock-in (mitigato: PostgreSQL standard)  
⚠️ Debugging complesso (errori RLS)  
⚠️ Limiti free tier (mitigazione: upgrade quando necessario)  

### Mitigations
- Astrazione data layer (`api.js`) per migration futura
- Backup automatici configurati
- Edge Functions per business logic critica

## References
- [Supabase Documentation](https://supabase.com/docs)
- `/sql` - Migration files
- `js/core/api.js` - Client wrapper
