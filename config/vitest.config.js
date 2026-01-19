import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        // Ambiente di test
        environment: 'jsdom',

        // Pattern per i file di test
        include: ['tests/**/*.test.js', 'tests/**/*.spec.js'],

        // Copertura codice
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['js/**/*.js'],
            exclude: [
                'js/utils/template_chiusura_base64.js',
                'node_modules/**'
            ]
        },

        // Globals (describe, it, expect)
        globals: true,

        // Timeout per i test
        testTimeout: 10000,

        // Reporter
        reporter: ['verbose'],

        // Setup files
        setupFiles: [resolve(__dirname, '../tests/setup.js')]
    },

    // Resolve aliases (stesso di vite.config.js)
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
