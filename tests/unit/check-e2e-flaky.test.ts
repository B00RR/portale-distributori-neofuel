/**
 * Policy flaky E2E (#335): un test passato solo al retry deve fallire il gate
 * a meno di una voce di allowlist esplicita con owner e scadenza validi.
 */
import { describe, it, expect } from 'vitest';

import { analyzeReport, collectTests } from '../../scripts/check-e2e-flaky.mjs';

const NOW = new Date('2026-07-18T12:00:00Z');

function reportWith(tests: Array<{ title: string; project: string; status: string }>): unknown {
  return {
    suites: [
      {
        title: 'auth.spec.js',
        suites: [
          {
            title: 'Autenticazione',
            specs: tests.map(t => ({
              title: t.title,
              file: 'e2e/auth.spec.js',
              tests: [{ projectName: t.project, status: t.status }]
            }))
          }
        ]
      }
    ]
  };
}

describe('check-e2e-flaky (#335)', () => {
  it('collects tests from nested suites with project and status', () => {
    const tests = collectTests(
      reportWith([{ title: 'login', project: 'firefox', status: 'flaky' }])
    );

    expect(tests).toEqual([
      { title: 'login', file: 'e2e/auth.spec.js', project: 'firefox', status: 'flaky' }
    ]);
  });

  it('reports a violation for a flaky test with an empty allowlist', () => {
    const { summary, violations } = analyzeReport(
      reportWith([
        { title: 'login', project: 'firefox', status: 'flaky' },
        { title: 'logout', project: 'firefox', status: 'expected' }
      ]),
      [],
      NOW
    );

    expect(summary).toEqual({ passed: 1, flaky: 1, failed: 0, skipped: 0 });
    expect(violations).toHaveLength(1);
    expect(violations[0].title).toBe('login');
  });

  it('accepts a flaky test covered by a valid allowlist entry', () => {
    const { violations, allowlisted } = analyzeReport(
      reportWith([{ title: 'login', project: 'firefox', status: 'flaky' }]),
      [{ title: 'login', project: 'firefox', owner: 'b00rr', expires: '2026-07-31' }],
      NOW
    );

    expect(violations).toHaveLength(0);
    expect(allowlisted).toHaveLength(1);
  });

  it('rejects a flaky test whose allowlist entry is expired', () => {
    const { violations } = analyzeReport(
      reportWith([{ title: 'login', project: 'firefox', status: 'flaky' }]),
      [{ title: 'login', project: 'firefox', owner: 'b00rr', expires: '2026-07-01' }],
      NOW
    );

    expect(violations).toHaveLength(1);
  });

  it('rejects allowlist entries without owner or expiry', () => {
    const { violations } = analyzeReport(
      reportWith([{ title: 'login', project: 'firefox', status: 'flaky' }]),
      [{ title: 'login', project: 'firefox' }],
      NOW
    );

    expect(violations).toHaveLength(1);
  });

  it('scopes allowlist entries to the declared project', () => {
    const { violations } = analyzeReport(
      reportWith([{ title: 'login', project: 'chromium', status: 'flaky' }]),
      [{ title: 'login', project: 'firefox', owner: 'b00rr', expires: '2026-07-31' }],
      NOW
    );

    expect(violations).toHaveLength(1);
  });

  it('counts failed tests in the summary without duplicating the native gate', () => {
    const { summary, violations } = analyzeReport(
      reportWith([{ title: 'login', project: 'firefox', status: 'unexpected' }]),
      [],
      NOW
    );

    expect(summary.failed).toBe(1);
    expect(violations).toHaveLength(0);
  });
});
