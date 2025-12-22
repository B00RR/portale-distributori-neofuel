# ADR-005: GitHub Actions for CI/CD

## Status
✅ **Accepted** | Date: 2024-12

## Context
Necessario sistema CI/CD per automated testing, build e deployment.

### Requirements
- Free tier generoso
- GitHub integration nativa
- Parallel jobs
- Matrix builds
- Secrets management

### Alternative Considerate
1. **GitLab CI**
   - ➕ Potente, configurazione YAML
   - ➖ Richiede migration a GitLab
   - ➖ Free tier limitato (2000 min/mese)

2. **CircleCI**
   - ➕ Performance eccellente
   - ➖ Free tier 6000 min/mese
   - ➖ Setup più complesso

3. **GitHub Actions** ⭐ (Scelta finale)
   - ➕ Integrazione nativa
   - ➕ Free tier 2000 min/mese (public: unlimited)
   - ➕ Marketplace actions
   - ➕ Matrix builds easy

## Decision
Utilizziamo **GitHub Actions** per CI/CD pipeline.

## Rationale
- **Integration**: Zero setup, già su GitHub
- **Cost**: Free per public repos
- **Ecosystem**: Migliaia di actions pronte
- **DX**: YAML semplice, logs chiari

## Pipeline Structure

```yaml
# .github/workflows/test.yml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
```

## Workflows Implemented
1. **test.yml**: Unit + integration tests
2. **build.yml**: Production build verification
3. **security.yml**: Weekly npm audit
4. **lighthouse.yml**: Performance monitoring

## Consequences

### Positive
✅ Test automatici su ogni PR  
✅ Build verification pre-merge  
✅ Security monitoring automatico  
✅ Codecov integration  

### Negative
⚠️ Execution time limits (2000 min/mese free tier)  
   → Mitigazione: Solo su PR/main branch

### Success Metrics
- ✅ Zero broken builds merged
- ✅ 100% PR hanno test passed
- ✅ Coverage tracking automatico

## References
- `.github/workflows/` - Pipeline definitions
- [GitHub Actions Docs](https://docs.github.com/en/actions)
