import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const networkImportMockPlugin = () => ({
    name: 'network-import-mock',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
        if (id.includes('node_modules')) return;

        // Whole-file replacement for our wrappers to ensure they are 100% mocked
        if (id.endsWith('supabase-client.ts') || id.endsWith('supabase-client.js')) {
            console.log(`[Vitest Proxy] Replacing whole file: ${id}`);
            return 'export const createClient = () => { const q: any = { select: () => q, eq: () => q, order: () => q, range: () => q, limit: () => q, single: () => Promise.resolve({ data: null }), maybeSingle: () => Promise.resolve({ data: null }), then: (r: any) => r({ data: [], error: null }) }; return { from: () => q, storage: { from: () => ({ download: () => Promise.resolve({ data: { text: () => "{}" } }) }) } }; };';
        }
        if (id.endsWith('zod-client.ts') || id.endsWith('zod-client.js')) {
            console.log(`[Vitest Proxy] Replacing whole file: ${id}`);
            return 'export const z = { object: () => ({ parse: (x) => x || {}, infer: {} }), number: () => ({ min: () => ({ max: () => ({ default: () => ({}) }) }) }), boolean: () => ({ default: () => ({}) }), string: () => ({ optional: () => ({}), datetime: () => ({ optional: () => ({}) }) }), infer: (x) => x } as any;';
        }

        if (code.includes('https://')) {
            return code.replace(/import\s+(.*)\s+from\s+['"]https:\/\/.*['"];/g, (match, imports) => {
                console.log(`[Vitest Proxy] Stripping remaining network import: ${match}`);
                return `// ${match}\nconst ${imports.includes('{') ? imports : imports.trim()} = {} as any;`;
            });
        }
    }
});

export default defineConfig({
    plugins: [networkImportMockPlugin()],
    test: {
        // Ambiente HappyDOM per emulazione browser (più leggero di JSDOM)
        environment: 'happy-dom',

        // Pattern per i file di test: Supporto TS e JS
        include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],

        // Esclude test E2E (gestiti da Playwright)
        exclude: ['tests/e2e/**', 'node_modules/**'],

        // Copertura codice
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json-summary'],
            include: ['js/**/*.{js,ts}'],
            exclude: [
                'js/utils/template_chiusura_base64.js',
                'node_modules/**',
                '**/*.d.ts',
                'tests/**'
            ],
            // Ratchet floor (#44): set just below current real coverage so the gate
            // is meaningful but not flaky. Raise over time as coverage grows.
            thresholds: {
                statements: 55,
                branches: 42,
                functions: 52,
                lines: 55,
                // Per-file floors (#225): keep the once-uncovered hotspots guarded,
                // set ~10 points below achieved coverage.
                'js/admin/layout.ts': { statements: 90, lines: 90 },
                'js/admin/dashboard-config.ts': { statements: 75, lines: 75 },
                'js/operator/invoices.ts': { statements: 80, lines: 80 }
            }
        },

        // Globals (describe, it, expect) abilitati per DX stile Jest
        globals: true,

        // Timeout per evitare hanging
        testTimeout: 10000,

        // Reporter verbose per debugging
        reporters: ['verbose'],

        // Mocking behavior for network imports
        server: {
            deps: {
                inline: [
                    /https:\/\/cdn\.jsdelivr\.net/,
                    /https:\/\/unpkg\.com/
                ]
            }
        },
        // Setup files eseguiti prima dei test
        setupFiles: [resolve(__dirname, '../tests/setup.ts')],

        // Mocking automatico reset
        mockReset: true,
        restoreMocks: true
    },

    // Resolve aliases (specchiati da tsconfig)
    resolve: {
        alias: [
            { find: /.*\/core\/supabase-client$/, replacement: resolve(__dirname, '../tests/mocks/supabase-stub.ts') },
            { find: /.*\/core\/zod-client$/, replacement: resolve(__dirname, '../tests/mocks/zod-stub.ts') },
            { find: 'virtual:pwa-register', replacement: resolve(__dirname, '../tests/mocks/pwa-register.ts') },
            { find: '@', replacement: resolve(__dirname, '../js') },
            { find: '@core', replacement: resolve(__dirname, '../js/core') },
            { find: '@utils', replacement: resolve(__dirname, '../js/utils') },
            { find: '@ui', replacement: resolve(__dirname, '../js/ui') },
            { find: '@shared', replacement: resolve(__dirname, '../js/shared') }
        ]
    }
});
