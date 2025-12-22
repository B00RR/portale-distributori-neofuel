# ADR-004: Playwright for E2E Testing

## Status
✅ **Accepted** | Date: 2024-12

## Context
Necessario framework E2E per testare user flows completi.

### Requirements
- Multi-browser testing
- Debugging potente
- CI/CD integration
- Screenshot/video recording
- Mobile emulation

### Alternative Considerate
1. **Cypress**
   - ➕ Ottimo DX, time travel debugging
   - ➖ Solo Chromium (no true multi-browser)
   - ➖ Limitazioni iframe/multiple tabs
   - ➖ Slower execution

2. **Playwright** ⭐ (Scelta finale)
   - ➕ Multi-browser (Chrome, Firefox, Safari)
   - ➕ Microsoft-backed
   - ➕ Parallel execution
   - ➕ Auto-wait intelligente
   - ➕ Mobile emulation

3. **Selenium**
   - ➕ Molto maturo
   - ➖ API verbosa
   - ➖ Slow, flaky tests
   - ➖ Setup complesso

## Decision
Utilizziamo **Playwright** per E2E testing.

## Rationale
- **Coverage**: Chrome + Firefox + Mobile = 95%+ users
- **Speed**: Parallel execution, fast
- **Reliability**: Auto-wait riduce flakiness
- **CI**: Ottima integrazione GitHub Actions

## Test Structure

```javascript
// e2e/auth.spec.js
test('login flow', async ({ page }) => {
  await page.goto('/');
  await page.fill('#email', 'user@example.com');
  await page.click('button[type="submit"]');
  await expect(page.locator('#app-container')).toBeVisible();
});
```

## Consequences

### Positive
✅ 10+ critical flows coperti  
✅ Cross-browser confidence  
✅ Screenshot/video on failure  
✅ Mobile testing incluso  

### Negative
⚠️ Execution time più lungo vs unit tests (accettabile)  
⚠️ Richiede dev server running (automatizzato in config)  

## Coverage Target
- ✅ Authentication (login, logout, errors)
- ✅ Apertura/Chiusura turno (wizard completo)
- ✅ Admin CRUD (operatori, distributori)
- ✅ Voucher redemption
- ✅ Price management

## References
- [Playwright Documentation](https://playwright.dev)
- `/playwright.config.js` - Configuration
- `/e2e/` - Test suites
