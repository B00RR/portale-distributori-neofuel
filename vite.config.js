import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    root: '.',
    base: './',
    publicDir: 'public',

    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
            devOptions: {
                enabled: true
            },
            includeAssets: ['favicon.svg', 'robots.txt', 'icons/*.png'],

            manifest: {
                name: 'Neofuel Portal - Distributori',
                short_name: 'Neofuel',
                description: 'Gestione distributori di carburante Neofuel',
                theme_color: '#0A2342',
                background_color: '#0A2342',
                display: 'standalone',
                icons: [
                    {
                        src: '/icons/icon-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: '/icons/icon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            },

            workbox: {
                runtimeCaching: [],
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                skipWaiting: true,
                clientsClaim: true
            }
        })
    ],

    server: {
        port: 5173,
        open: true,
        cors: true
    },

    build: {
        target: 'es2022',
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,

        // rollupOptions: { ... } (Removed for debugging)

        minify: false, // Disabled terser for debugging
        // terserOptions: { ... }

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
    }
});
