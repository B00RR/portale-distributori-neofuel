import { defineConfig, loadEnv } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
    // Load env file based on `mode` (development/production).
    // Vite automatically exposes VITE_-prefixed vars to the client via import.meta.env.
    // No manual `define` override is needed — it was causing crashes when env vars
    // were absent (production build, E2E tests) because JSON.stringify(undefined)
    // injected the bare `undefined` identifier instead of a string fallback.
    const env = loadEnv(mode, process.cwd(), '');

    // Log presence (not the value) for debugging build config issues
    console.log(`[Vite Build] Supabase URL detected: ${env.VITE_SUPABASE_URL ? 'YES' : 'NO'}`);

    // Fail build in production if required Supabase env vars are missing.
    // This prevents deploying a non-functional artifact because js/core/config.ts
    // throws at runtime when these values are empty.
    if (mode === 'production') {
        const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
        const missing = required.filter((key) => !env[key]);
        if (missing.length > 0) {
            throw new Error(
                `[Vite Build] Missing required environment variables: ${missing.join(', ')}. ` +
                'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in production.'
            );
        }
    }

    return {
        root: '.',
        base: './',
        publicDir: 'public',

        plugins: [
            VitePWA({
                injectRegister: null,
                registerType: 'prompt',
                devOptions: {
                    enabled: true
                },
                includeAssets: ['favicon.svg', 'robots.txt', 'icons/*.png'],

                manifest: {
                    name: 'Neofuel Portal - Distributori',
                    short_name: 'Neofuel',
                    description: 'Portale Distributori Neofuel - Gestione stazioni di servizio',
                    lang: 'it',
                    theme_color: '#0A2342',
                    background_color: '#0A2342', // Match theme color for smooth launch
                    display: 'standalone',
                    orientation: 'portrait',
                    start_url: './', // Relative start URL
                    scope: './',
                    id: '/',
                    icons: [
                        {
                            src: 'icons/icon-192x192.png',
                            sizes: '192x192',
                            type: 'image/png',
                            purpose: 'any maskable' // BEST PRACTICE
                        },
                        {
                            src: 'icons/icon-512x512.png',
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'any maskable' // BEST PRACTICE
                        }
                    ],
                    categories: ['business', 'productivity', 'finance']
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
                        // NetworkFirst for JS/CSS (prioritize fresh code, fallback to cache)
                        {
                            urlPattern: /\.(?:js|css)$/i,
                            handler: 'NetworkFirst',
                            options: {
                                cacheName: 'static-resources-cache',
                                expiration: {
                                    maxEntries: 50,
                                    maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
                                }
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
                    // #343: i vendor lazy non stanno nel precache — vengono
                    // scaricati al primo uso e poi serviti dalla runtime cache
                    // (regola NetworkFirst su js/css qui sopra).
                    globIgnores: [
                        '**/vendor-chartjs*.js',
                        '**/vendor-qrcode*.js',
                        '**/vendor-misc*.js'
                    ],
                    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
                    skipWaiting: true,
                    clientsClaim: true,
                    cleanupOutdatedCaches: true
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
            // Use hidden sourcemaps in production so error monitoring tools can
            // upload them privately without exposing source code in the deploy.
            sourcemap: mode === 'production' ? 'hidden' : true,
            minify: 'terser',
            // 1000 e non il default 500: il chunk Excel viene caricato lazy solo
            // al primo export e non pesa sullo startup dell'app.
            chunkSizeWarningLimit: 1000,
            cssCodeSplit: true,
            rollupOptions: {
                output: {
                    // Issue #123: split dei vendor pesanti fuori dal chunk principale
                    // così ogni libreria è cacheata indipendentemente dal browser/SW.
                    manualChunks(id) {
                        if (!id.includes('node_modules')) {
                            return undefined;
                        }
                        if (id.includes('chart.js') || id.includes('@kurkle')) {
                            return 'vendor-chartjs';
                        }
                        if (id.includes('html5-qrcode') || id.includes('qrcode')) {
                            return 'vendor-qrcode';
                        }
                        if (id.includes('@supabase')) {
                            return 'vendor-supabase';
                        }
                        if (id.includes('jszip') || id.includes('sortablejs') || id.includes('split.js')) {
                            return 'vendor-misc';
                        }
                        return undefined;
                    }
                }
            },
            terserOptions: {
                compress: {
                    drop_console: true,
                    drop_debugger: true
                }
            }
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
    };
});
