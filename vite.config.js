import { defineConfig, loadEnv } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { VitePWA } from 'vite-plugin-pwa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
    // Load env file based on `mode` (development/production)
    const env = loadEnv(mode, process.cwd(), '');

    // Prioritize process.env (Vercel) over loaded .env (Local)
    const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

    console.log(`[Vite Build] Supabase URL detected: ${supabaseUrl ? 'YES' : 'NO'}`);

    return {
        root: '.',
        base: './',
        publicDir: 'public',

        // Explicitly define env vars to ensure they are injected
        define: {
            'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
            'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseKey)
        },

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
            sourcemap: true, // Useful for debugging errors in production
            minify: 'esbuild', // Enable minification for production
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
    };
});
