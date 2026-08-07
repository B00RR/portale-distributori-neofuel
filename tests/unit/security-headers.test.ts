/**
 * Contratto degli header HTTP di sicurezza serviti dal deploy (#317).
 *
 * Non potendo interrogare la produzione, il test valida la sorgente di verità
 * versionata (`vercel.json`): presenza e valori degli header di sicurezza
 * espliciti su tutte le route. La CSP deve coprire ciò che il tag
 * `<meta http-equiv>` in `index.html` non può esprimere (`frame-ancestors`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect, beforeAll } from 'vitest';

// La suite gira con cwd = root del repo (sia in locale sia in CI via npm).
const repoRoot = process.cwd();

interface VercelHeader {
  key: string;
  value: string;
}

interface VercelHeaderRule {
  source: string;
  headers: VercelHeader[];
}

interface VercelConfig {
  headers?: VercelHeaderRule[];
}

describe('Security HTTP headers (#317)', () => {
  let config: VercelConfig;
  let catchAll: VercelHeaderRule;
  let byKey: Map<string, string>;

  beforeAll(() => {
    const raw = readFileSync(resolve(repoRoot, 'vercel.json'), 'utf-8');
    config = JSON.parse(raw) as VercelConfig;

    const rules = config.headers ?? [];
    // La regola che copre tutte le route (root SPA + asset).
    const found = rules.find(r => r.source === '/(.*)');
    expect(found, 'una regola headers deve applicarsi a /(.*)').toBeDefined();
    catchAll = found as VercelHeaderRule;
    byKey = new Map(catchAll.headers.map(h => [h.key.toLowerCase(), h.value]));
  });

  it('applies a Content-Security-Policy with clickjacking and object protections', () => {
    const csp = byKey.get('content-security-policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    // frame-ancestors non è esprimibile via <meta>: deve stare nell'header.
    expect(csp).toContain("frame-ancestors 'none'");
    // Nessun allentamento pericoloso dello script-src.
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('script-src * ');
  });

  it("does not allow embedding the app in frames (clickjacking)", () => {
    expect(byKey.get('x-frame-options')).toBe('DENY');
  });

  it('sets X-Content-Type-Options to nosniff', () => {
    expect(byKey.get('x-content-type-options')).toBe('nosniff');
  });

  it('sets a Referrer-Policy that does not leak full URLs cross-origin', () => {
    const ref = byKey.get('referrer-policy');
    expect(ref).toBeTruthy();
    expect(['strict-origin-when-cross-origin', 'no-referrer', 'same-origin']).toContain(ref);
  });

  it('sets HSTS to force HTTPS on subdomains', () => {
    const hsts = byKey.get('strict-transport-security');
    expect(hsts).toBeTruthy();
    expect(hsts).toMatch(/max-age=\d{7,}/); // almeno ~4 mesi
    expect(hsts).toContain('includeSubDomains');
  });

  it('sets a restrictive Permissions-Policy that still allows the QR scanner camera', () => {
    const pp = byKey.get('permissions-policy');
    expect(pp).toBeTruthy();
    // Il lettore voucher (VoucherManager) usa la fotocamera: deve restare abilitata per self.
    expect(pp).toContain('camera=(self)');
    // Feature non usate: negate.
    expect(pp).toContain('geolocation=()');
    expect(pp).toContain('microphone=()');
  });

  it('keeps the header CSP consistent with the index.html meta CSP origins', () => {
    const csp = byKey.get('content-security-policy') ?? '';
    const indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf-8');
    // Le origini di rete devono coincidere: nessuna divergenza silenziosa.
    expect(indexHtml).toContain('https://*.supabase.co');
    expect(csp).toContain('https://*.supabase.co');
    expect(csp).toContain("script-src 'self'");
  });

  it('allows the Supabase Realtime websocket in connect-src in both header and meta (#459)', () => {
    const csp = byKey.get('content-security-policy') ?? '';
    const indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf-8');
    const indexCsp = indexHtml.match(/Content-Security-Policy"\s+content="([^"]+)"/m)?.[1] ?? '';
    // Il client Supabase Realtime apre wss://*.supabase.co: senza questo il
    // websocket viene bloccato dalla CSP in produzione.
    expect(csp).toContain('wss://*.supabase.co');
    expect(indexCsp).toContain('wss://*.supabase.co');
    // Nessun allentamento: restano entrambe le origini https e wss, niente di piu'.
    expect(csp).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co");
  });
});
