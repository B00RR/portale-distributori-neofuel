import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const readRepoFile = (path: string): string => readFileSync(join(root, path), 'utf8');

describe('CSP and Lighthouse repository config', () => {
  it('loads the startup safety net from an external module and forbids inline scripts', () => {
    const indexHtml = readRepoFile('index.html');
    const csp = indexHtml.match(/Content-Security-Policy"\s+content="([^"]+)"/m)?.[1] ?? '';
    const scriptTagAttributes: string[] = [];
    const scriptTagPattern = /<script\b([^>]*)>/gi;
    let match = scriptTagPattern.exec(indexHtml);
    while (match) {
      scriptTagAttributes.push(match[1] ?? '');
      match = scriptTagPattern.exec(indexHtml);
    }

    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(indexHtml).toContain('src="js/startup-safety-net.ts"');
    expect(scriptTagAttributes.every(attributes => attributes.includes('src='))).toBe(true);
  });

  it('uses the single Lighthouse config directory from CI', () => {
    const workflow = readRepoFile('.github/workflows/lighthouse.yml');
    const lighthouseConfig = JSON.parse(readRepoFile('config/lighthouse/lighthouserc.json'));
    const lighthouseBudget = JSON.parse(readRepoFile('config/lighthouse/lighthouse-budget.json'));

    expect(workflow).toContain('budgetPath: ./config/lighthouse/lighthouse-budget.json');
    expect(workflow).toContain('configPath: ./config/lighthouse/lighthouserc.json');
    expect(workflow).toContain('VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}');
    expect(workflow).toContain('VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_KEY }}');
    expect(lighthouseConfig.ci.collect.staticDistDir).toBe('./dist');
    expect(lighthouseBudget[0].resourceSizes).toContainEqual({ resourceType: 'script', budget: 550 });
    expect(existsSync(join(root, 'lighthouserc.json'))).toBe(false);
    expect(existsSync(join(root, 'config/lighthouse/lighthouserc.json'))).toBe(true);
    expect(existsSync(join(root, 'config/lighthouse/lighthouse-budget.json'))).toBe(true);
  });
});
