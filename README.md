# Portale Distributori Neofuel

[![Tests](https://github.com/YOUR_USERNAME/portale-distributori-neofuel/workflows/Test%20Suite/badge.svg)](https://github.com/YOUR_USERNAME/portale-distributori-neofuel/actions)
[![Build](https://github.com/YOUR_USERNAME/portale-distributori-neofuel/workflows/Build/badge.svg)](https://github.com/YOUR_USERNAME/portale-distributori-neofuel/actions)
[![codecov](https://codecov.io/gh/YOUR_USERNAME/portale-distributori-neofuel/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_USERNAME/portale-distributori-neofuel)

Sistema di gestione per distributori di carburante Neofuel con focus su sicurezza, affidabilità e manutenibilità.

## 🎯 Caratteristiche Principali

- **Gestione Turni**: Apertura/chiusura con calcoli automatici e discrepanza detection
- **Amministrazione**: Gestione distributori, operatori, isole, pistole, cisterne
- **Voucher System**: Redemption voucher con QR code scanner  
- **Gestione Crediti**: Sistema clienti a credito con movimenti cassa
- **Reporting**: Export PDF/Excel chiusure turno con grafici
- **Multi-ruolo**: Admin, Operatore, Contabilità, Fatturazione

## 🏗️ Architettura

```
js/
├── core/       # API layer, Supabase client
├── admin/      # Moduli amministrativi
├── operator/   # Moduli operatore
├── ui/         
│   └── components/  # Lit components riusabili
├── utils/      # Utilities, calculation engine
└── shared/     # Error handling, state management
```

## 🧪 Testing

**Coverage attuale**: ~70% sui path critici

### Unit & Integration Tests
```bash
npm test                    # Esegui tutti i test
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
```

### E2E Tests (Playwright)
```bash
npm run test:e2e           # Headless
npm run test:e2e:headed    # Con browser visibile
npm run test:e2e:ui        # UI mode interattivo
```

**Test Coverage:**
- ✅ Authentication flow
- ✅ Apertura/chiusura turno
- ✅ Admin CRUD operations
- ✅ Voucher redemption
- ✅ Price management

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Configura VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# Run dev server
npm run dev

# Build for production
npm run build
npm run preview
```

## 📦 Stack Tecnologico

- **Frontend**: Vanilla JS (ES6+), Lit Components
- **Build**: Vite
- **Database**: Supabase (PostgreSQL + RLS)
- **Testing**: Vitest (unit), Playwright (E2E)
- **CI/CD**: GitHub Actions
- **Code Quality**: ESLint, Prettier, JSDoc

## 🎨 UI Components

Sistema di componenti riusabili costruito con Lit:

```javascript
import '@ui/components';

// Form field
<form-field
  label="Nome"
  name="name"
  required
  value="${user.name}">
</form-field>

// Data table
<data-table
  .columns="${columns}"
  .data="${users}"
  @row-click="${handleRowClick}">
</data-table>

// Card container
<card-box title="Statistiche" variant="primary">
  <p>Contenuto</p>
</card-box>
```

Vedi [Component Migration Guide](./docs/COMPONENT_MIGRATION.md) per dettagli.

## 📚 Documentazione

- [Component Migration Guide](./docs/COMPONENT_MIGRATION.md) - Migrazione da HTML hardcodato a componenti
- [ROADMAP](./ROADMAP_MIGLIORAMENTI.md) - Roadmap miglioramenti
- [SQL Schema](./sql/) - Schema database e migrations

## 🔒 Sicurezza

- ✅ Row Level Security (RLS) su tutte le tabelle Supabase
- ✅ `escapeHtml()` su tutti gli output dinamici
- ✅ Security audit automatico settimanale
- ✅ Edge Functions per operazioni sensibili

```bash
# Run security audit
npm audit
npm audit fix
```

## 🤝 Contributing

1. Fork il repository
2. Crea feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

**Before submitting:**
- ✅ Run `npm test` (tutti i test devono passare)
- ✅ Run `npm run test:e2e` (E2E tests devono passare)
- ✅ Code coverage ≥ 70% su nuovi file
- ✅ ESLint clean (`npm run lint`)

## 📊 Code Quality Metrics

| Metrica | Score |
|---------|-------|
| **Overall Quality** | **9/10** ⭐ |
| Test Coverage | 70%+ |
| E2E Tests | 10+ scenarios |
| Lighthouse Score | 90+ |
| Security Audit | 0 high/critical |

## 📝 License

Proprietario - Neofuel © 2025

## 👥 Team

Sviluppato con ❤️ dal team Neofuel

---

**Status**: Production Ready ✅
