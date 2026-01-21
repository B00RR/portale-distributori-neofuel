import { defineConfig } from 'vite';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    root: '.',
    base: './',
    publicDir: 'public',

    plugins: [
        VitePWA({
            injectRegister: null, // Disable auto injection, we handle it manually in app.ts
            registerType: 'prompt',
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
                runtimeCaching: [
                    // Cache images and static assets (CacheFirst)
                    {
                        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'images-assets-cache',
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
                            }
                        }
                    },
                    // Stale-While-Revalidate for JS/CSS (fast load, background update)
                    {
                        urlPattern: /\.(?:js|css)$/i,
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'static-resources-cache',
                            expiration: {
                                maxEntries: 50,
                                maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
                            }
                        }
                    },
                    // NetworkFirst for Supabase API (offline fallback)
                    {
                        urlPattern: /supabase\.co\/rest\/v1/i,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'supabase-api-cache',
                            networkTimeoutSeconds: 10,
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 24 * 60 * 60 // 24 hours
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    },
                    // NetworkFirst for Supabase Auth
                    {
                        urlPattern: /supabase\.co\/auth/i,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'supabase-auth-cache',
                            networkTimeoutSeconds: 5
                        }
                    },
                    // Cache external fonts
                    {
                        urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 365 * 24 * 60 * 60 // 1 year
                            }
                        }
                    },
                    // Cache FontAwesome icons
                    {
                        urlPattern: /^https:\/\/cdnjs\.cloudflare\.com/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'cdn-cache',
                            expiration: {
                                maxEntries: 30,
                                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
                            }
                        }
                    }
                ],
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                skipWaiting: false,
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
