import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        // Ambiente HappyDOM per emulazione browser (più leggero di JSDOM)
        environment: 'happy-dom',

        // Pattern per i file di test: Supporto TS e JS
        include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],

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
            thresholds: {
                statements: 70,
                branches: 70,
                functions: 70,
                lines: 70
            }
        },

        // Globals (describe, it, expect) abilitati per DX stile Jest
        globals: true,

        // Timeout per evitare hanging
        testTimeout: 10000,

        // Reporter verbose per debugging
        reporters: ['verbose'],

        // Setup files eseguiti prima dei test
        setupFiles: [resolve(__dirname, '../tests/setup.ts')],

        // Mocking automatico reset
        mockReset: true,
        restoreMocks: true
    },

    // Resolve aliases (specchiati da tsconfig)
    resolve: {
        alias: {
            '@': resolve(__dirname, '../js'),
            '@core': resolve(__dirname, '../js/core'),
            '@utils': resolve(__dirname, '../js/utils'),
            '@ui': resolve(__dirname, '../js/ui'),
            '@shared': resolve(__dirname, '../js/shared')
        }
    }
});
