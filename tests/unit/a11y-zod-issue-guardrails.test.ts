import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readRepoFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Issue #222 and #230 guardrails', () => {
  it('keeps icon-only admin controls accessible', () => {
    const dashboardConfig = readRepoFile('js/admin/dashboard-config.ts');
    const vouchers = readRepoFile('js/admin/vouchers_reboot.ts');
    const adminLayout = readRepoFile('js/admin/layout.ts');

    expect(dashboardConfig).toContain('aria-label="${visibilityAction} KPI ${safeTitle}"');
    expect(dashboardConfig).toContain('aria-label="Ridimensiona KPI ${safeTitle}"');
    expect(vouchers).toContain('aria-label="Stampa lotto voucher');
    expect(vouchers).toContain('aria-label="Apri dettaglio lotto voucher');
    expect(vouchers).toContain('aria-label="Elimina lotto voucher');
    expect(adminLayout).toContain("toggle.setAttribute('aria-label', 'Apri menu')");
    expect(adminLayout).toContain("toggle.setAttribute('aria-expanded', 'false')");
    expect(adminLayout).toContain("toggle.setAttribute('aria-controls', 'admin-sidebar')");
  });

  it('keeps operator accordion state exposed through ARIA', () => {
    const operatorLayout = readRepoFile('js/operator/layout.ts');

    expect(operatorLayout).toContain('aria-expanded="false" aria-controls="movimenti-content"');
    expect(operatorLayout).toContain('hidden aria-hidden="true"');
    expect(operatorLayout).toContain(
      "btnMovimenti.setAttribute('aria-expanded', String(nextOpen))"
    );
    expect(operatorLayout).toContain(
      "movimentiContent.setAttribute('aria-hidden', String(!nextOpen))"
    );
  });

  it('validates operator price updates with the shared Zod schema before the Edge Function call', () => {
    const prices = readRepoFile('js/operator/prices.ts');
    const schemas = readRepoFile('js/core/schemas.ts');

    expect(prices).toContain("import { PriceUpdateSchema, safeParse } from '../core/schemas.js'");
    expect(prices).toContain('const validation = safeParse(PriceUpdateSchema');
    expect(prices).toContain('benzina: parsedPrices.prezzo_benzina');
    expect(prices).toContain('gasolio: parsedPrices.prezzo_gasolio');
    expect(schemas).toContain('const PriceValueSchema = z.preprocess');
    expect(schemas).toContain("finite('Prezzo non valido')");
    expect(schemas).toContain('export const ShiftIdSchema');
  });
});
