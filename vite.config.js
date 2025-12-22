import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        target: 'es2022',
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,

        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-lit': ['lit'],
                    'vendor-supabase': ['@supabase/supabase-js']
                },
                chunkFileNames: 'assets/js/[name]-[hash].js',
                entryFileNames: 'assets/js/[name]-[hash].js',
                assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
            }
        },

        minify: 'terser',
        terserOptions: {
            compress: {
                drop_console: true,
                drop_debugger: true,
                pure_funcs: ['console.info', 'console.debug']
            },
            format: {
                comments: false
            }
        },

        chunkSizeWarningLimit: 500,
        cssCodeSplit: true
    },

    resolve: {
        alias: {
            '@': resolve(__dirname, 'js'),
            '@core': resolve(__dirname, 'js/core'),
            '@utils': resolve(__dirname, 'js/utils'),
            '@ui': resolve(__dirname, 'js/ui'),
            '@shared': resolve(__dirname, 'js/shared')
        }
    },

    server: {
        port: 5173,
        open: true
    }
});
