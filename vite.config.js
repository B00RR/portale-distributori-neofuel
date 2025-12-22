import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    root: '.',
    base: './',
    publicDir: 'assets',

    plugins: [
        VitePWA({
            registerType: 'autoUpdate',
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
                // Cache strategies
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    },
                    {
                        urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'cdn-cache',
                            expiration: {
                                maxEntries: 50,
                                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                            }
                        }
                    },
                    {
                        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'images-cache',
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                            }
                        }
                    }
                ],

                // Files to precache
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],

                // Skip waiting and claim clients
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
    }
});
