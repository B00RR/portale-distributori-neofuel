import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    // Configurazione base
    root: '.',
    base: './',
    publicDir: 'assets',

    // Server di sviluppo
    server: {
        port: 3000,
        open: true,
        cors: true
    },

    // Build di produzione
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        minify: 'terser',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html')
            },
            output: {
                // Chunking per lazy loading
                manualChunks: {
                    'vendor-charts': ['chart.js'],
                    'vendor-pdf': ['jspdf'],
                    'admin': [
                        './js/admin.js',
                        './js/admin/dashboard.js',
                        './js/admin/stations.js',
                        './js/admin/operators.js',
                        './js/admin/shifts.js',
                        './js/admin/credits.js',
                        './js/admin/invoices.js',
                        './js/admin/vouchers_reboot.js'
                    ],
                    'operator': [
                        './js/operator.js',
                        './js/operator/closure.js',
                        './js/operator/opening.js',
                        './js/operator/credits.js',
                        './js/operator/vouchers.js'
                    ]
                }
            }
        }
    },

    // Ottimizzazioni
    optimizeDeps: {
        include: ['chart.js']
    },

    // Resolve aliases
    resolve: {
        alias: {
            '@': resolve(__dirname, 'js'),
            '@core': resolve(__dirname, 'js/core'),
            '@utils': resolve(__dirname, 'js/utils'),
            '@ui': resolve(__dirname, 'js/ui'),
            '@admin': resolve(__dirname, 'js/admin'),
            '@operator': resolve(__dirname, 'js/operator'),
            '@shared': resolve(__dirname, 'js/shared')
        }
    }
});
