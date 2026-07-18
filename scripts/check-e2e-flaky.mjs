// Flaky policy enforcement per gli E2E Playwright (#335).
//
// Playwright fa fallire il job solo sui test definitivamente falliti: un test
// che passa al retry ("flaky") produce exit code 0 e un riepilogo verde
// fuorviante. Questo script legge il report JSON del run e fa fallire il job
// quando un test flaky non è coperto dalla allowlist esplicita
// (e2e/flaky-allowlist.json), che richiede owner e scadenza per ogni voce.
//
// Uso: node scripts/check-e2e-flaky.mjs [--report path] [--allowlist path]

import { readFileSync } from 'node:fs';
import process from 'node:process';

/** Cammina le suite annidate del report JSON e raccoglie i test per status. */
export function collectTests(report) {
  const tests = [];
  const walk = suite => {
    for (const child of suite.suites ?? []) {
      walk(child);
    }
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        tests.push({
          title: spec.title,
          file: spec.file,
          project: test.projectName ?? test.projectId ?? '',
          status: test.status
        });
      }
    }
  };
  for (const suite of report.suites ?? []) {
    walk(suite);
  }
  return tests;
}

function matchesAllowlist(test, entry, now) {
  if (entry.title !== test.title) {
    return false;
  }
  if (entry.project && entry.project !== test.project) {
    return false;
  }
  if (!entry.owner || !entry.expires) {
    // Una voce senza owner o scadenza non è una policy approvata: non copre.
    return false;
  }
  return now <= new Date(`${entry.expires}T23:59:59Z`);
}

/**
 * Ritorna il verdetto del run: flaky non coperti dalla allowlist = violazioni.
 * I test definitivamente falliti ("unexpected") sono già bloccati dall'exit
 * code nativo di Playwright; qui vengono solo riepilogati.
 */
export function analyzeReport(report, allowlist = [], now = new Date()) {
  const tests = collectTests(report);
  const summary = {
    passed: tests.filter(t => t.status === 'expected').length,
    flaky: tests.filter(t => t.status === 'flaky').length,
    failed: tests.filter(t => t.status === 'unexpected').length,
    skipped: tests.filter(t => t.status === 'skipped').length
  };

  const flakyTests = tests.filter(t => t.status === 'flaky');
  const violations = flakyTests.filter(
    test => !allowlist.some(entry => matchesAllowlist(test, entry, now))
  );
  const allowlisted = flakyTests.filter(test =>
    allowlist.some(entry => matchesAllowlist(test, entry, now))
  );

  return { summary, flakyTests, violations, allowlisted };
}

function main() {
  const args = process.argv.slice(2);
  const readArg = (name, fallback) => {
    const index = args.indexOf(name);
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
  };
  const reportPath = readArg('--report', 'playwright-report/results.json');
  const allowlistPath = readArg('--allowlist', 'e2e/flaky-allowlist.json');

  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));

  const { summary, violations, allowlisted } = analyzeReport(report, allowlist);

  console.log(
    `E2E status: ${summary.passed} passed, ${summary.flaky} flaky, ` +
      `${summary.failed} failed, ${summary.skipped} skipped`
  );

  for (const test of allowlisted) {
    console.log(`⚠️  Flaky in allowlist (da correggere prima della scadenza): [${test.project}] ${test.title}`);
  }

  if (violations.length > 0) {
    console.error('\n❌ Test flaky fuori dalla allowlist approvata (#335):');
    for (const test of violations) {
      console.error(`   [${test.project}] ${test.title} (${test.file})`);
    }
    console.error(
      '\nUn test flaky è un degrado reale: correggilo, oppure aggiungilo a ' +
        'e2e/flaky-allowlist.json con owner e scadenza approvati.'
    );
    process.exit(1);
  }

  console.log('✅ Nessun test flaky fuori policy.');
}

const isDirectRun =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if (isDirectRun) {
  main();
}
